'use strict';
// BLK-reviewer-20260917-0123-wish: 1 図の「前回保存版」と「今回保存版」を並べる画面の判断。
// ここで固定するのは、差が「差分なし / 整形だけ / 改名だけ / 内容の変更」のどれかを
// 言い切ること、改名と言えるのは本文全体で付け替えの辻褄が合うときだけ (少しでも
// 構造が動いていれば内容の変更に倒す) こと、無変化の回をフォルダ単位で「読む図なし」と
// 即答できること、そして読むべき図が先頭に来る並びになること。
const assert = require('assert');

if (!global.window) {
  const jsdom = require('jsdom');
  const dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['../src/core/version-diff.js', '../src/core/version-fulldiff.js', '../src/core/review-before-after.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
const BA = global.window.MA.reviewBeforeAfter;

const BASE = ['@startuml', "' 図の説明", 'participant Timer_Driver', 'participant Irq_Ctrl',
  'Timer_Driver -> Irq_Ctrl : enable()', '@enduml'].join('\n');

// ── 差分なし ────────────────────────────────────────────────────────────
// 行末の空白と改行コードだけの違いは差分にしない (保存のたびに赤が出る)。
const SAME = BASE.replace(/\n/g, '\r\n') + '   \r\n';
const same = BA.classify(BASE, SAME, { stamp: '20260916-2300' });
assert.strictEqual(same.verdict, 'same', '行末空白と CRLF は差分にしない');
assert.ok(BA.verdictText(same).indexOf('差分なし') >= 0, '差分なしと言い切る');
assert.ok(BA.verdictText(same).indexOf('読み直す必要はありません') >= 0, '読まなくてよいと言う');
assert.ok(BA.verdictText(same).indexOf('20260916-2300') >= 0, 'どの版と比べたかを言う');
assert.strictEqual(BA.needsSvgCheck(same), false, '内容が同じなら SVG を並べる必要もない');
assert.ok(BA.svgNote(same).indexOf('崩れは起きません') >= 0, 'SVG を見ない理由を言う');

// ── 整形だけ ────────────────────────────────────────────────────────────
const FORMAT = ['@startuml', '', "' 図の説明", '', 'participant   Timer_Driver',
  'participant Irq_Ctrl', 'Timer_Driver  ->  Irq_Ctrl : enable()', '@enduml'].join('\n');
const fmt = BA.classify(BASE, FORMAT, {});
assert.strictEqual(fmt.verdict, 'format', '空行と空白の詰め方だけなら整形');
assert.ok(BA.verdictText(fmt).indexOf('描かれる内容は変わりません') >= 0, '描画は変わらないと言う');
assert.strictEqual(BA.needsSvgCheck(fmt), false, '整形だけなら SVG も見なくてよい');

// ── 改名だけ ────────────────────────────────────────────────────────────
const RENAME = BASE.split('Timer_Driver').join('TimerDriver');
const ren = BA.classify(BASE, RENAME, {});
assert.strictEqual(ren.verdict, 'rename', '同じ語の一斉付け替えは改名');
assert.deepStrictEqual(ren.renames, [{ from: 'Timer_Driver', to: 'TimerDriver' }], '組を名指しする');
assert.ok(BA.verdictText(ren).indexOf('Timer_Driver → TimerDriver') >= 0, '何を何にしたかを出す');
assert.strictEqual(BA.needsSvgCheck(ren), true, '改名は描画の幅が変わるので SVG は見る');

// 同じ語が行によって違う語になっていたら、それは改名ではない。
const INCONSISTENT = ['@startuml', "' 図の説明", 'participant TimerDriver', 'participant Irq_Ctrl',
  'Timer_Drv -> Irq_Ctrl : enable()', '@enduml'].join('\n');
assert.strictEqual(BA.classify(BASE, INCONSISTENT, {}).verdict, 'content',
  '付け替えの辻褄が合わなければ内容の変更に倒す');
assert.strictEqual(BA.renamesBetween(BASE, INCONSISTENT), null, '改名とは言わない');

// 骨格が動いたら改名ではない (矢印の向きが変わっている)。
const ARROW = BASE.replace('Timer_Driver -> Irq_Ctrl', 'Timer_Driver <- Irq_Ctrl');
assert.strictEqual(BA.classify(BASE, ARROW, {}).verdict, 'content', '記号が動けば内容の変更');

// ── 内容の変更 ──────────────────────────────────────────────────────────
const CONTENT = BASE.replace('@enduml', 'Irq_Ctrl -> Timer_Driver : ack()\n@enduml');
const con = BA.classify(BASE, CONTENT, { stamp: '20260916-2300' });
assert.strictEqual(con.verdict, 'content', '行が増えれば内容の変更');
assert.strictEqual(con.added, 1, '増えた行数を出す');
assert.strictEqual(con.removed, 0, '消えた行数を出す');
assert.ok(BA.verdictText(con).indexOf('中身を読んでください') >= 0, '読む必要があると言う');
assert.strictEqual(BA.needsSvgCheck(con), true, '内容が変われば SVG も並べる');

// 前の版が無い図は判定しない (このフォルダで初めての保存)。
const none = BA.classify(null, BASE, {});
assert.strictEqual(none.verdict, 'no-prev', '控えが無ければ判定しない');
assert.ok(BA.verdictText(none).indexOf('初めての保存') >= 0, '控えが無い理由を言う');
assert.strictEqual(BA.needsSvgCheck(none), false, '比べる版が無ければ並べない');

// ── 左右に置く行 ────────────────────────────────────────────────────────
const rows = BA.panes(BASE, CONTENT);
assert.ok(rows.length >= 6, '全文ぶんの行が出る (代表行に切り詰めない)');
assert.ok(rows.some(function(r) { return r.text && r.text.indexOf('ack()') >= 0; }),
  '増えた行が行として出る');

// ── フォルダ全体 ────────────────────────────────────────────────────────
// 無変化の回は、図を 1 枚も開かずに終われる。
const quiet = [same, fmt, BA.classify(BASE, SAME, {})];
assert.ok(BA.folderSummary(quiet).indexOf('読む図はありません') >= 0,
  '内容変更が 0 図なら「読む図なし」と即答する');
const busy = [same, fmt, ren, con, none];
assert.ok(BA.folderSummary(busy).indexOf('読む図 2 / 5 図') >= 0, '読む図の数を先に言う');
assert.ok(BA.folderSummary(busy).indexOf('内容の変更 1 図') >= 0, '内訳も出す');
assert.strictEqual(BA.folderSummary([]), '比べる図がありません', '図が無ければそう言う');

// 読む図が先頭に来る (手順 5 は上から順に読めば終わる)。
const ordered = BA.order([
  { verdict: 'same', name: 'a' }, { verdict: 'content', name: 'c' },
  { verdict: 'format', name: 'b' }, { verdict: 'rename', name: 'd' },
]);
assert.deepStrictEqual(ordered.map(function(v) { return v.name; }), ['c', 'd', 'b', 'a'],
  '内容の変更 → 改名 → 整形 → 差分なし の順');

console.log('blk-reviewer-20260917-0123-wish-review-before-after: ok');
