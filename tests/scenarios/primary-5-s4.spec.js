// @ts-check
// primary 台本 場面 4「書き出し」手順 5:
//   書き出した一式 (3 枚 x SVG・PNG・PNG（透過背景）) と一覧 (ファイル名・図種・形式・寸法・見えるか・気づき) を
//   出力フォルダ (台本では {persona_data}\primary\out\scene4f\、scenario では test-results の下) に置き、
//   handoff.md に書く。一覧に無い古い出力は「残り」として扱う。
//   台本では persona-data の export-s4 の rev-seq・rev-class・hand-state を使うが、scenario は persona-data を
//   読まず fixture の hand-seq・hand-state・hand-class (と `!include` する common.puml) を使う。
// 期待 (principles.md「押した対象だけが変わる」「描ける」):
//   - 出力フォルダのファイルは、一覧の行と過不足なく 1 対 1 (前回の残りは一覧に入らず「残り」に出る)
//   - 取り違えが無い: 各ファイルの中身が一覧の行と合う。形式はファイルの先頭のバイト、寸法は読み直した値、
//     図種は書き出したときの画面の図種と SVG の data-diagram-type、SVG の text はその図の本文の要素だけ、
//     PNG の寸法は同じ図の SVG の viewBox に一番近い (2px 以内)、透過 PNG だけ隅が透明
//   - 3 枚とも 3 形式がそろい、どれも見える (線・文字があり、縁で切れない)
//   - 一式を作っても本文は 1 行も動かず、保存先の .puml は 1 バイトも変わらない。描ける
//   - 手数は手順 3 と同じ 1 枚 10、3 枚で 30 以内 (一覧づくりは画面の外の作業なので数えない)
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const DOCS = [
  { name: 'hand-seq', kind: 'plantuml-sequence', svgType: 'SEQUENCE', words: ['Drv', 'Open()', 'ready', 'Poll()'],
    texts: ['Drv', 'Mon', 'Bus', 'Drv', 'Mon', 'Bus', 'Open()', 'ready', 'Poll()'] },
  { name: 'hand-state', kind: 'plantuml-state', svgType: 'STATE', words: ['Idle', 'Busy', 'Slow', 'Throttle'],
    texts: ['Idle', 'Busy', 'Slow', 'Start', 'Throttle', 'Stop'] },
  { name: 'hand-class', kind: 'plantuml-class', svgType: 'CLASS', words: ['Drv', 'Mon', 'rate : uint16'],
    texts: ['Drv', '-rate : uint16', '+open() : void', 'Mon', '-period : uint32'] },
];
const FILES = ['common'].concat(DOCS.map((d) => d.name));
const FORMATS = [
  { id: 'exp-svg', format: 'SVG', ext: '.svg' },
  { id: 'exp-png', format: 'PNG', ext: '.png' },
  { id: 'exp-png-transparent', format: 'PNG（透過背景）', ext: '.transparent.png' },
];
// 前回の run が置いたまま、今回の一覧に無い出力 (台本の「列挙に無い古い出力」)。
const LEFTOVER = 'rev-seq.svg';
const OPS_MAX = 30;
const HEAD = '| ファイル名 | 図種 | 形式 | 寸法 | 見えるか | 気づき |';

// ファイルの中身だけから、形式・寸法・見えるか・SVG の図種と text を読む (一覧の値と突き合わせる)。
function inspect(file) {
  const buf = fs.readFileSync(file);
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    const img = H.decodePng(buf);
    const st = H.inkStats(img);
    return { format: st.corner[3] === 0 ? 'PNG（透過背景）' : 'PNG', w: img.w, h: img.h,
      visible: st.ink > 500 && st.edge === 0, corner: st.corner, img };
  }
  const svg = buf.toString('utf8');
  if (!/<svg[\s>]/.test(svg)) return { format: '?' };
  const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1] || '';
  const [w, h] = vb.trim().split(/[ ,]+/).slice(2).map(Number);
  const texts = (svg.match(/<text[^>]*>[^<]*<\/text>/g) || []).map((s) => s.replace(/<[^>]+>/g, ''));
  const svgType = (svg.match(/<svg[^>]*data-diagram-type="([^"]+)"/) || [])[1] || null;
  return { format: 'SVG', w, h, visible: texts.length > 0 && w > 0 && h > 0, texts, svgType };
}

// handoff.md の表を行に戻す (書いた一覧がそのまま読めるか)。
function parseHandoff(md) {
  const rows = [];
  let inTable = false;
  for (const l of md.split('\n')) {
    if (l === HEAD) { inTable = true; continue; }
    if (!inTable) continue;
    if (!l.startsWith('|')) { inTable = false; continue; }
    if (/^\|\s*-/.test(l)) continue;
    const c = l.split('|').slice(1, -1).map((s) => s.trim());
    rows.push({ file: c[0], kind: c[1], format: c[2], size: c[3], visible: c[4], note: c[5] });
  }
  const rest = (md.split('## 残り\n')[1] || '').split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim());
  return { rows, rest };
}

test('primary 手順5 (場面4) 書き出した一式と一覧を置き、一覧と中身が取り違えなく 1 対 1 で、古い出力は残りに出る', async ({ page }, testInfo) => {
  test.setTimeout(150 * 1000);
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const orig = {};
  for (const n of FILES) {
    orig[n] = fs.readFileSync(path.join(H.FIXTURES, n + '.puml'));
    fs.writeFileSync(path.join(dir, n + '.puml'), orig[n]);
  }
  const out = testInfo.outputPath('scene4f');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, LEFTOVER), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>\n');

  await H.bootWithSaveDir(page, S.dirFor(__filename));
  let ops = 0;
  const listing = [];

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
    const kind = await page.locator('#diagram-type').inputValue();
    expect(kind, d.name + ' を開いた画面の図種').toBe(d.kind);

    for (const f of FORMATS) {
      const dl = await S.exportVia(page, f.id);
      ops += 2;
      expect(dl, d.name + ' の ' + f.id + ' を受け取れる').not.toBeNull();
      if (!dl) continue;
      // 透過 PNG の既定の保存名は PNG と同じ (.png) なので、一式に置くときは名前を分ける。
      const suggested = dl.suggestedFilename();
      const file = f.id === 'exp-png-transparent' ? d.name + f.ext : suggested;
      if (f.id === 'exp-png-transparent') H.annotate(testInfo, 'defaultNameClash', d.name + ' ' + suggested);
      else expect(suggested, d.name + ' の ' + f.id + ' の既定の保存名').toBe(d.name + f.ext);
      await dl.saveAs(path.join(out, file));
      const got = inspect(path.join(out, file));
      listing.push({ file, kind, format: f.format, size: got.w + 'x' + got.h, visible: got.visible ? 'はい' : 'いいえ',
        note: f.id === 'exp-png-transparent' ? '既定の保存名は ' + suggested + ' (PNG と重なるので名前を分けた)' : '' });
    }

    const after = await H.getEditorText(page);
    const dl = H.diffLines(opened, after);
    H.annotate(testInfo, 'diffLines', dl);
    expect(dl, d.name + ' を書き出した後の本文の差分').toBe(0);
  }

  // 一覧を handoff.md に書く (一覧に無いファイルは「残り」)。
  const listed = new Set(listing.map((r) => r.file));
  const rest = fs.readdirSync(out).filter((f) => !listed.has(f)).sort();
  const md = ['# 場面 4 書き出しの一式', '', HEAD, '|---|---|---|---|---|---|']
    .concat(listing.map((r) => '| ' + [r.file, r.kind, r.format, r.size, r.visible, r.note].join(' | ') + ' |'))
    .concat(['', '## 残り', ''], rest.map((f) => '- ' + f), ['']).join('\n');
  fs.writeFileSync(path.join(out, 'handoff.md'), md, 'utf8');

  // 書いた一覧を読み直し、出力フォルダと 1 対 1 で突き合わせる。
  const back = parseHandoff(fs.readFileSync(path.join(out, 'handoff.md'), 'utf8'));
  expect(back.rows.map((r) => r.file), 'handoff.md の表は書いた一覧のまま').toEqual(listing.map((r) => r.file));
  expect(back.rest, '一覧に無い古い出力は残りに出る').toEqual([LEFTOVER]);
  const present = fs.readdirSync(out).filter((f) => f !== 'handoff.md' && back.rest.indexOf(f) < 0).sort();
  expect(present, '出力フォルダの一式は一覧と過不足なし').toEqual(back.rows.map((r) => r.file).sort());
  expect(back.rows, '3 枚 x 3 形式').toHaveLength(DOCS.length * FORMATS.length);

  // 取り違えが無い: 各ファイルの中身から読んだ値が、一覧のその行と合う。
  const svgOf = {};
  for (const d of DOCS) svgOf[d.name] = inspect(path.join(out, d.name + '.svg'));
  for (const r of back.rows) {
    const d = DOCS.find((x) => r.file === x.name + '.svg' || r.file === x.name + '.png' || r.file === x.name + '.transparent.png');
    expect(d, r.file + ' はどの図の出力か名前で分かる').toBeTruthy();
    if (!d) continue;
    const got = inspect(path.join(out, r.file));
    expect(r.kind, r.file + ' の図種は書き出した図のもの').toBe(d.kind);
    expect(got.format, r.file + ' の形式は中身どおり').toBe(r.format);
    expect(got.w + 'x' + got.h, r.file + ' の寸法は中身どおり').toBe(r.size);
    expect(r.visible, r.file + ' は見える').toBe('はい');
    if (got.format === 'SVG') {
      H.annotate(testInfo, 'svgType', r.file + ' ' + got.svgType);
      expect(got.svgType, r.file + ' の SVG の図種 (data-diagram-type)').toBe(d.svgType);
      expect((got.texts || []).slice().sort(), r.file + ' の text はその図の本文の要素だけ').toEqual(d.texts.slice().sort());
    } else {
      // PNG は同じ図の SVG の viewBox に一番近い寸法 (別の図の画像と取り違えていない)。
      const dist = (s) => Math.abs(got.w - s.w) + Math.abs(got.h - s.h);
      const own = dist(svgOf[d.name]);
      H.annotate(testInfo, 'png', r.file + ' ' + r.size + ' own=' + own);
      expect(Math.abs(got.w - svgOf[d.name].w), r.file + ' の幅は同じ図の SVG どおり').toBeLessThanOrEqual(2);
      expect(Math.abs(got.h - svgOf[d.name].h), r.file + ' の高さは同じ図の SVG どおり').toBeLessThanOrEqual(2);
      for (const o of DOCS) {
        if (o.name !== d.name) expect(dist(svgOf[o.name]), r.file + ' は ' + o.name + ' の寸法より自分の図に近い').toBeGreaterThan(own);
      }
      if (r.format === 'PNG') expect(got.corner, r.file + ' の隅は白の不透明').toEqual([255, 255, 255, 255]);
    }
  }
  // 古い出力は消さず、中身もそのまま (一覧に入れない・上書きしない)。
  expect(fs.readFileSync(path.join(out, LEFTOVER), 'utf8')).toContain('viewBox="0 0 10 10"');

  // 一式を作っても保存先の 4 枚は 1 バイトも変わらず、ほかのファイルも増えない。描ける。
  await page.waitForTimeout(1500);
  for (const n of FILES) {
    expect(Buffer.compare(fs.readFileSync(path.join(dir, n + '.puml')), orig[n]), n + '.puml は 1 バイトも変わらない').toBe(0);
  }
  expect(fs.readdirSync(dir).sort(), '保存先にほかのファイルが増えない').toEqual(FILES.map((n) => n + '.puml').sort());
  await H.expectRendered(page);
  H.annotate(testInfo, 'ops', ops);
  expect(ops).toBeLessThanOrEqual(OPS_MAX);
});
