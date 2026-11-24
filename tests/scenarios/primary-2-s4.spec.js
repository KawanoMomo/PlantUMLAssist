// @ts-check
// primary 台本 場面 4「書き出し」手順 2:
//   保存先の一覧から 3 枚 (シーケンス・状態遷移・クラス) を 1 枚ずつ開き、Export ▾ の「SVGとして保存」
//   「PNGとして保存」「PNG（透過背景）」で 1 枚ずつ書き出す。
//   台本では persona-data の export-s4 の rev-seq・rev-class・hand-state を使うが、scenario は persona-data を
//   読まず fixture の hand-seq・hand-state・hand-class (と `!include` する common.puml) を使う。
// 期待 (principles.md「押した対象だけが変わる」「描ける」):
//   - 開いた図は図種どおりに選ばれ、エラー無しで描け、開いただけで本文は 1 字も変わらない
//   - 書き出した 3 形式はどれも受け取れる: SVG は図の文字を持つ `<svg`、PNG・透過 PNG は PNG の署名を持ち、
//     寸法は書き出した SVG の viewBox × PNG の倍率 (既定 2 倍) と倍率 × 2px 以内で一致する (図が切れていない)
//   - 書き出しても本文は 1 行も動かず、保存先の .puml は 1 バイトも変わらない
//   - TICKET-primary-20261115-2240-wish: 保存先から開いた図の書き出しはダウンロードではなく図と同じフォルダに図の名前で
//     書かれ (`{名前}.svg`・`{名前}.png`・`{名前}.transparent.png`)、下端の「名前 → 置き場 · N バイト · 新規 / 上書き」が実物と合う。
//     保存先に増えるのは押した書き出しだけ。同じ図をもう一度書き出すと「上書き」。置き場を保存先の下の out に替えると
//     次の書き出しはそこに入り、開き直しても覚えている (置き場の記憶は保存先に置かない)
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
  let downloads = 0;
  page.on('download', () => { downloads++; });

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

    // Export ▾ から 3 形式を 1 枚ずつ書き出す。保存先から開いた図なので、ダウンロードではなく
    // 図と同じフォルダに図の名前で書かれ (通常の PNG と透過 PNG は別の名前)、下端の「書いた先・名前・バイト数・新規」が実物と合う。
    let vb = null;
    for (const f of FORMATS) {
      const r = await S.exportToFolder(page, f.id);
      ops += 2;
      const out = path.join(dir, d.name + f.suffix + '.' + f.ext);
      expect(path.resolve(r.path), d.name + ' の ' + f.id + ' は図と同じフォルダに図の名前で書く').toBe(path.resolve(out));
      const buf = fs.readFileSync(out);
      expect(r.bytes, d.name + ' の ' + f.id + ' のバイト数は実物どおり').toBe(buf.length);
      expect(r.existed, d.name + ' の ' + f.id + ' は新規').toBe(false);
      expect(r.msg, d.name + ' の ' + f.id + ' の下端の言い方').toContain(path.basename(out) + ' → 図と同じフォルダ · ' + buf.length + ' バイト · 新規');
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
        // TICKET-junior-20261123-1142-wish: PNG は SVG の寸法 × PNG の倍率 (何も選ばなければ 2 倍)。
        if (vb) {
          expect(Math.abs(w - vb[0] * H.PNG_SCALE), d.name + f.suffix + '.png の幅は SVG の viewBox × 倍率').toBeLessThanOrEqual(2 * H.PNG_SCALE);
          expect(Math.abs(h - vb[1] * H.PNG_SCALE), d.name + f.suffix + '.png の高さは SVG の viewBox × 倍率').toBeLessThanOrEqual(2 * H.PNG_SCALE);
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

  // 書き出しても保存先の 4 枚は 1 バイトも変わらず、保存先に増えたのは押した書き出し 9 つだけ。ダウンロードは 0。
  await page.waitForTimeout(1500);
  for (const n of FILES) {
    expect(Buffer.compare(fs.readFileSync(path.join(dir, n + '.puml')), orig[n]), n + '.puml は 1 バイトも変わらない').toBe(0);
  }
  const exported = [].concat(...DOCS.map((d) => FORMATS.map((f) => d.name + f.suffix + '.' + f.ext)));
  expect(fs.readdirSync(dir).sort(), '保存先に増えたのは押した書き出しだけ')
    .toEqual(FILES.map((n) => n + '.puml').concat(exported).sort());
  expect(downloads, 'ダウンロードは来ない').toBe(0);
  H.annotate(testInfo, 'ops', ops);
  expect(ops).toBe(OPS_PER_DOC * DOCS.length);

  // 同じ図 (今開いている hand-class) をもう一度 SVG で書き出すと、同じ名前を上書きし「上書き」と言う。
  const last = DOCS[DOCS.length - 1].name;
  const again = await S.exportToFolder(page, 'exp-svg');
  expect(path.resolve(again.path)).toBe(path.resolve(path.join(dir, last + '.svg')));
  expect(again.existed, 'もう一度書き出すと上書き').toBe(true);
  expect(again.msg).toContain(last + '.svg → 図と同じフォルダ · ' + fs.statSync(path.join(dir, last + '.svg')).size + ' バイト · 上書き');

  // 置き場を保存先の下の別のフォルダ (out) に替えると、次の書き出しはそこに入り、開き直しても覚えている。
  await page.locator('#btn-export').click();
  await expect(page.locator('#export-dest-place')).toHaveText('図と同じフォルダ');
  await expect(page.locator('#export-dest-last')).toContainText(last + '.svg');
  await page.locator('#export-dest-change').click();
  await expect(page.locator('#export-dest-pick')).toBeVisible();
  await expect(page.locator('#export-dest-new')).toBeFocused();
  await page.keyboard.type('out');
  await page.locator('#export-dest-new-ok').click();
  await expect(page.locator('#export-dest-pick')).toHaveCount(0);
  const toOut = await S.exportToFolder(page, 'exp-png');
  expect(path.resolve(toOut.path), '置き場を替えた後の書き出しは out へ').toBe(path.resolve(path.join(dir, 'out', last + '.png')));
  expect(toOut.existed).toBe(false);
  expect(toOut.msg).toContain(last + '.png → 保存先の「out」フォルダ · ' + fs.statSync(toOut.path).size + ' バイト · 新規');
  await S.reopenApp(page);
  await S.openFolder(page);
  await page.locator('#folder-panel .folder-item[data-file-name="' + last + '"]').first().dblclick();
  await H.waitDrawn(page, DOCS[DOCS.length - 1].words);
  await S.closeFolderList(page);
  await page.locator('#btn-export').click();
  await expect(page.locator('#export-dest-place'), '開き直しても置き場を覚えている').toHaveText('保存先の「out」フォルダ');
  await page.keyboard.press('Escape');
  const afterReopen = await S.exportToFolder(page, 'exp-svg');
  expect(path.resolve(afterReopen.path)).toBe(path.resolve(path.join(dir, 'out', last + '.svg')));
  // 置き場の記憶は保存先に置かない (保存先の直下は .puml と押した書き出しと out だけ)。.puml は変わらない。
  expect(fs.readdirSync(dir).sort()).toEqual(FILES.map((n) => n + '.puml').concat(exported, ['out']).sort());
  expect(fs.readdirSync(path.join(dir, 'out')).sort()).toEqual([last + '.png', last + '.svg']);
  for (const n of FILES) {
    expect(Buffer.compare(fs.readFileSync(path.join(dir, n + '.puml')), orig[n]), n + '.puml は 1 バイトも変わらない').toBe(0);
  }
  expect(downloads, 'ダウンロードは来ない').toBe(0);
});
