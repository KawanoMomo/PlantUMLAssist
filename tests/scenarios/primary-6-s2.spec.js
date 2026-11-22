// @ts-check
// primary 台本 場面 2「手書きの既存の図を開いて直す」手順 6:
//   直した一式 (直す前 / 直した後の .puml と書き出した SVG) と一覧 (図・直した行・差分行数・気づき) を
//   out\scene2h\ に置き、handoff.md に書く。列挙に無い古い出力は「残り」として扱う (消さず、一覧に残りと書く)。
//   手順 3 と同じく hand-seq・hand-state・hand-class を保存先の一覧から 1 枚ずつ開き、1 か所を GUI で直して
//   Ctrl+S で保存し、Export ▾「SVGとして保存」で書き出す。
// 期待 (principles.md「押した対象だけが変わる」「描ける」「手書きや他の道具で作った .puml は壊さず開ける」):
//   - 保存した直した後の .puml と直す前の差分は、直した 1 行だけ (消えた 1 行 + 足した 1 行 = 2)。
//     コメント・字下げ・skinparam・!include の行は 1 字も動かず、改行は LF のまま
//   - 書き出した SVG は .puml と対の名前で、空でなく、直した後の語が描かれている
//   - 一覧の差分行数は、置いた直す前 / 直した後から数え直した値と一致する。置いた一式は列挙どおり
//   - 直していない common.puml は保存先で 1 バイトも変わらない
// 出力先は試験用の test-results の下 (persona_data の実体には書かない)。図: tests/scenarios/fixtures/ の hand-*・common。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const RENDER_MS_MAX = 3000;

// 図の要素を実マウスで押す (合成イベントは当たり判定を素通りするので使わない)。
async function clickHit(page, locator, what) {
  await expect(locator).toBeAttached({ timeout: 15000 });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('overlay box not found: ' + what);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const DOCS = [
  {
    name: 'hand-seq', type: 'plantuml-sequence', words: ['Drv', 'Open()', 'ready', 'Poll()'],
    line: '    Bus --> Drv : ready', fixed: '    Bus --> Drv : ready(ok)', drawn: 'ready(ok)',
    note: 'メッセージ ready の文言を図から直した。字下げ 4 桁とコメントは不変',
    edit: async (page, lineNo) => {
      const hit = page.locator('#overlay-layer rect[data-type="message"][data-line="' + lineNo + '"]').first();
      await clickHit(page, hit, 'message line ' + lineNo);
      const ta = page.locator('.rle-textarea:visible').first();
      await ta.click();
      await page.keyboard.press('Control+a');
      await page.keyboard.type('ready(ok)');
      await page.keyboard.press('Tab');
    },
  },
  {
    name: 'hand-state', type: 'plantuml-state', words: ['Idle', 'Busy', 'Slow', 'Throttle'],
    line: 'Busy  --> Slow : Throttle', fixed: 'Busy  --> Slow : Throttle2', drawn: 'Throttle2',
    note: '遷移 Throttle の条件を右パネルの一覧から直した。矢印の前の桁揃えは不変',
    edit: async (page) => {
      await page.locator('#props-content div:has(> .st-tr-pick)', { hasText: 'Throttle' }).first().locator('.st-tr-pick').click();
      await page.locator('#st-tr-trig').fill('Throttle2');
      await page.locator('#st-tr-update').click();
    },
  },
  {
    name: 'hand-class', type: 'plantuml-class', words: ['Drv', 'Mon', 'rate : uint16'],
    line: '  - rate : uint16', fixed: '  - rate : uint32', drawn: 'rate : uint32',
    note: 'Drv の属性 rate の型を図から直した。字下げ 2 桁は不変',
    edit: async (page, lineNo) => {
      const hit = page.locator('#overlay-layer rect[data-type="member"][data-parent-id="Drv"][data-line="' + lineNo + '"]').first();
      await clickHit(page, hit, 'member rate (line ' + lineNo + ')');
      const mi = await hit.getAttribute('data-member-index');
      const type = page.locator('#cl-mem-type-' + mi);
      if (!(await type.isVisible())) await page.locator('#cl-mem-edit-' + mi).click();
      await expect(type).toHaveValue('uint16');
      await type.fill('uint32');
      await page.locator('#cl-mem-update-' + mi).click();
    },
  },
];
const FILES = ['common'].concat(DOCS.map((d) => d.name));
const STALE = 'old-scene2h.svg'; // 前回の場面 2 の残り (列挙に無い古い出力)

function count(re, s) { return (String(s).match(re) || []).length; }

test('primary 手順6 (場面2) 直した手書きの 3 図の一式と一覧を scene2h に置き、差分行数が一覧と合う', async ({ page }, testInfo) => {
  test.setTimeout(150 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const orig = {};
  for (const n of FILES) {
    orig[n] = fs.readFileSync(path.join(H.FIXTURES, n + '.puml'));
    fs.writeFileSync(path.join(dir, n + '.puml'), orig[n]);
  }
  const out = path.join(dir, '..', 'primary-6-s2-out', 'scene2h');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, STALE), '<svg/>', 'utf8');

  await H.bootWithSaveDir(page, S.dirFor(__filename));
  const rows = [];

  for (const d of DOCS) {
    const before = orig[d.name].toString('utf8').replace(/\r\n/g, '\n');
    await S.openFolder(page);
    await page.locator('#folder-panel .folder-item[data-file-name="' + d.name + '"]').first().dblclick();
    await expect(page.locator('#editor')).toHaveValue(before, { timeout: 20000 });
    await H.waitDrawn(page, d.words);
    await S.closeFolderList(page);
    await expect(page.locator('#diagram-type'), d.name + ' の図種').toHaveValue(d.type);

    const lineNo = before.split('\n').indexOf(d.line) + 1;
    expect(lineNo, d.name + ' に直す行がある').toBeGreaterThan(0);
    const r = await H.measure(page, testInfo, () => d.edit(page, lineNo), [d.drawn]);
    expect(r.diffLines, d.name + ' の直しの差分').toBe(2);
    expect(r.renderMs, d.name + ' の直しから描画まで').toBeLessThanOrEqual(RENDER_MS_MAX);

    // 保存 (実キー)。保存先の .puml が直した後の本文になる。
    await page.locator('#editor').click();
    await page.keyboard.press('Control+s');
    const savedFile = path.join(dir, d.name + '.puml');
    await expect.poll(() => fs.readFileSync(savedFile, 'utf8'), { timeout: 20000 }).toContain(d.fixed);
    const after = fs.readFileSync(savedFile, 'utf8');
    expect(after.includes('\r\n'), d.name + ' は LF のまま').toBe(false);

    // 直す前と直した後の差分は直した 1 行だけ。ほかの行は同じ位置で 1 字も動かない。
    expect(H.removedLines(before, after), d.name + ' の消えた行').toEqual([d.line]);
    expect(H.removedLines(after, before), d.name + ' の足した行').toEqual([d.fixed]);
    const bl = before.split('\n');
    const al = after.split('\n');
    expect(al.length, d.name + ' の行数').toBe(bl.length);
    for (let i = 0; i < bl.length; i++) {
      if (i !== lineNo - 1) expect(al[i], d.name + ' の ' + (i + 1) + ' 行目').toBe(bl[i]);
    }
    expect(count(/^\s*'/gm, after)).toBe(count(/^\s*'/gm, before));
    expect(count(/skinparam/g, after)).toBe(count(/skinparam/g, before));
    expect(after).toMatch(/^!include common\.puml$/m);

    // Export ▾「SVGとして保存」。.puml と対の名前で保存先に書かれ、直した後の語が描かれている。
    const exp = await S.exportToFolder(page, 'exp-svg');
    expect(path.resolve(exp.path)).toBe(path.resolve(path.join(dir, d.name + '.svg')));
    const svg = fs.readFileSync(exp.path, 'utf8');
    expect(svg, d.name + '.svg は空でない').toContain('<svg');
    const texts = await page.evaluate((s) => {
      const doc = new DOMParser().parseFromString(s, 'image/svg+xml');
      return Array.from(doc.querySelectorAll('text')).map((t) => (t.textContent || '').trim()).join('\n');
    }, svg);
    expect(texts, d.name + '.svg に ' + d.drawn).toContain(d.drawn);
    await H.expectRendered(page);

    // 一式を scene2h に置く。
    fs.writeFileSync(path.join(out, d.name + '.before.puml'), before, 'utf8');
    fs.writeFileSync(path.join(out, d.name + '.after.puml'), after, 'utf8');
    fs.copyFileSync(exp.path, path.join(out, d.name + '.svg'));
    rows.push({ name: d.name, kind: d.type, line: lineNo + ' 行目 `' + d.fixed.trim() + '`', diff: H.diffLines(before, after), note: d.note });
  }

  // 一覧 (図・直した行・差分行数・気づき) を handoff.md に書く。列挙に無い古い出力は残りとして書く。
  const listed = [];
  rows.forEach((x) => listed.push(x.name + '.before.puml', x.name + '.after.puml', x.name + '.svg'));
  const leftovers = fs.readdirSync(out).filter((f) => listed.indexOf(f) < 0 && f !== 'handoff.md');
  const md = [
    '# 場面 2 手書きの既存の図を開いて直す',
    '',
    '| 図 | 図種 | 直した行 | 差分行数 | 気づき |',
    '|---|---|---|---|---|',
  ].concat(rows.map((x) => '| ' + x.name + '.puml / ' + x.name + '.svg | ' + x.kind + ' | ' + x.line + ' | ' + x.diff + ' | ' + x.note + ' |'))
    .concat(['', '残り (今回の列挙に無い古い出力): ' + (leftovers.length ? leftovers.join('、') : 'なし')]).join('\n') + '\n';
  fs.writeFileSync(path.join(out, 'handoff.md'), md, 'utf8');

  // 置いた一式は列挙どおりで、古い出力は消さずに残りとして一覧にある。
  expect(leftovers).toEqual([STALE]);
  expect(fs.readdirSync(out).sort()).toEqual(listed.concat(['handoff.md', STALE]).sort());
  const handoff = fs.readFileSync(path.join(out, 'handoff.md'), 'utf8');
  expect(handoff).toContain('残り (今回の列挙に無い古い出力): ' + STALE);
  // 一覧の差分行数は、置いた直す前 / 直した後から数え直しても同じ (どれも 2)。
  for (const x of rows) {
    const placed = H.diffLines(fs.readFileSync(path.join(out, x.name + '.before.puml'), 'utf8'),
      fs.readFileSync(path.join(out, x.name + '.after.puml'), 'utf8'));
    expect(placed, x.name + ' の差分行数').toBe(2);
    expect(handoff).toContain('| ' + x.name + '.puml / ' + x.name + '.svg | ' + x.kind + ' | ' + x.line + ' | ' + placed + ' |');
  }

  // !include される common.puml は直していないので 1 バイトも変わらない。
  expect(Buffer.compare(fs.readFileSync(path.join(dir, 'common.puml')), orig.common), 'common.puml は変わらない').toBe(0);
  expect(errors, errors.join('\n')).toEqual([]);
});
