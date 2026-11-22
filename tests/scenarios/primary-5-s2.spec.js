// @ts-check
// primary 台本 場面 2「手書きの既存の図を開いて直す」手順 5:
//   直した図を保存し、改行コード・文字コードが元のまま保たれたかを、ファイルを別の道具で開かずに
//   下端の 1 語 (例: CRLF · UTF-8 BOM) で確かめる (TICKET-primary-20261115-2120-wish)。
// 期待 (principles.md「押した対象だけが変わる」「描ける」「同じ本文からは同じバイト列が保存される」):
//   - CRLF・BOM 付きの手書きの図を保存先の一覧から開くと、下端に「CRLF · UTF-8 BOM」が出る
//   - LF・BOM 無しの図のタブへ替えると「LF · UTF-8」、戻すと「CRLF · UTF-8 BOM」(今のタブの値)
//   - 1 か所直して Ctrl+S した後も「CRLF · UTF-8 BOM」のままで、ディスクのバイトもその値
//     (先頭の BOM・全行 CRLF・直した 1 行だけが変わる)
//   - 直した図が描ける
// 図: tests/scenarios/fixtures/ の hand-class・hand-seq・common (自作の小さい図)。置くときに改行・BOM を決めて書く。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);

async function clickHit(page, locator, what) {
  await expect(locator).toBeAttached({ timeout: 15000 });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('overlay box not found: ' + what);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function openPinned(page, name, text) {
  await S.openFolder(page);
  await page.locator('#folder-panel .folder-item[data-file-name="' + name + '"]').first().dblclick();
  await expect(page.locator('#editor')).toHaveValue(text, { timeout: 20000 });
  await S.closeFolderList(page);
}

test('primary 手順5 (場面2) 下端の 1 語で今のタブの改行・文字コードが分かり、保存後もディスクのバイトと一致する', async ({ page }, testInfo) => {
  test.setTimeout(120 * 1000);
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const lf = (n) => H.fixture(n + '.puml').replace(/\r\n/g, '\n');
  const classLf = lf('hand-class');
  const seqLf = lf('hand-seq');
  const classFile = path.join(dir, 'hand-class.puml');
  const seqFile = path.join(dir, 'hand-seq.puml');
  // 取り出し方 (autocrlf) に左右されないよう、置くバイトはここで決める。
  fs.writeFileSync(classFile, Buffer.concat([BOM, Buffer.from(classLf.replace(/\n/g, '\r\n'), 'utf8')]));
  fs.writeFileSync(seqFile, Buffer.from(seqLf, 'utf8'));
  fs.writeFileSync(path.join(dir, 'common.puml'), Buffer.from(lf('common'), 'utf8'));
  const seqBytes = fs.readFileSync(seqFile);

  await H.bootWithSaveDir(page, S.dirFor(__filename));
  const fmt = page.locator('#status-format');
  let ops = 0;

  // 開く: CRLF・BOM の手書きのクラス図。
  await openPinned(page, 'hand-class', classLf);
  ops += 3;
  await H.waitDrawn(page, ['Drv', 'rate : uint16']);
  await expect(fmt).toBeVisible();
  await expect(fmt).toHaveText('CRLF · UTF-8 BOM');

  // 別のタブ (LF・BOM 無し) へ替えるとそのタブの値、戻すと元の値。
  await openPinned(page, 'hand-seq', seqLf);
  ops += 3;
  await expect(fmt).toHaveText('LF · UTF-8');
  await page.locator('#tab-bar .tab[data-doc-name="hand-class"] .tab-label').click();
  ops += 1;
  await expect(page.locator('#editor')).toHaveValue(classLf, { timeout: 10000 });
  await expect(fmt).toHaveText('CRLF · UTF-8 BOM');

  // 1 か所直す (Drv の属性 rate の型を uint16 → uint32)。
  await H.waitDrawn(page, ['Drv', 'rate : uint16']);
  const lineNo = classLf.split('\n').indexOf('  - rate : uint16') + 1;
  expect(lineNo).toBeGreaterThan(0);
  const r = await H.measure(page, testInfo, async () => {
    const hit = page.locator('#overlay-layer rect[data-type="member"][data-parent-id="Drv"][data-line="' + lineNo + '"]').first();
    await clickHit(page, hit, 'member rate (line ' + lineNo + ')');
    const mi = await hit.getAttribute('data-member-index');
    const type = page.locator('#cl-mem-type-' + mi);
    if (!(await type.isVisible())) await page.locator('#cl-mem-edit-' + mi).click();
    await expect(type).toHaveValue('uint16');
    await type.fill('uint32');
    await page.locator('#cl-mem-update-' + mi).click();
  }, ['rate : uint32']);
  ops += 4;
  expect(r.diffLines).toBe(2);
  expect(H.removedLines(r.before, r.after)).toEqual(['  - rate : uint16']);

  // 保存 (本文の欄で Ctrl+S)。
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  ops += 2;
  await expect(page.locator('#status-save-result')).toContainText('保存しました', { timeout: 20000 });
  H.annotate(testInfo, 'ops', ops);

  // 保存後も同じ 1 語で、ディスクのバイトがその値 (BOM + 全行 CRLF、直した 1 行だけが違う)。
  await expect(fmt).toHaveText('CRLF · UTF-8 BOM');
  const edited = await H.getEditorText(page);
  const want = Buffer.concat([BOM, Buffer.from(edited.replace(/\n/g, '\r\n'), 'utf8')]);
  await expect.poll(() => Buffer.compare(fs.readFileSync(classFile), want), { timeout: 10000 }).toBe(0);
  const saved = fs.readFileSync(classFile);
  expect(saved.subarray(0, 3).equals(BOM), '先頭の BOM が残る').toBe(true);
  expect(/(^|[^\r])\n/.test(saved.toString('utf8')), '素の LF が混ざらない').toBe(false);
  expect(H.diffLines(classLf, edited)).toBe(2);
  // 直していない図は 1 バイトも変わらない。
  expect(Buffer.compare(fs.readFileSync(seqFile), seqBytes), 'hand-seq は変わらない').toBe(0);

  // 描ける
  await H.expectRendered(page);
  await H.waitDrawn(page, ['rate : uint32']);
  await page.screenshot({ path: testInfo.outputPath('status-format.png') });
});
