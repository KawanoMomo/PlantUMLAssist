// @ts-check
// primary 台本 場面 1「設計変更の反映」手順 6:
//   直した図 (before / after の .puml と書き出した SVG) を out\scene1\ に置き、reviewer に渡す一覧
//   (ファイル名・図種・差分行数・気づき) を書く。
// 期待 (principles.md「押した対象だけが変わる」「描ける」「操作コストは計る」):
//   - 保存先の seq-1 を一覧から開き、メッセージを 1 本足して Ctrl+S すると、保存した after と before の差分は
//     足した 1 行だけ (ほかの行・コメント・字下げは 1 字も動かない)
//   - Export ▾「SVGとして保存」で書き出した SVG は .puml と対の名前 (seq-1.svg) で、空でなく、足したメッセージと
//     元の参加者が描かれている
//   - 一覧に書く差分行数は before / after から数えた値と一致する。手数は台本の操作の 2 倍以内、足してから描けるまで 3 秒以内
// 出力先は試験用の test-results の下 (persona_data の実体には書かない)。図: tests/scenarios/fixtures/seq-1.puml。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const NAME = 'seq-1';
const MSG = { from: 'SpiDrv', to: 'Hw', label: 'WriteReg(BAUD)' };
// 台本の操作: 開く 4 (一覧を開く 2・選ぶ 1・閉じる 1) + メッセージ 1 本 5 + 保存 1 + SVG の書き出し 2。
const SCRIPT_OPS = 12;
const RENDER_MS_MAX = 3000;

// 一覧から開いた図に最初に書き戻すとき「開いたファイルを上書きしますか」を聞く版がある。
// 聞かれたら「このファイルを書き換える」と答える (聞かない版ではそのまま進む)。答えたら 1 操作と数える。
async function answerLockIfAsked(page) {
  const modal = page.locator('#source-lock-modal');
  const asked = await modal.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false);
  if (!asked) return 0;
  await page.locator('#source-lock-overwrite').click();
  await expect(modal).toBeHidden({ timeout: 10000 });
  return 1;
}

test('primary 手順6 直した図の before / after と書き出した SVG を置き、差分行数が一覧と合う', async ({ page }, testInfo) => {
  test.setTimeout(120 * 1000);
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const before = H.fixture(NAME + '.puml').replace(/\r\n/g, '\n');
  fs.writeFileSync(path.join(dir, NAME + '.puml'), before, 'utf8');
  const out = path.join(dir, '..', 'primary-6-out', 'scene1');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  await S.bootWithSaveDir(page, S.dirFor(__filename));
  let ops = 0;

  // 直す図を保存先の一覧から開く。
  await S.openFolder(page);
  await page.locator('#folder-panel .folder-item[data-file-name="' + NAME + '"]').first().dblclick();
  await expect(page.locator('#editor')).toHaveValue(before, { timeout: 20000 });
  await S.closeFolderList(page);
  ops += 4;
  await H.waitDrawn(page, ['SpiDrvMon', 'Spi_Init()']);

  // メッセージを 1 本、末尾に追加の「メッセージ」から足す。
  const r = await H.measure(page, testInfo, async () => {
    await page.locator('#seq-tail-kind-chip-message').click();
    await page.locator('#seq-tail-from').selectOption(MSG.from);
    await page.locator('#seq-tail-to').selectOption(MSG.to);
    await page.locator('#seq-tail-label-rle .rle-textarea').fill(MSG.label);
    await page.locator('#seq-tail-add').click();
  }, [MSG.label]);
  ops += 5;
  expect(r.diffLines).toBe(1);
  expect(r.renderMs).toBeLessThanOrEqual(RENDER_MS_MAX);
  ops += await answerLockIfAsked(page);

  // 保存 (実キー)。
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  ops += 1;
  await expect(page.locator('#status-save-result')).toContainText('保存しました', { timeout: 20000 });
  const savedFile = path.join(dir, NAME + '.puml');
  await expect.poll(() => fs.readFileSync(savedFile, 'utf8'), { timeout: 10000 }).toContain(MSG.label);
  const after = fs.readFileSync(savedFile, 'utf8');

  // before と after の差分は足した 1 行だけ。消えた行は無い。
  expect(H.removedLines(before, after)).toEqual([]);
  const diff = H.diffLines(before, after);
  expect(diff).toBe(1);
  expect(after).toContain("' 手で整えた図。字下げとコメントは道具に崩させない");
  expect(after).toContain('  SpiDrv -> Hw : WriteReg(CTRL)');

  // Export ▾「SVGとして保存」。.puml と対の名前で、空でない SVG が出る。
  const download = await S.exportVia(page, 'exp-svg');
  ops += 2;
  expect(download).not.toBeNull();
  if (!download) return;
  expect(download.suggestedFilename()).toBe(NAME + '.svg');
  const svgPath = path.join(out, NAME + '.svg');
  await download.saveAs(svgPath);
  const svg = fs.readFileSync(svgPath, 'utf8');
  expect(svg).toContain('<svg');
  const texts = await page.evaluate((s) => {
    const doc = new DOMParser().parseFromString(s, 'image/svg+xml');
    return Array.from(doc.querySelectorAll('text')).map((t) => (t.textContent || '').trim());
  }, svg);
  for (const w of [MSG.label, 'SpiDrv', 'SpiDrvMon', 'Hw', 'Spi_Init()']) {
    expect(texts, 'SVG に ' + w).toContain(w);
  }

  // out\scene1\ に before / after と一覧を置く (ファイル名・図種・差分行数・気づき)。
  fs.writeFileSync(path.join(out, NAME + '.before.puml'), before, 'utf8');
  fs.writeFileSync(path.join(out, NAME + '.after.puml'), after, 'utf8');
  const kind = await page.locator('#diagram-type').inputValue();
  expect(kind).toBe('plantuml-sequence');
  const list = [
    '| ファイル | 図種 | 差分行数 | 気づき |',
    '|---|---|---|---|',
    '| ' + NAME + '.puml / ' + NAME + '.svg | ' + kind + ' | ' + diff + ' | ' + MSG.from + ' -> ' + MSG.to + ' : ' + MSG.label + ' を 1 本足した |',
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(out, 'handoff.md'), list, 'utf8');
  expect(fs.readdirSync(out).sort()).toEqual(['handoff.md', NAME + '.after.puml', NAME + '.before.puml', NAME + '.svg']);
  // 一覧の差分行数は、置いた before / after から数え直しても同じ。
  const placedDiff = H.diffLines(fs.readFileSync(path.join(out, NAME + '.before.puml'), 'utf8'),
    fs.readFileSync(path.join(out, NAME + '.after.puml'), 'utf8'));
  expect(fs.readFileSync(path.join(out, 'handoff.md'), 'utf8')).toContain('| ' + placedDiff + ' |');

  H.annotate(testInfo, 'ops', ops);
  expect(ops).toBeLessThanOrEqual(SCRIPT_OPS * 2);
  await H.expectRendered(page);
});
