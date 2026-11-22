// @ts-check
// TICKET-roadmap-20261122-0855-2 (roadmap/v6.0.md 必須 3・クライテリア 3):
//   保存先の下のサブフォルダを FILES ツリーに階層のまま出し、その図を開く・直す・保存する・名前で探すをその場でできるようにする。
// 期待:
//   (1) 利用者の初回と同じ既定の画面・実マウスで、保存先の 2 階層下の図を FILES から クリック 4 以内で開けて図種どおり描け
//       (renderMs 1000 以下)、開いただけでは保存先以下の全ファイルがバイト一致。.puml の無いフォルダも行に出る。
//       パンくずは保存先からの道 (保存先 / design / api) を言う
//   (2) 同じ図に要素を 1 つ足して Ctrl+S → 差分はその図の 1 行 (diffLines 1。改行コード・字下げ・コメントを保つ)、
//       保存先以下の他の全ファイルはバイト一致、増えたファイル 0。Ctrl+Z 1 回で足した 1 行だけが戻る
//   (3) 直下とサブフォルダに同じ名前の図があるとき、絞り込み欄と Ctrl+P でフォルダを見分けて選べ、選んだ方が開く。
//       開くだけではどちらのファイルも変わらない
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

// dir 以下の全ファイル → 相対パスと中身 (バイト)。
function snapshot(dir) {
  const out = {};
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p).split(path.sep).join('/')] = fs.readFileSync(p).toString('base64');
    }
  })(dir);
  return out;
}

async function mouseClick(page, locator, opts) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, opts);
}

// 手で書いた CRLF の図 (行コメント・字下げ入り)。
const SUB_LF = [
  '@startuml',
  "' GPIO 初期化 (サブフォルダの図)",
  'participant App',
  'participant GpioDrv',
  '  App -> GpioDrv : Gpio_Init()',
  'GpioDrv --> App : E_OK',
  '@enduml',
  '',
].join('\n');
const TOP_LF = '@startuml\nA -> B : top\n@enduml\n';

function prepare(name) {
  const dir = path.join(S.absDirFor(__filename), name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'design', 'api'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'design', 'old'), { recursive: true });
  return dir;
}

test('roadmap 0855-2 保存先の 2 階層下の図を FILES からクリック 4 以内で開いて描け、1 つ足して Ctrl+S した差分はその図の 1 行だけ', async ({ page }, testInfo) => {
  test.setTimeout(120 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const dir = prepare('t1');
  const subFile = path.join(dir, 'design', 'api', 'gpio_seq.puml');
  fs.writeFileSync(subFile, Buffer.from(SUB_LF.replace(/\n/g, '\r\n'), 'utf8'));
  fs.writeFileSync(path.join(dir, 'top.puml'), TOP_LF);
  fs.writeFileSync(path.join(dir, 'design', 'notes.md'), '# notes\n');
  const before = snapshot(dir);

  await H.bootWithSaveDir(page, S.dirFor(__filename) + '/t1');
  // 直下の図は今までどおり行に出る。サブフォルダは畳んだフォルダの行で出る (.puml の無い old も)。
  await expect(page.locator('#files-parts .files-part-file[data-file-name="top"]')).toHaveCount(1);
  const design = page.locator('#files-subtree .files-sub-dir[data-sub-rel="design"]');
  await expect(design).toHaveCount(1, { timeout: 10000 });
  await expect(design).toHaveAttribute('aria-expanded', 'false');

  let clicks = 0;
  await mouseClick(page, design); clicks++;
  await expect(design).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#files-subtree .files-sub-dir[data-sub-rel="design/old"]')).toHaveCount(1);
  const api = page.locator('#files-subtree .files-sub-dir[data-sub-rel="design/api"]');
  await mouseClick(page, api); clicks++;
  const row = page.locator('#files-subtree .files-sub-file[data-sub-rel="design/api"][data-file-name="gpio_seq"]');
  await expect(row).toBeVisible();
  const t0 = Date.now();
  await mouseClick(page, row); clicks++;
  await H.waitDrawn(page, ['GpioDrv', 'Gpio_Init()']);
  const openMs = Date.now() - t0;
  H.annotate(testInfo, 'renderMs', openMs);
  H.annotate(testInfo, 'hands', 'clicks=' + clicks);
  expect(clicks).toBeLessThanOrEqual(4);
  expect(openMs).toBeLessThanOrEqual(1000);
  await expect(page.locator('#diagram-type')).toHaveValue('plantuml-sequence');
  expect(await H.getEditorText(page)).toBe(SUB_LF);
  // パンくずは保存先からの道。開いただけのタブは未保存の印 (○ / ●) を持たない。
  await expect(page.locator('#top-crumbs .top-crumb')).toHaveText(['t1', 'design', 'api']);
  const tab = page.locator('#tab-bar .tab[data-sub-rel="design/api"][data-doc-name="gpio_seq"]');
  await expect(tab).toHaveCount(1);
  await expect(tab).not.toHaveClass(/(^|\s)dirty(\s|$)/);
  await page.screenshot({ path: testInfo.outputPath('opened.png') });
  // 開いただけでは何も書かない (自動保存の間隔より長く待つ)。
  await page.waitForTimeout(1500);
  expect(snapshot(dir)).toEqual(before);

  // 要素 (メッセージ) を 1 つ足す。
  const label = 'Gpio_Write()';
  const chip = page.locator('#seq-tail-kind-chip-message');
  const rm = await H.measure(page, testInfo, async () => {
    await chip.click();
    await page.locator('#seq-tail-from').selectOption('App');
    await page.locator('#seq-tail-to').selectOption('GpioDrv');
    await page.locator('#seq-tail-label-rle .rle-textarea').fill(label);
    await page.locator('#seq-tail-add').click();
  }, [label]);
  expect(rm.diffLines).toBe(1);
  expect(rm.renderMs).toBeLessThanOrEqual(1000);
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  await expect(page.locator('#status-save-result')).toContainText('保存しました', { timeout: 20000 });
  await expect(tab).not.toHaveClass(/(^|\s)dirty(\s|$)/);
  const want = Buffer.from(rm.after.replace(/\n/g, '\r\n'), 'utf8');
  await expect.poll(() => Buffer.compare(fs.readFileSync(subFile), want), { timeout: 10000 }).toBe(0);
  const savedLf = fs.readFileSync(subFile, 'utf8').replace(/\r\n/g, '\n');
  expect(H.diffLines(SUB_LF, savedLf)).toBe(1);
  expect(/(^|[^\r])\n/.test(fs.readFileSync(subFile, 'utf8')), '素の LF が混ざらない').toBe(false);
  expect(H.removedLines(SUB_LF, savedLf)).toEqual([]);
  await page.waitForTimeout(1500);   // 自動保存が走り終える間を置いてから数える
  const after = snapshot(dir);
  // 変わったのはその 1 枚だけ。増えたファイル 0 (保存先に控え・印・設定を置かない)。
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  for (const k of Object.keys(before)) {
    if (k === 'design/api/gpio_seq.puml') continue;
    expect(after[k], k).toBe(before[k]);
  }
  await page.screenshot({ path: testInfo.outputPath('saved.png') });

  // Ctrl+Z 1 回で足した 1 行だけが戻る。もう一度保存すると元のバイト列に戻る。
  await page.locator('#editor').click();
  await page.keyboard.press('Control+z');
  await expect.poll(() => H.getEditorText(page), { timeout: 5000 }).toBe(SUB_LF);
  await page.keyboard.press('Control+s');
  await expect(page.locator('#status-save-result')).toContainText('保存しました', { timeout: 20000 });
  await expect.poll(() => snapshot(dir), { timeout: 10000 }).toEqual(before);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('roadmap 0855-2 直下とサブフォルダに同じ名前の図があるとき、絞り込み欄と Ctrl+P でフォルダを見分けて選べ、選んだ方が開く', async ({ page }, testInfo) => {
  test.setTimeout(120 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const dir = prepare('t2');
  fs.writeFileSync(path.join(dir, 'gpio_seq.puml'), '@startuml\nApp -> RootOnly : top\n@enduml\n');
  fs.writeFileSync(path.join(dir, 'design', 'api', 'gpio_seq.puml'), '@startuml\nApp -> SubOnly : sub\n@enduml\n');
  const before = snapshot(dir);

  await H.bootWithSaveDir(page, S.dirFor(__filename) + '/t2');
  await expect(page.locator('#files-subtree .files-sub-dir[data-sub-rel="design"]')).toHaveCount(1, { timeout: 10000 });

  // 絞り込み欄: 畳んだフォルダの奥の同じ名前の図も、フォルダの道を添えて並ぶ。
  await page.locator('#files-filter').fill('gpio');
  const subRow = page.locator('#files-subtree .files-sub-file[data-sub-rel="design/api"][data-file-name="gpio_seq"]');
  const topRow = page.locator('#files-parts .files-part-file[data-file-name="gpio_seq"]');
  await expect(subRow).toBeVisible();
  await expect(subRow.locator('.files-row-path')).toHaveText('design/api/');
  await expect(topRow).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('filter.png') });
  await mouseClick(page, subRow);
  await expect.poll(() => H.getEditorText(page), { timeout: 10000 }).toContain('SubOnly');
  await H.waitDrawn(page, ['SubOnly']);
  await expect(page.locator('#top-crumbs .top-crumb')).toHaveText(['t2', 'design', 'api']);
  await mouseClick(page, topRow);
  await expect.poll(() => H.getEditorText(page), { timeout: 10000 }).toContain('RootOnly');
  await H.waitDrawn(page, ['RootOnly']);
  // 直下の図はサブフォルダの図の「読み直し」ではない (同じタブの中身を差し替えたとは言わない)。
  await expect(page.getByText('保存フォルダの内容に差し替えました')).toHaveCount(0);
  await expect(page.locator('#top-crumbs .top-crumb')).toHaveText(['t2']);
  await page.locator('#files-filter').fill('');

  // Ctrl+P: 直下は名前、サブフォルダは「フォルダ/名前」で並ぶ。サブフォルダの方を選ぶとそれが開く。
  await page.locator('#editor').click();
  await page.keyboard.press('Control+p');
  await expect(page.locator('#cp-input')).toBeVisible();
  await expect(page.locator('#cp-input')).toBeFocused();
  await page.keyboard.type('gpio');
  const cpRow = (title) => page.locator('.cp-item', { has: page.locator('.cp-title', { hasText: new RegExp('^' + title.replace(/[/]/g, '\\/') + '$') }) });
  const cpSub = cpRow('design/api/gpio_seq');
  const cpTop = cpRow('gpio_seq');
  await expect(cpSub).toHaveCount(1);
  await expect(cpSub).toBeVisible();
  await expect(cpTop).toHaveCount(1);
  await expect(cpTop).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('ctrl-p.png') });
  await mouseClick(page, cpSub);
  await expect.poll(() => H.getEditorText(page), { timeout: 10000 }).toContain('SubOnly');
  await H.waitDrawn(page, ['SubOnly']);
  // 直下の同じ名前の図のタブとは別のタブ (名前を付け替えない)。
  const subTab = page.locator('#tab-bar .tab[data-sub-rel="design/api"][data-doc-name="gpio_seq"]');
  await expect(subTab).toHaveCount(1);
  // Ctrl+P で直下の方を選ぶとそちらが開く。
  await page.locator('#editor').click();
  await page.keyboard.press('Control+p');
  await expect(page.locator('#cp-input')).toBeVisible();
  await expect(page.locator('#cp-input')).toBeFocused();
  await page.keyboard.type('gpio');
  await mouseClick(page, cpTop);
  await expect.poll(() => H.getEditorText(page), { timeout: 10000 }).toContain('RootOnly');

  // 開く・絞る・選ぶだけでは、どちらのファイルも変わらない。
  await page.waitForTimeout(1500);
  expect(snapshot(dir)).toEqual(before);
  expect(errors, errors.join('\n')).toEqual([]);
});
