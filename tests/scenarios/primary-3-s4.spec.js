// @ts-check
// primary 台本 場面 4「書き出し」手順 3:
//   保存先の一覧から開いた 3 枚 (シーケンス・状態遷移・クラス) を Export ▾ の SVG・PNG・PNG（透過背景）で書き出し、
//   書き出した中身を見る (SVG の背景 rect の有無・text 数が本文の要素数と一致するか、PNG の寸法と線が切れていないか、
//   既定の保存名)。
//   台本では persona-data の export-s4 の rev-seq・rev-class・hand-state を使うが、scenario は persona-data を
//   読まず fixture の hand-seq・hand-state・hand-class (と `!include` する common.puml) を使う。
// 期待 (principles.md「押した対象だけが変わる」「描ける」):
//   - SVG の text は本文の要素 (参加者は頭と足の 2 つ・メッセージ・状態・遷移のラベル・クラス名・属性と操作) と
//     数も文字も一致する (描き落とし・余計な文字が無い)。背景の rect の有無は annotation に残す
//   - PNG・透過 PNG は 8bit RGBA・非インターレースで、寸法は SVG の viewBox × PNG の倍率 (既定 2 倍) と一致し、
//     線や文字の画素が画像の縁 (外周 1px) に掛からない (図が切れていない)
//   - PNG の隅は白の不透明、透過 PNG の隅は透明 (透過を選んだときだけ背景が抜ける)
//   - 保存名は .puml と同じ名前に拡張子 (hand-seq.svg / hand-seq.png / hand-seq.transparent.png)。保存先から開いた図なので
//     図と同じフォルダに書かれる (TICKET-primary-20261115-2240-wish。以前はダウンロードで PNG と透過 PNG が同じ名前だった)
//   - 書き出しても本文は 1 行も動かず、保存先の .puml は 1 バイトも変わらず、増えるのは押した書き出しだけ
//   - 手数は 1 枚 10 (一覧を開く 2 + 図を選ぶ 1 + 一覧を閉じる 1 + 書き出し 2 x 3)、3 枚で 30 以内
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

// texts: 本文から読める、SVG に描かれるべき文字 (並びは問わない)。
const DOCS = [
  { name: 'hand-seq', words: ['Drv', 'Open()', 'ready', 'Poll()'],
    // 参加者 3 (頭と足で 2 回ずつ) + メッセージ 3
    texts: ['Drv', 'Mon', 'Bus', 'Drv', 'Mon', 'Bus', 'Open()', 'ready', 'Poll()'] },
  { name: 'hand-state', words: ['Idle', 'Busy', 'Slow', 'Throttle'],
    // 状態 3 + ラベル付きの遷移 3
    texts: ['Idle', 'Busy', 'Slow', 'Start', 'Throttle', 'Stop'] },
  { name: 'hand-class', words: ['Drv', 'Mon', 'rate : uint16'],
    // クラス 2 + 属性・操作 3 (classAttributeIconSize 0 なので可視性は記号の文字で出る)
    texts: ['Drv', '-rate : uint16', '+open() : void', 'Mon', '-period : uint32'] },
];
const FILES = ['common'].concat(DOCS.map((d) => d.name));
const OPS_MAX = 30;

// 本文から要素の数を数える (図種ごと。コメント行は数えない)。SVG の text 数と突き合わせる。
function elementCount(name, text) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith("'"));
  if (name === 'hand-seq') {
    const parts = lines.filter((l) => /^participant /.test(l)).length;
    const msgs = lines.filter((l) => /-+>.*:/.test(l)).length;
    return parts * 2 + msgs;
  }
  if (name === 'hand-state') {
    const states = new Set();
    let labels = 0;
    for (const l of lines) {
      const m = l.match(/^(\S+)\s+-+>\s+(\S+)(\s*:.*)?$/);
      if (!m) continue;
      for (const s of [m[1], m[2]]) if (s !== '[*]') states.add(s);
      if (m[3]) labels++;
    }
    return states.size + labels;
  }
  // class: クラス名 + 波括弧の中の属性・操作
  let n = 0, inBody = false;
  for (const l of lines) {
    if (/^class /.test(l)) { n++; inBody = /\{$/.test(l); continue; }
    if (inBody) { if (l === '}') inBody = false; else n++; }
  }
  return n;
}

// PNG の画素に戻す道具と、線・文字の画素の数え方は _helpers.js (場面 4 の scenario で共用)。
const { decodePng, inkStats } = H;

test('primary 手順3 (場面4) 書き出した SVG・PNG の中身が本文の要素どおりで、PNG は切れず、既定の保存名は .puml と同じ', async ({ page }, testInfo) => {
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
    await page.locator('#folder-panel .folder-item[data-file-name="' + d.name + '"]').first().dblclick();
    ops += 1;
    await expect(page.locator('#editor')).toHaveValue(text, { timeout: 20000 });
    await H.waitDrawn(page, d.words);
    await S.closeFolderList(page);
    ops += 1;
    await H.expectRendered(page);
    const opened = await H.getEditorText(page);

    // SVG: 保存名・text が本文の要素と一致・背景 rect の有無。保存先から開いた図の書き出しは
    // 図と同じフォルダに図の名前で書かれる (TICKET-primary-20261115-2240-wish)。
    const rSvg = await S.exportToFolder(page, 'exp-svg');
    ops += 2;
    const svgFile = path.join(dir, d.name + '.svg');
    expect(path.resolve(rSvg.path), d.name + ' の SVG の保存名').toBe(path.resolve(svgFile));
    const svg = fs.readFileSync(svgFile, 'utf8');
    const texts = (svg.match(/<text[^>]*>[^<]*<\/text>/g) || []).map((s) => s.replace(/<[^>]+>/g, ''));
    expect(texts.length, d.name + '.svg の text 数は本文の要素数').toBe(elementCount(d.name, text));
    expect(texts.slice().sort(), d.name + '.svg の text は本文の要素の文字').toEqual(d.texts.slice().sort());
    const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1];
    expect(vb, d.name + '.svg の viewBox').toBeTruthy();
    const [vw, vh] = String(vb).trim().split(/[ ,]+/).slice(2).map(Number);
    const bgRect = /<rect[^>]*fill="#(FFF|FFFFFF)"[^>]*x="0"|<rect[^>]*x="0"[^>]*y="0"[^>]*fill="#(FFF|FFFFFF)"/i.test(svg);
    H.annotate(testInfo, 'svgBgRect', d.name + ' ' + bgRect);

    // PNG と透過 PNG: 既定の保存名・寸法・線が縁に掛からない・隅の色。
    for (const [id, transparent] of [['exp-png', false], ['exp-png-transparent', true]]) {
      const r = await S.exportToFolder(page, id);
      ops += 2;
      // 通常の PNG と透過 PNG は別の名前 (同じ名前で前の方を黙って上書きしない)。
      const out = path.join(dir, d.name + (transparent ? '.transparent' : '') + '.png');
      expect(path.resolve(r.path), d.name + ' の ' + id + ' の保存名').toBe(path.resolve(out));
      const img = decodePng(fs.readFileSync(out));
      const st = inkStats(img);
      H.annotate(testInfo, 'png', d.name + ' ' + id + ' ' + img.w + 'x' + img.h + ' ink=' + st.ink + ' edge=' + st.edge);
      expect([img.depth, img.ctype, img.interlace], d.name + ' ' + id + ' は 8bit RGBA・非インターレース').toEqual([8, 6, 0]);
      // TICKET-junior-20261123-1142-wish: PNG は SVG の寸法 × PNG の倍率 (何も選ばなければ 2 倍)。
      expect(Math.abs(img.w - vw * H.PNG_SCALE), d.name + ' ' + id + ' の幅は viewBox × 倍率').toBeLessThanOrEqual(2 * H.PNG_SCALE);
      expect(Math.abs(img.h - vh * H.PNG_SCALE), d.name + ' ' + id + ' の高さは viewBox × 倍率').toBeLessThanOrEqual(2 * H.PNG_SCALE);
      expect(st.ink, d.name + ' ' + id + ' に線・文字が描かれている').toBeGreaterThan(500);
      expect(st.edge, d.name + ' ' + id + ' の線が画像の縁で切れていない').toBe(0);
      if (transparent) expect(st.corner[3], d.name + ' 透過 PNG の隅は透明').toBe(0);
      else expect(st.corner, d.name + ' PNG の隅は白の不透明').toEqual([255, 255, 255, 255]);
    }

    // 書き出しても本文は 1 行も動かない。
    const after = await H.getEditorText(page);
    const dl = H.diffLines(opened, after);
    H.annotate(testInfo, 'diffLines', dl);
    expect(dl, d.name + ' を書き出した後の本文の差分').toBe(0);
  }

  // 書き出しても保存先の 4 枚は 1 バイトも変わらず、ほかのファイルも増えない。
  await page.waitForTimeout(1500);
  for (const n of FILES) {
    expect(Buffer.compare(fs.readFileSync(path.join(dir, n + '.puml')), orig[n]), n + '.puml は 1 バイトも変わらない').toBe(0);
  }
  const exported = [].concat(...DOCS.map((d) => [d.name + '.svg', d.name + '.png', d.name + '.transparent.png']));
  expect(fs.readdirSync(dir).sort(), '保存先に増えたのは押した書き出しだけ').toEqual(FILES.map((n) => n + '.puml').concat(exported).sort());
  H.annotate(testInfo, 'ops', ops);
  expect(ops).toBeLessThanOrEqual(OPS_MAX);
});
