'use strict';
// BLK-primary-20260908-1703-wish: 変更サマリボードの差分 1 件を「reviewer の指摘」に
// 1 クリックで結び、「指摘1 → 差分A / 指摘3 → 対応なし」の対応表を会議前に自動で作る。
// 記憶で突き合わせずに済むこと (対応なしが上に出る・未対応だけ抜ける・そのまま貼れる) を確かめる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

// localStorage を差し替えてから読み込む (実物の保存先を汚さない)。共有 window の
// localStorage は無いか、opaque origin の jsdom では参照で例外を投げる。
var store = {};
Object.defineProperty(global.window, 'localStorage', {
  configurable: true,
  value: {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function(k, v) { store[k] = String(v); },
    removeItem: function(k) { delete store[k]; },
  },
});

try { delete require.cache[require.resolve('../src/core/finding-link.js')]; } catch (e) {}
require('../src/core/finding-link.js');
var FL = global.window.MA.findingLink;

var failures = [];
function ok(cond, msg) { if (!cond) failures.push(msg); }
function eq(actual, expected, msg) {
  if (actual !== expected) failures.push(msg + ' — 期待 ' + JSON.stringify(expected) + ' / 実際 ' + JSON.stringify(actual));
}
function reset() {
  for (var k in store) { if (Object.prototype.hasOwnProperty.call(store, k)) delete store[k]; }
  FL._reset();
}

// 指摘 (pin-inbox.collect の戻りと同じ形)。
function pin(doc, id, text, state, line) {
  return { doc: doc, id: id, text: text, state: state || 'open', line: line || 0, author: 'reviewer' };
}

// ---- キー ------------------------------------------------------------------
// 指摘ピンの id は図ごとに 1 始まり。図名を含めないと別の図の指摘と衝突する。
eq(FL.keyOf(pin('adc_state.puml', '1', 'x')), 'adc_state.puml#1', '指摘のキーは 図名#id');
eq(FL.keyOf(pin('gpio_state.puml', '1', 'x')), 'gpio_state.puml#1', '別の図の同じ id は別のキー');
eq(FL.keyOf({ doc: '', id: '1' }), '', '図名の無い指摘はキーを持たない');
eq(FL.keyOf(null), '', 'null でも落ちない');

// ---- 1 クリックで結ぶ / 外す ------------------------------------------------
reset();
eq(FL.toggle('adc_state.puml#1', 'adc_driver.puml'), true, '1 回押すと結ばれる');
ok(FL.isLinked('adc_state.puml#1', 'adc_driver.puml'), '結んだ図が結ばれている');
eq(FL.docsOf('adc_state.puml#1').length, 1, '結んだ図は 1 枚');
eq(FL.toggle('adc_state.puml#1', 'adc_driver.puml'), false, 'もう一度押すと外れる');
eq(FL.docsOf('adc_state.puml#1').length, 0, '外したら 0 枚');
eq(FL.count(), 0, '結び目が無くなったら控えにも残さない');

// 1 つの指摘に複数の図。1 件の指摘を 2 枚の図で直すことがある。
reset();
FL.toggle('adc_state.puml#1', 'adc_driver.puml');
FL.toggle('adc_state.puml#1', 'adc_init_sequence.puml');
eq(FL.docsOf('adc_state.puml#1').join(','), 'adc_driver.puml,adc_init_sequence.puml', '2 枚まで結べる');
// 図の側から引ける (ボードのエントリに件数を出すため)。
FL.toggle('gpio_state.puml#2', 'adc_driver.puml');
eq(FL.keysOf('adc_driver.puml').join(','), 'adc_state.puml#1,gpio_state.puml#2', '図から指摘を引ける');
eq(FL.keysOf('無い図.puml').length, 0, '結ばれていない図は 0 件');

// ---- 控えの読み書き --------------------------------------------------------
reset();
FL.toggle('a.puml#1', 'x.puml');
FL._reset();
eq(FL.docsOf('a.puml#1').join(','), 'x.puml', '画面を開き直しても結び目が残る');
eq(Object.keys(FL.parse('{')).length, 0, '壊れた控えは空として読む (画面を止めない)');
eq(Object.keys(FL.parse(FL.serialize({ 'a#1': ['x'], 'b#2': [] }))).length, 1, '空の並びは落とす');

// ---- 対応表 ----------------------------------------------------------------
reset();
var findings = [
  pin('adc_state.puml', '1', 'Done→Configured の遷移が無い', 'open', 12),
  pin('adc_state.puml', '2', 'リセットフローが片方向', 'done', 20),
  pin('gpio_state.puml', '1', '命名が他系統と違う', 'open', 5),
];
var board = { entries: [{ name: 'adc_driver.puml' }, { name: 'adc_state.puml' }] };
FL.toggle('adc_state.puml#1', 'adc_driver.puml');       // 変わった図に結んだ → 対応済み
FL.toggle('adc_state.puml#2', 'uart_driver.puml');      // 結んだ図がボードに無い → 差分なし
// gpio_state.puml#1 はどこにも結んでいない → 対応なし

var table = FL.buildTable({ findings: findings, board: board });
eq(table.total, 3, '指摘 3 件が表に並ぶ');
eq(table.linked, 1, '対応済みは 1 件');
eq(table.stale, 1, '結んだ図に差分が無いものは 1 件');
eq(table.none, 1, '対応なしは 1 件');
eq(table.pending, 2, '未対応 (対応なし + 差分なし) は 2 件');
eq(table.rows[0].status, 'none', '会議前に埋めるべき「対応なし」が先頭');
eq(table.rows[0].doc, 'gpio_state.puml', '対応なしの指摘が先頭');
eq(table.rows[2].status, 'linked', '対応済みは末尾');
eq(table.rows[2].changedDocs.join(','), 'adc_driver.puml', '対応済みの行に変更した図が入る');
eq(table.rows[2].line, 12, '指摘の行番号を持ち回る');

// 未対応だけを開く (指摘一覧から未対応の項目だけを追える)。
var pending = FL.pendingRows(table);
eq(pending.length, 2, '未対応だけ抜くと 2 件');
ok(pending.every(function(r) { return r.status !== 'linked'; }), '未対応に対応済みが混ざらない');

eq(FL.summaryText(table), '指摘 3 件 (対応 1 / 未対応 2)', '見出しは対応と未対応の件数');
eq(FL.summaryText(FL.buildTable({ findings: [], board: board })), '', '指摘が無ければ見出しを出さない');
eq(FL.statusLabel('none'), '対応なし', '対応なしの表示');
eq(FL.statusLabel('linked'), '対応済み', '対応済みの表示');

// board を渡さなくても「結んだかどうか」は分かる (基準を取り直した直後)。
var noBoard = FL.buildTable({ findings: findings });
eq(noBoard.linked, 0, 'ボードが無ければ対応済みは 0 件');
eq(noBoard.pending, 3, 'ボードが無ければ全件が未対応扱い');

// ---- 書き出し --------------------------------------------------------------
var md = FL.toMarkdown(table, { at: '2026-09-08T17:40:00.000Z' });
ok(md.indexOf('# 指摘と変更の対応表') === 0, '見出しから始まる');
ok(md.indexOf('2026-09-08 17:40') >= 0, '作成日時が入る');
ok(md.indexOf('| gpio_state.puml:5 #1 |') >= 0, '指摘の場所が入る');
ok(md.indexOf('対応なし') >= 0, '対応なしの指摘がそう書かれる');
ok(md.indexOf('adc_driver.puml') >= 0, '対応した図の名前が入る');
eq(md.split('\n').filter(function(l) { return l.indexOf('| ') === 0; }).length, 4, '見出し行 + 3 件');

// 表を割らない: 指摘の本文に | や改行があってもセルが増えない。
var odd = FL.buildTable({ findings: [pin('a.puml', '1', '幅 | 高さ\nを直す')] });
var oddLine = FL.toMarkdown(odd).split('\n').filter(function(l) { return l.indexOf('| a.puml') === 0; })[0];
eq(oddLine.split(/(?<!\\)\|/).length, 6, '本文の | を逃がして 4 列のまま');
ok(oddLine.indexOf('\n') < 0, '本文の改行を 1 行に畳む');

eq(FL.toMarkdown(FL.buildTable({ findings: [] })).indexOf('- 図に指摘ピンがありません') > 0, true,
  '指摘が無いときは空の表ではなくその旨を書く');
eq(FL.fileName('2026-09-08T17:40:00.000Z'), '指摘対応表-20260908-1740.md', '書き出し名に日時が入る');
eq(FL.fileName(''), '指摘対応表.md', '日時が無ければ素の名前');

if (failures.length) {
  console.error('FAIL blk-primary-1703-wish-finding-link:');
  failures.forEach(function(m) { console.error('  - ' + m); });
  process.exit(1);
}
console.log('ok blk-primary-1703-wish-finding-link');
