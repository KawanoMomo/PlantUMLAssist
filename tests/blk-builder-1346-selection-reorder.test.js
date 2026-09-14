'use strict';
// BLK-builder-20260907-1346-3 (design 5b「Alt+↑ / Alt+↓ — 選択を上下に並び替える (同じ親の中だけ)」):
// 図で選んでいる要素を前後の兄弟と入れ替える。ブロックの中から外へは出さず、
// 隣がブロックならその全体をまたぐ。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/selection-reorder.js')]; } catch (e) {}
require('../src/core/selection-reorder.js');
var SR = global.window.MA.selectionReorder;

function L(s) { return s.split('\n'); }

var SEQ = [
  '@startuml',                 // 1
  'participant A',             // 2
  'participant B',             // 3
  'A -> B : one',              // 4
  'A -> B : two',              // 5
  'A -> B : three',            // 6
  '@enduml',                   // 7
].join('\n');

var ACT = [
  '@startuml',                 // 1
  'start',                     // 2
  ':A;',                       // 3
  'if (c?) then (yes)',        // 4
  '  :X;',                     // 5
  '  :Y;',                     // 6
  'else (no)',                 // 7
  '  :Z;',                     // 8
  'endif',                     // 9
  ':B;',                       // 10
  'stop',                      // 11
  '@enduml',                   // 12
].join('\n');

describe('BLK-builder-1346 兄弟の入れ替え', function() {
  test('下の兄弟と入れ替える', function() {
    var out = L(SR.move(SEQ, 5, 1));
    expect(out[4]).toBe('A -> B : three');
    expect(out[5]).toBe('A -> B : two');
  });

  test('上の兄弟と入れ替える', function() {
    var out = L(SR.move(SEQ, 5, -1));
    expect(out[3]).toBe('A -> B : two');
    expect(out[4]).toBe('A -> B : one');
  });

  test('移動後の行番号を返す', function() {
    expect(SR.movedLine(SEQ, 5, 1)).toBe(6);
    expect(SR.movedLine(SEQ, 5, -1)).toBe(4);
  });

  test('行数も中身の集合も変わらない', function() {
    var out = SR.move(SEQ, 5, 1);
    expect(L(out).length).toBe(L(SEQ).length);
    expect(L(out).slice().sort().join('|')).toBe(L(SEQ).slice().sort().join('|'));
  });
});

describe('BLK-builder-1346 同じ親の中から出さない', function() {
  test('then 側の先頭を上へ動かそうとしても DSL は変わらない', function() {
    expect(SR.move(ACT, 5, -1)).toBe(ACT);        // :X; の上は if 行
    expect(SR.canMove(ACT, 5, -1)).toBe(false);
  });

  test('then 側の末尾を下へ動かそうとしても DSL は変わらない', function() {
    expect(SR.move(ACT, 6, 1)).toBe(ACT);         // :Y; の下は else 行
    expect(SR.canMove(ACT, 6, 1)).toBe(false);
  });

  test('then 側の中では入れ替わる', function() {
    var out = L(SR.move(ACT, 5, 1));
    expect(out[4]).toBe('  :Y;');
    expect(out[5]).toBe('  :X;');
  });

  test('start / stop を越えない', function() {
    expect(SR.move(ACT, 3, -1)).toBe(ACT);        // :A; の上は start
    expect(SR.move(ACT, 10, 1)).toBe(ACT);        // :B; の下は stop
  });

  test('else / endif そのものは動かさない', function() {
    expect(SR.move(ACT, 7, 1)).toBe(ACT);
    expect(SR.move(ACT, 9, -1)).toBe(ACT);
    expect(SR.unitAt(ACT, 7)).toBe(null);
  });
});

describe('BLK-builder-1346 隣がブロックならその全体をまたぐ', function() {
  test(':A; を下へ動かすと if ブロック全体の後ろに出る', function() {
    var out = L(SR.move(ACT, 3, 1));
    expect(out[2]).toBe('if (c?) then (yes)');
    expect(out[8]).toBe(':A;');
    expect(out[9]).toBe(':B;');
    expect(SR.movedLine(ACT, 3, 1)).toBe(9);
  });

  test(':B; を上へ動かすと if ブロック全体の前に出る', function() {
    var out = L(SR.move(ACT, 10, -1));
    expect(out[3]).toBe(':B;');
    expect(out[4]).toBe('if (c?) then (yes)');
    expect(SR.movedLine(ACT, 10, -1)).toBe(4);
  });

  test('if ブロックの開き行を選べばブロックごと動く', function() {
    var out = L(SR.move(ACT, 4, 1));
    expect(out[2]).toBe(':A;');
    expect(out[3]).toBe(':B;');
    expect(out[4]).toBe('if (c?) then (yes)');
    expect(out[9]).toBe('endif');
  });
});

describe('BLK-builder-1346 その他の境界', function() {
  test('空行はまたいで入れ替え、空行の位置は動かさない', function() {
    var dsl = '@startuml\nA -> B : one\n\nA -> B : two\n@enduml';
    var out = L(SR.move(dsl, 2, 1));
    expect(out[1]).toBe('A -> B : two');
    expect(out[2]).toBe('');
    expect(out[3]).toBe('A -> B : one');
  });

  test('@startuml / @enduml は動かさないし、越えもしない', function() {
    var dsl = '@startuml\nA -> B : one\n@enduml';
    expect(SR.move(dsl, 1, 1)).toBe(dsl);
    expect(SR.move(dsl, 2, 1)).toBe(dsl);
    expect(SR.move(dsl, 2, -1)).toBe(dsl);
  });

  test('閉じていないブロックは動かさない', function() {
    var broken = '@startuml\nstart\nif (c?) then (yes)\n  :X;\n@enduml';
    expect(SR.move(broken, 3, 1)).toBe(broken);
  });

  test('範囲外の行番号でも例外を投げない', function() {
    expect(SR.move(SEQ, 0, 1)).toBe(SEQ);
    expect(SR.move(SEQ, 99, -1)).toBe(SEQ);
    expect(SR.movedLine(SEQ, 99, -1)).toBe(99);
  });
});
