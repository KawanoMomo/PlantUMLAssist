'use strict';
// BLK-primary-20260912-2206-wish: driver_common_class / plantuml-class / diagram1 の
// 3 枚が同時に雛形と完全一致まで落ちた。保存した 1 枚の警告だけでは 3 枚目が黙ったまま
// 残り、直すには `_versions/` の過去版を手で探して打ち直すしかなかった。
// 「フォルダ全体で一致した組を全部挙げる」「戻す先を 1 つ選べる」を固定する。
const assert = require('assert');
if (!global.window) global.window = global;
try { delete require.cache[require.resolve('../src/core/save-swap.js')]; } catch (e) {}
try { delete require.cache[require.resolve('../src/core/twin-restore.js')]; } catch (e) {}
require('../src/core/save-swap.js');
var TR = require('../src/core/twin-restore.js');

var TEMPLATE_CLASS = ['@startuml', 'class Foo', '@enduml'].join('\n');
var TEMPLATE_SEQ = ['@startuml', 'A -> B : x', 'B -> A : y', '@enduml'].join('\n');
var EMPTY = ['@startuml', "' メモ", '@enduml'].join('\n');
var HEALTHY = ['@startuml', 'state Idle', 'Idle --> Run : start', '@enduml'].join('\n');

// --- 事故そのもの: 3 枚が 2 つの組に割れているのを 1 度に挙げる ---------------
(function theAccident() {
  var gs = TR.groups([
    { name: 'driver_common_class', dsl: TEMPLATE_CLASS },
    { name: 'plantuml-class', dsl: TEMPLATE_CLASS },
    { name: 'diagram1', dsl: TEMPLATE_SEQ },
    { name: 'plantuml-sequence', dsl: TEMPLATE_SEQ },
    { name: 'gpio_state', dsl: HEALTHY },
  ]);
  assert.strictEqual(gs.length, 2, '一致した組を 2 つとも挙げる');
  assert.deepStrictEqual(gs[0].names, ['diagram1', 'plantuml-sequence']);
  assert.deepStrictEqual(gs[1].names, ['driver_common_class', 'plantuml-class']);

  // 保存したのは driver_common_class だけでも、diagram1 側の組が画面に出る
  // (3 枚目に気付けるのはここだけ)。
  var lines = TR.groupLines(gs);
  assert.strictEqual(lines.length, 2);
  assert.ok(lines[0].indexOf('diagram1 と plantuml-sequence') >= 0, lines[0]);
  assert.ok(lines[1].indexOf('driver_common_class と plantuml-class') >= 0, lines[1]);
  assert.ok(lines[1].indexOf('3 行') >= 0, '何行に落ちたかも言う: ' + lines[1]);

  var g = TR.groupFor(gs, 'driver_common_class');
  assert.ok(g && g.names.indexOf('plantuml-class') >= 0, '保存した図の組を引ける');
  assert.strictEqual(TR.groupFor(gs, 'gpio_state'), null, '無事な図には何も出さない');
})();

// --- ふつうのフォルダでは黙る -----------------------------------------------
(function quiet() {
  assert.deepStrictEqual(TR.groups([
    { name: 'a', dsl: HEALTHY },
    { name: 'b', dsl: TEMPLATE_CLASS },
  ]), [], '中身が違えば組にしない');

  // 改行コードと行末の空白だけの違いは「別の中身」ではない (save-swap と同じ規約)。
  var gs = TR.groups([
    { name: 'a', dsl: HEALTHY },
    { name: 'b', dsl: HEALTHY.replace(/\n/g, '\r\n') + '  \n\n' },
  ]);
  assert.strictEqual(gs.length, 1, '改行の違いは一致とみなす');

  assert.deepStrictEqual(TR.groups([
    { name: 'x', dsl: EMPTY }, { name: 'y', dsl: EMPTY },
  ]), [], '中身の無い図どうしの一致は事故ではない');
})();

// --- 戻す先を選ぶ -----------------------------------------------------------
(function pick() {
  // version-history.rows() の形 (新しい順)。雛形に落ちた今は 3 行。
  var rows = [
    { stamp: '20260912-100000', label: '09/12 19:00', lines: 4 },   // 事故の直後の版
    { stamp: '20260912-090000', label: '09/12 18:00', lines: 38 },  // 事故の直前
    { stamp: '20260911-090000', label: '09/11 18:00', lines: 30 },
  ];
  var p = TR.pickVersion(rows, { currentLines: 3 });
  assert.strictEqual(p.stamp, '20260912-090000',
    '今より大きく行数の多い版のうち、いちばん新しいものに戻す');
  assert.ok(TR.restoreLabel(p).indexOf('09/12 18:00') >= 0, '押す前にどの版か読める');
  assert.ok(TR.restoreLabel(p).indexOf('38 行') >= 0);
  assert.ok(TR.restoredLine('driver_common_class', p).indexOf('保存フォルダ') >= 0,
    '戻したあと、ファイルにも書き戻ったことまで言う');

  assert.strictEqual(TR.pickVersion(rows, { currentLines: 40 }), null,
    '戻す先が無いときは「戻す」を出さない');
  assert.strictEqual(TR.pickVersion([], { currentLines: 3 }), null);
  assert.strictEqual(TR.pickVersion(null, { currentLines: 3 }), null);
  assert.strictEqual(TR.pickVersion([{ stamp: 's', label: 'l', lines: 6 }], { currentLines: 3 }),
    null, '数行の増減は書き足しであって、戻す対象ではない');
})();

console.log('blk-primary-2206-wish-twin-restore: ok');
