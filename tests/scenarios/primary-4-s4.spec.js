// @ts-check
// primary 台本 場面 4「書き出し」手順 4:
//   直し 1 本 (rev-seq の `Open()` の 1 本) を GUI で入れ、もう一度書き出して、直した 1 本だけが変わるか見る。
//   台本では persona-data の export-s4 の rev-seq を使うが、scenario は persona-data を読まず
//   fixture の hand-seq (と `!include` する common.puml) を使う。もう 1 枚 (hand-state) は直さずに書き出して比べる。
// 期待 (principles.md「押した対象だけが変わる」「描ける」):
//   - 図の `Open()` のメッセージを押して右パネルの文言を書き換えると、本文の差分は `Drv -> Bus : Open()` の 1 行だけ
//     (消えた 1 行 + 足した 1 行 = 2)。ほかの行 (コメント・字下げ・skinparam・!include) は 1 字も動かない
//   - 直す前と後で書き出した SVG の文字 (<text>) は、直した 1 本の文言だけが入れ替わり、ほかの文字は同じ並びで残る
//   - 直していない hand-state の SVG は、hand-seq を直す前と後で文字が同じ
//   - 操作から描画までは上限 (3 秒) 以内。手数は 図を開く 3 + 一覧を閉じる 1 + 書き出し 2 + 直し 1 + 書き出し 2
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const RENDER_MS_MAX = 3000;
const FILES = ['common', 'hand-seq', 'hand-state'];
const SEQ_WORDS = ['Drv', 'Open()', 'ready', 'Poll()'];
const STATE_WORDS = ['Idle', 'Busy', 'Slow', 'Throttle'];
const LINE = 'Drv -> Bus : Open()';
const NEW_LINE = 'Drv -> Bus : Open(port)';

function svgTexts(svg) {
  const out = [];
  const re = /<text\b[^>]*>([^<]*)<\/text>/g;
  let m;
  while ((m = re.exec(svg))) out.push(m[1]);
  return out;
}

async function clickHit(page, locator, what) {
  await expect(locator).toBeAttached({ timeout: 15000 });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('overlay box not found: ' + what);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function openDoc(page, name, text, words) {
  await S.openFolder(page);
  await page.locator('#folder-panel .folder-item[data-file-name="' + name + '"]').first().dblclick();
  await expect(page.locator('#editor')).toHaveValue(text, { timeout: 20000 });
  await H.waitDrawn(page, words);
  await S.closeFolderList(page);
  await H.expectRendered(page);
}

// 保存先から開いた図の SVG は図と同じフォルダに図の名前で書かれる (TICKET-primary-20261115-2240-wish)。
// 書いた直後の中身を読む (同じ図を書き出し直すと同じ名前を上書きする)。
async function exportSvg(page, testInfo, label) {
  const r = await S.exportToFolder(page, 'exp-svg');
  expect(r.path, label + ' の SVG を保存先に書く').toMatch(/\.svg$/);
  const svg = fs.readFileSync(r.path, 'utf8');
  fs.writeFileSync(testInfo.outputPath(label + '.svg'), svg);
  expect(svg, label).toContain('<svg');
  expect(svg, label).toContain('</svg>');
  return svg;
}

test('primary 手順4 (場面4) Open() の 1 本を GUI で直して書き出し直すと、本文も SVG も直した 1 本だけが変わる', async ({ page }, testInfo) => {
  test.setTimeout(150 * 1000);
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const orig = {};
  for (const n of FILES) {
    orig[n] = fs.readFileSync(path.join(H.FIXTURES, n + '.puml'));
    fs.writeFileSync(path.join(dir, n + '.puml'), orig[n]);
  }
  const seqText = orig['hand-seq'].toString('utf8').replace(/\r\n/g, '\n');
  const stateText = orig['hand-state'].toString('utf8').replace(/\r\n/g, '\n');
  await H.bootWithSaveDir(page, S.dirFor(__filename));
  let ops = 0;

  // 直さない図 (hand-state) を先に書き出しておく。
  await openDoc(page, 'hand-state', stateText, STATE_WORDS);
  const stateBefore = await exportSvg(page, testInfo, 'hand-state.before');

  // hand-seq を開き、直す前に書き出す。
  await openDoc(page, 'hand-seq', seqText, SEQ_WORDS);
  ops += 4;
  const seqBefore = await exportSvg(page, testInfo, 'hand-seq.before');
  ops += 2;

  // 図の Open() のメッセージを押し、右パネルの文言を書き換える。
  const lines = seqText.split('\n');
  const lineNo = lines.indexOf(LINE) + 1;
  expect(lineNo, 'hand-seq に Open() の行がある').toBeGreaterThan(0);
  const r = await H.measure(page, testInfo, async () => {
    const hit = page.locator('#overlay-layer rect[data-type="message"][data-line="' + lineNo + '"]').first();
    await clickHit(page, hit, 'message line ' + lineNo);
    const ta = page.locator('.rle-textarea:visible').first();
    await ta.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Open(port)');
    await page.keyboard.press('Tab');
  }, ['Open(port)']);
  ops += 1;
  expect(r.diffLines, 'hand-seq の差分行数').toBe(2);
  expect(H.removedLines(r.before, r.after), '消えた行').toEqual([LINE]);
  expect(H.removedLines(r.after, r.before), '足した行').toEqual([NEW_LINE]);
  const afterLines = r.after.split('\n');
  expect(afterLines.length).toBe(lines.length);
  for (let i = 0; i < lines.length; i++) {
    if (i !== lineNo - 1) expect(afterLines[i], 'hand-seq の ' + (i + 1) + ' 行目').toBe(lines[i]);
  }
  expect(afterLines[lineNo - 1]).toBe(NEW_LINE);
  await H.expectRendered(page);
  expect(r.renderMs, '直しから描画まで').toBeLessThanOrEqual(RENDER_MS_MAX);

  // もう一度書き出す。SVG の文字は直した 1 本の文言だけが入れ替わる。
  const seqAfter = await exportSvg(page, testInfo, 'hand-seq.after');
  ops += 2;
  const tb = svgTexts(seqBefore);
  const ta = svgTexts(seqAfter);
  expect(tb.length, '直す前の SVG の文字の数').toBeGreaterThan(4);
  expect(ta.length, '直した後の SVG の文字の数は同じ').toBe(tb.length);
  const changed = [];
  for (let i = 0; i < tb.length; i++) if (tb[i] !== ta[i]) changed.push([tb[i], ta[i]]);
  expect(changed, 'SVG で変わった文字は直した 1 本だけ').toEqual([['Open()', 'Open(port)']]);

  // 直していない hand-state の書き出しは変わらない。
  await openDoc(page, 'hand-state', stateText, STATE_WORDS);
  const stateAfter = await exportSvg(page, testInfo, 'hand-state.after');
  expect(svgTexts(stateAfter), 'hand-state の SVG の文字').toEqual(svgTexts(stateBefore));

  // !include される common.puml と直していない hand-state.puml は 1 バイトも変わらない。
  await page.waitForTimeout(1500);
  for (const n of ['common', 'hand-state']) {
    expect(Buffer.compare(fs.readFileSync(path.join(dir, n + '.puml')), orig[n]), n + '.puml は変わらない').toBe(0);
  }
  H.annotate(testInfo, 'ops', ops);
  expect(ops).toBe(9);
});
