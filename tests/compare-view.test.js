'use strict';
// BLK-junior-20260907-0823-wish: 2 枚の図を並べて見比べる。
// 「どれを並べるか」の判断だけを純関数として持つ (描画は app.js)。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/compare-view.js')]; } catch (e) {}
require('../src/core/compare-view.js');
var cv = global.window.MA.compareView;

var DOCS = [
  { id: 'd1', name: 'senior-class', diagramType: 'plantuml-class', dsl: '@startuml\nclass A\n@enduml' },
  { id: 'd2', name: 'my-class', diagramType: 'plantuml-class', dsl: '@startuml\nclass B\n@enduml' },
  { id: 'd3', name: 'seq', diagramType: 'plantuml-sequence', dsl: '@startuml\nA -> B : x\n@enduml' },
];

describe('compareView.options', () => {
  test('編集中のタブは並べる候補から外れる', () => {
    var o = cv.options(DOCS, 'd2');
    expect(o.length).toBe(2);
    expect(o.map(function(x) { return x.id; })).toEqual(['d1', 'd3']);
  });

  test('候補はタブの並び順を保つ', () => {
    expect(cv.options(DOCS, 'd1').map(function(x) { return x.id; })).toEqual(['d2', 'd3']);
  });

  test('タブが 1 枚なら候補は無い', () => {
    expect(cv.options([DOCS[0]], 'd1').length).toBe(0);
  });

  test('docs が空・未定義でも落ちない', () => {
    expect(cv.options([], 'd1').length).toBe(0);
    expect(cv.options(null, 'd1').length).toBe(0);
    expect(cv.options(undefined, undefined).length).toBe(0);
  });

  test('id を持たない項目は候補にしない', () => {
    expect(cv.options([{ name: 'broken' }, DOCS[0]], 'd2').length).toBe(1);
  });

  test('候補は id / name / diagramType だけを持つ (dsl は運ばない)', () => {
    var o = cv.options(DOCS, 'd2')[0];
    expect(o.id).toBe('d1');
    expect(o.name).toBe('senior-class');
    expect(o.diagramType).toBe('plantuml-class');
    expect(o.dsl).toBe(undefined);
  });
});

describe('compareView.pick', () => {
  test('選んでいた図がまだ候補にあるならそれを指し続ける', () => {
    expect(cv.pick(DOCS, 'd2', 'd3').id).toBe('d3');
  });

  test('選んでいた図が編集中のタブになったら先頭の候補に移る', () => {
    expect(cv.pick(DOCS, 'd3', 'd3').id).toBe('d1');
  });

  test('何も選んでいなければ先頭の候補を出す', () => {
    expect(cv.pick(DOCS, 'd1', null).id).toBe('d2');
  });

  test('閉じられた図を指していたら先頭の候補に移る', () => {
    expect(cv.pick(DOCS, 'd1', 'gone').id).toBe('d2');
  });

  test('候補が無ければ null', () => {
    expect(cv.pick([DOCS[0]], 'd1', null)).toBeNull();
    expect(cv.pick([], null, null)).toBeNull();
  });
});

describe('compareView.doc / canCompare / headerLabel', () => {
  test('doc は id で 1 件引く', () => {
    expect(cv.doc(DOCS, 'd3').dsl).toContain('A -> B');
    expect(cv.doc(DOCS, 'gone')).toBeNull();
    expect(cv.doc(null, 'd1')).toBeNull();
  });

  test('canCompare はタブが 2 枚以上あるときだけ true', () => {
    expect(cv.canCompare(DOCS, 'd1')).toBe(true);
    expect(cv.canCompare([DOCS[0]], 'd1')).toBe(false);
  });

  test('headerLabel は参照側だと分かる文言を出す', () => {
    expect(cv.headerLabel(DOCS[0])).toBe('参照: senior-class (class)');
    expect(cv.headerLabel(null)).toBe('参照する図がありません');
  });
});
