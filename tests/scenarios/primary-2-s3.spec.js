// @ts-check
// primary 台本 場面 3「レビュー指摘の反映」手順 2:
//   保存先の一覧から同名ラベルの混ざる rev-seq・rev-class を 1 枚ずつ開き、開いただけで本文が変わらないか、
//   図種が合うかを見る。
// 期待 (principles.md「押した対象だけが変わる」「描ける」「手書きや他の道具で作った .puml は壊さず開ける」):
//   - 2 枚とも図種が本文どおりに選ばれ、エラー無しで描ける (同名のラベル・属性がどれも描かれる)
//   - 開いただけで本文は 1 字も変わらない (同名ラベルの行・コメント・字下げもそのまま。CRLF の図は LF に揃えて読む)
//   - 2 枚を開いても保存先の 3 枚は 1 バイトも変わらず (rev-class は CRLF のまま)、ほかのファイルが増えない
//   - 1 枚を開く手数は 4 (一覧を開く 2 + 図を選ぶ 1 + 一覧を閉じる 1)。開いてから描けるまでは上限 (3 秒) 以内
// 図: tests/scenarios/fixtures/ の rev-seq・rev-class-crlf (保存先には rev-class の名で置く)・common。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const SRC = { 'rev-seq': 'rev-seq', 'rev-class': 'rev-class-crlf', common: 'common' };
const DOCS = [
  { name: 'rev-seq', type: 'plantuml-sequence', words: ['Ctl', 'Monitor', 'Open(cfg)', 'Open()', 'Read()', 'Read(1)'] },
  { name: 'rev-class', type: 'plantuml-class', words: ['Drv', 'DrvMon', 'speed : int', 'start() : void'] },
];
const FILES = Object.keys(SRC);
const OPS_PER_DOC = 4;
const RENDER_MS_MAX = 3000;

test('primary 手順2 (場面3) 保存先の一覧から同名ラベルの混ざる 2 図を開くと、図種どおりに描け、本文も保存先も変わらない', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const orig = {};
  for (const n of FILES) {
    orig[n] = fs.readFileSync(path.join(H.FIXTURES, SRC[n] + '.puml'));
    fs.writeFileSync(path.join(dir, n + '.puml'), orig[n]);
  }

  await H.bootWithSaveDir(page, S.dirFor(__filename));
  let ops = 0;

  for (const d of DOCS) {
    const text = orig[d.name].toString('utf8').replace(/\r\n/g, '\n');
    await S.openFolder(page);
    ops += 2;
    const item = page.locator('#folder-panel .folder-item[data-file-name="' + d.name + '"]').first();
    const t0 = Date.now();
    await item.dblclick();
    ops += 1;
    await expect(page.locator('#editor')).toHaveValue(text, { timeout: 20000 });
    await H.waitDrawn(page, d.words);
    const renderMs = Date.now() - t0;
    H.annotate(testInfo, 'renderMs', renderMs);
    await S.closeFolderList(page);
    ops += 1;

    // 図種は本文どおりに選ばれ、エラー無しで描ける。
    await expect(page.locator('#diagram-type'), d.name + ' の図種').toHaveValue(d.type);
    await H.expectRendered(page);
    // 開いただけでは本文は 1 字も変わらない。
    const now = await H.getEditorText(page);
    expect(now, d.name + ' の本文').toBe(text);
    H.annotate(testInfo, 'diffLines', H.diffLines(text, now));
    expect(renderMs, d.name + ' を開いてから描けるまで').toBeLessThanOrEqual(RENDER_MS_MAX);
  }

  // 同名のラベル・属性はどれも描かれている (片方に寄せて 1 つにしない)。
  const svg = await H.svgText(page);
  expect((svg.match(/speed : int/g) || []).length, 'rev-class の speed : int は 2 か所とも描かれる').toBeGreaterThanOrEqual(2);

  // 2 枚を開いても、保存先の 3 枚は 1 バイトも書き換わらない (開くことは書くことではない)。
  await page.waitForTimeout(1500);
  for (const n of FILES) {
    expect(Buffer.compare(fs.readFileSync(path.join(dir, n + '.puml')), orig[n]), n + '.puml は 1 バイトも変わらない').toBe(0);
  }
  expect(fs.readdirSync(dir).sort(), '保存先にほかのファイルが増えない').toEqual(FILES.map((n) => n + '.puml').sort());
  expect(ops).toBe(OPS_PER_DOC * DOCS.length);
  H.annotate(testInfo, 'ops', ops);
});
