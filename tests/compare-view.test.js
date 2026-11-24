'use strict';
// BLK-junior-20260907-0823-wish: 2 枚の図を並べて見比べる。
// 「どれを並べるか」の判断だけを純関数として持つ (描画は app.js)。
// TICKET-owner-20261115-2141-prune: 2 枚を比べるのは「この図の履歴」の版との比較だけ。
// 別のタブの図は相手にせず、この図の版のタブ (`{名前}@{刻印}`) だけを候補にする。
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
  { id: 'v1', name: 'my-class@20261116-0700', diagramType: 'plantuml-class', dsl: '@startuml\nclass B0\n@enduml' },
  { id: 'v2', name: 'my-class@20261115-1200', diagramType: 'plantuml-class', dsl: '@startuml\nclass B1\n@enduml' },
  { id: 'd3', name: 'seq', diagramType: 'plantuml-sequence', dsl: '@startuml\nA -> B : x\n@enduml' },
];

describe('compareView.options', () => {
  test('相手はこの図の版のタブだけ (別のタブの図・編集中のタブは出さない)', () => {
    var o = cv.options(DOCS, 'd2');
    expect(o.map(function(x) { return x.id; })).toEqual(['v1', 'v2']);
    expect(o.every(function(x) { return x.isVersion; })).toBe(true);
  });

  test('版の無い図には候補が無い', () => {
    expect(cv.options(DOCS, 'd1').length).toBe(0);
    expect(cv.options(DOCS, 'd3').length).toBe(0);
  });

  test('isVersionOf は `{名前}@` で始まる名前だけを版とみなす', () => {
    expect(cv.isVersionOf('my-class@20261116-0700', 'my-class')).toBe(true);
    expect(cv.isVersionOf('my-class', 'my-class')).toBe(false);
    expect(cv.isVersionOf('my-class@', 'my-class')).toBe(false);
    expect(cv.isVersionOf('my-classic@1', 'my-class')).toBe(false);
    expect(cv.isVersionOf('x@1', '')).toBe(false);
  });

  test('docs が空・未定義でも落ちない', () => {
    expect(cv.options([], 'd1').length).toBe(0);
    expect(cv.options(null, 'd1').length).toBe(0);
    expect(cv.options(undefined, undefined).length).toBe(0);
  });

  test('候補は dsl を運ばない', () => {
    var o = cv.options(DOCS, 'd2')[0];
    expect(o.dsl).toBe(undefined);
  });
});

describe('compareView.pick', () => {
  test('選んでいた版がまだ候補にあるならそれを指し続ける', () => {
    expect(cv.pick(DOCS, 'd2', 'v2').id).toBe('v2');
  });

  test('何も選んでいなければ先頭の候補を出す', () => {
    expect(cv.pick(DOCS, 'd2', null).id).toBe('v1');
  });

  test('別のタブの図を指していたら先頭の版に移る', () => {
    expect(cv.pick(DOCS, 'd2', 'd1').id).toBe('v1');
  });

  test('版が無ければ null', () => {
    expect(cv.pick(DOCS, 'd1', 'd2')).toBe(null);
  });
});

describe('compareView.doc / canCompare / headerLabel', () => {
  test('doc は本文ごと引ける', () => {
    expect(cv.doc(DOCS, 'v1').dsl).toContain('B0');
    expect(cv.doc(DOCS, 'nope')).toBe(null);
  });

  test('canCompare はこの図の版があるときだけ true', () => {
    expect(cv.canCompare(DOCS, 'd2')).toBe(true);
    expect(cv.canCompare(DOCS, 'd1')).toBe(false);
  });

  test('headerLabel は前の版だと分かる文言を出す', () => {
    expect(cv.headerLabel(DOCS[2])).toBe('前の版: my-class@20261116-0700 (class)');
    expect(cv.headerLabel(null)).toBe('比べる版がありません');
  });
});
