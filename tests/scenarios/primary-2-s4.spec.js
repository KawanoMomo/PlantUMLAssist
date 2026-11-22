// @ts-check
// primary 台本 場面 4「書き出し」手順 2:
//   保存先の一覧から 3 枚 (シーケンス・状態遷移・クラス) を 1 枚ずつ開き、Export ▾ の「SVGとして保存」
//   「PNGとして保存」「PNG（透過背景）」で 1 枚ずつ書き出す。
//   台本では persona-data の export-s4 の rev-seq・rev-class・hand-state を使うが、scenario は persona-data を
//   読まず fixture の hand-seq・hand-state・hand-class (と `!include` する common.puml) を使う。
// 期待 (principles.md「押した対象だけが変わる」「描ける」):
//   - 開いた図は図種どおりに選ばれ、エラー無しで描け、開いただけで本文は 1 字も変わらない
//   - 書き出した 3 形式はどれも受け取れる: SVG は図の文字を持つ `<svg`、PNG・透過 PNG は PNG の署名を持ち、
//     寸法は書き出した SVG の viewBox と 2px 以内で一致する (図が切れていない)
//   - 書き出しても本文は 1 行も動かず、保存先の .puml は 1 バイトも変わらず、保存先にほかのファイルが増えない
//     (書き出しはダウンロードで受け、保存先には書かない)
//   - 手数は 1 枚 10 (一覧を開く 2 + 図を選ぶ 1 + 一覧を閉じる 1 + 書き出し 2 x 3)、3 枚で 30。
//     開いてから描けるまでは上限 (3 秒) 以内
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
const FORMATS = [
  { id: 'exp-svg', ext: 'svg', suffix: '' },
  { id: 'exp-png', ext: 'png', suffix: '' },
  { id: 'exp-png-transparent', ext: 'png', suffix: '.transparent' },
];
const OPS_PER_DOC = 4 + 2 * FORMATS.length;
const RENDER_MS_MAX = 3000;
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngSize(buf) { return [buf.readUInt32BE(16), buf.readUInt32BE(20)]; }
function viewBoxSize(svg) {
  const m = svg.match(/viewBox="([^"]+)"/);
  if (!m) return null;
  return m[1].trim().split(/[ ,]+/).slice(2).map(Number);
}

test('primary 手順2 (場面4) 保存先の一覧から 3 図を開き、SVG・PNG・透過 PNG で書き出しても本文と保存先が変わらない', async ({ page }, testInfo) => {
  test.setTimeout(150 * 1000);
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

    // 開いた図は図種どおりに描け、本文は開いただけでは変わらない。
    await expect(page.locator('#diagram-type'), d.name + ' の図種').toHaveValue(d.type);
    await H.expectRendered(page);
    const opened = await H.getEditorText(page);
    expect(opened, d.name + ' の本文').toBe(text);
    expect(renderMs, d.name + ' を開いてから描けるまで').toBeLessThanOrEqual(RENDER_MS_MAX);

    // Export ▾ から 3 形式を 1 枚ずつ書き出す。
    let vb = null;
    for (const f of FORMATS) {
      const dl = await S.exportVia(page, f.id);
      ops += 2;
      expect(dl, d.name + ' の ' + f.id + ' を受け取れる').not.toBeNull();
      if (!dl) continue;
      const suggested = dl.suggestedFilename();
      expect(suggested, d.name + ' の ' + f.id + ' の保存名').toMatch(new RegExp('\\.' + f.ext + '$', 'i'));
      const out = testInfo.outputPath(d.name + f.suffix + '.' + f.ext);
      await dl.saveAs(out);
      const buf = fs.readFileSync(out);
      if (f.ext === 'svg') {
        const svg = buf.toString('utf8');
        expect(svg, d.name + '.svg').toContain('<svg');
        expect(svg, d.name + '.svg').toContain('</svg>');
        for (const w of d.words) expect(svg, d.name + '.svg の文字 ' + w).toContain(w.replace(/</g, '&lt;'));
        vb = viewBoxSize(svg);
        expect(vb, d.name + '.svg の viewBox').not.toBeNull();
      } else {
        expect(buf.subarray(0, 8).equals(PNG_SIG), d.name + f.suffix + '.png は PNG').toBe(true);
        const [w, h] = pngSize(buf);
        H.annotate(testInfo, 'png', d.name + f.suffix + ' ' + w + 'x' + h);
        expect(w, d.name + f.suffix + '.png の幅').toBeGreaterThan(20);
        expect(h, d.name + f.suffix + '.png の高さ').toBeGreaterThan(20);
        if (vb) {
          expect(Math.abs(w - vb[0]), d.name + f.suffix + '.png の幅は SVG の viewBox どおり').toBeLessThanOrEqual(2);
          expect(Math.abs(h - vb[1]), d.name + f.suffix + '.png の高さは SVG の viewBox どおり').toBeLessThanOrEqual(2);
        }
      }
    }

    // 書き出しても本文は 1 行も動かない。
    const after = await H.getEditorText(page);
    const dl = H.diffLines(opened, after);
    H.annotate(testInfo, 'diffLines', dl);
    expect(dl, d.name + ' を書き出した後の本文の差分').toBe(0);
    await H.expectRendered(page);
  }

  // 書き出しても保存先の 4 枚は 1 バイトも変わらず、画像もほかのファイルも保存先に増えない。
  await page.waitForTimeout(1500);
  for (const n of FILES) {
    expect(Buffer.compare(fs.readFileSync(path.join(dir, n + '.puml')), orig[n]), n + '.puml は 1 バイトも変わらない').toBe(0);
  }
  expect(fs.readdirSync(dir).sort(), '保存先にほかのファイルが増えない').toEqual(FILES.map((n) => n + '.puml').sort());
  H.annotate(testInfo, 'ops', ops);
  expect(ops).toBe(OPS_PER_DOC * DOCS.length);
});
