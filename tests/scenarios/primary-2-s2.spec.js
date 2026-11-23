// @ts-check
// primary 台本 場面 2「手書きの既存の図を開いて直す」手順 2:
//   保存先の一覧から hand-seq・hand-state・hand-class を 1 枚ずつ開き、図種どおりに `!include` を含めて描けるか、
//   開いただけで本文と common.puml が変わらないかを見る。
// 期待 (principles.md「押した対象だけが変わる」「描ける」「手書きや他の道具で作った .puml は壊さず開ける」):
//   - 3 枚とも図種が本文どおりに選ばれ、エラー無しで描ける
//   - `!include common.puml` が効いて描ける (common の `skinparam defaultFontSize 12` が描いた文字に出る)
//   - 開いただけで本文は 1 字も変わらない (コメント・字下げ・skinparam・!include の行もそのまま)
//   - 3 枚を開いても保存先の 4 枚 (common.puml を含む) は 1 バイトも変わらず、ほかのファイルが増えない
//   - 1 枚を開く手数は 4 (一覧を開く 2 + 図を選ぶ 1 + 一覧を閉じる 1)。開いてから描けるまでは上限 (3 秒) 以内
// 図: tests/scenarios/fixtures/ の hand-seq・hand-state・hand-class・common (自作の小さい図)。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const DOCS = [
  { name: 'hand-seq', type: 'plantuml-sequence', words: ['Drv', 'Open()', 'ready', 'Poll()'] },
  { name: 'hand-state', type: 'plantuml-state', words: ['Idle', 'Busy', 'Slow', 'Throttle'] },
  { name: 'hand-class', type: 'plantuml-class', words: ['Drv', 'Mon', 'rate : uint16'] },
];
const FILES = ['common'].concat(DOCS.map((d) => d.name));
const OPS_PER_DOC = 4;
const RENDER_MS_MAX = 3000;

// 描いた SVG の文字の大きさ (font-size) の一覧。common.puml の defaultFontSize 12 が効いたかを見る。
async function svgFontSizes(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#preview-svg svg');
    if (!svg) return [];
    return Array.from(svg.querySelectorAll('text')).map((t) => t.getAttribute('font-size') || '');
  });
}

test('primary 手順2 (場面2) 保存先の一覧から手書きの 3 図を開くと、!include を含めて描け、本文と common.puml が変わらない', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const orig = {};
  for (const n of FILES) {
    orig[n] = fs.readFileSync(path.join(H.FIXTURES, n + '.puml'));
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
    // !include common.puml が効いている: common の defaultFontSize 12 で文字が描かれる。
    const sizes = await svgFontSizes(page);
    expect(sizes, d.name + ' の文字の大きさ (common.puml の defaultFontSize 12)').toContain('12');
    // 開いただけでは本文は 1 字も変わらない (コメント・字下げ・skinparam・!include もそのまま)。
    const now = await H.getEditorText(page);
    expect(now, d.name + ' の本文').toBe(text);
    H.annotate(testInfo, 'diffLines', H.diffLines(text, now));
    expect(now).toMatch(/^!include common\.puml$/m);
    expect(renderMs, d.name + ' を開いてから描けるまで').toBeLessThanOrEqual(RENDER_MS_MAX);
  }

  // 3 枚を開いても、保存先の 4 枚は 1 バイトも書き換わらない (開くことは書くことではない)。
  await page.waitForTimeout(1500);
  for (const n of FILES) {
    expect(Buffer.compare(fs.readFileSync(path.join(dir, n + '.puml')), orig[n]), n + '.puml は 1 バイトも変わらない').toBe(0);
  }
  expect(fs.readdirSync(dir).sort(), '保存先にほかのファイルが増えない').toEqual(FILES.map((n) => n + '.puml').sort());
  expect(ops).toBe(OPS_PER_DOC * DOCS.length);
  H.annotate(testInfo, 'ops', ops);
});
