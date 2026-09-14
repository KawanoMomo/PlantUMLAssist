'use strict';
// BLK-junior-20260909-0603-wish: 先輩 (他の保存フォルダ) の図を手本にして白紙から
// 起こす業務では、手本は自分のタブに無い。覗く画面は全面のモーダルなので、
// 開いている間は書きかけが見えず、閉じると手本が消える。覗いた 1 枚を参照図に
// 据えられれば、既にある見比べ (右に並べる) と対応表がそのまま手本に効く。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/compare-view.js')]; } catch (e) {}
require('../src/core/compare-view.js');
var cv = global.window.MA.compareView;

var SENIOR = '@startuml\nstate IDLE\nIDLE --> RUNNING : start\n@enduml';

var DOCS = [
  { id: 'd1', name: 'my-timer', diagramType: 'plantuml-state', dsl: '@startuml\nstate IDLE\n@enduml' },
];

beforeEach(function() { cv.clearPeek(); });

describe('覗いた 1 枚を手本として据える', () => {
  test('据えると参照図の候補の先頭に出る (探し直さずに選ばれている)', () => {
    cv.setPeek('primary', 'timer_state.puml', SENIOR, 'plantuml-state');
    var o = cv.options(DOCS, 'd1');
    expect(o.length).toBe(1);
    expect(o[0].id).toBe(cv.PEEK_ID);
    expect(o[0].isPeek).toBe(true);
    expect(o[0].name).toBe('primary / timer_state.puml');
  });

  test('タブが 1 枚しか無くても、手本があれば並べられる', () => {
    expect(cv.canCompare(DOCS, 'd1')).toBe(false);
    cv.setPeek('primary', 'timer_state.puml', SENIOR, 'plantuml-state');
    expect(cv.canCompare(DOCS, 'd1')).toBe(true);
  });

  test('手本は他のタブより先に出る (自分で選んだ 1 枚が先頭)', () => {
    var docs = DOCS.concat([{ id: 'd2', name: 'other', diagramType: 'plantuml-state', dsl: '@startuml\n@enduml' }]);
    cv.setPeek('primary', 'timer_state.puml', SENIOR, 'plantuml-state');
    expect(cv.options(docs, 'd1').map(function(x) { return x.id; })).toEqual([cv.PEEK_ID, 'd2']);
  });

  test('本文が引ける (対応表・整合チェックがそのまま効く)', () => {
    cv.setPeek('primary', 'timer_state.puml', SENIOR, 'plantuml-state');
    var d = cv.doc(DOCS, cv.PEEK_ID);
    expect(d.dsl).toBe(SENIOR);
    expect(d.folder).toBe('primary');
    expect(d.fileName).toBe('timer_state.puml');
  });

  test('中身が空の図は据えない (並べても何も見えない)', () => {
    expect(cv.setPeek('primary', 'empty.puml', '   \n ')).toBe(null);
    expect(cv.peek()).toBe(null);
    expect(cv.options(DOCS, 'd1').length).toBe(0);
  });

  test('名前の無い図は据えない', () => {
    expect(cv.setPeek('primary', '', SENIOR)).toBe(null);
  });

  test('据え直すと後の 1 枚に入れ替わる (2 枚が候補に溜まらない)', () => {
    cv.setPeek('primary', 'a.puml', SENIOR);
    cv.setPeek('reviewer', 'b.puml', SENIOR);
    var o = cv.options(DOCS, 'd1');
    expect(o.length).toBe(1);
    expect(o[0].name).toBe('reviewer / b.puml');
  });

  test('外すと候補から消える', () => {
    cv.setPeek('primary', 'a.puml', SENIOR);
    cv.clearPeek();
    expect(cv.peek()).toBe(null);
    expect(cv.doc(DOCS, cv.PEEK_ID)).toBe(null);
    expect(cv.options(DOCS, 'd1').length).toBe(0);
  });

  test('見出しはどのフォルダの手本かを言う (自分の図と取り違えない)', () => {
    cv.setPeek('primary', 'timer_state.puml', SENIOR, 'plantuml-state');
    expect(cv.headerLabel(cv.peek())).toBe('手本: primary / timer_state.puml (state)');
  });

  test('フォルダ名が無ければファイル名だけで出す', () => {
    cv.setPeek('', 'timer_state.puml', SENIOR);
    expect(cv.peek().name).toBe('timer_state.puml');
  });

  test('編集中のタブや変更前の控えと混ざらない', () => {
    var snap = { dsl: '@startuml\nstate OLD\n@enduml' };
    cv.setPeek('primary', 'timer_state.puml', SENIOR);
    var o = cv.options(DOCS, 'd1', snap);
    expect(o.map(function(x) { return x.id; })).toEqual([cv.PEEK_ID, cv.BEFORE_ID]);
    expect(cv.doc(DOCS, cv.BEFORE_ID, 'd1', snap).dsl).toBe(snap.dsl);
    expect(cv.doc(DOCS, cv.PEEK_ID).dsl).toBe(SENIOR);
  });

  test('選んでいる手本は、編集中のタブを替えても指し続ける', () => {
    var docs = DOCS.concat([{ id: 'd2', name: 'other', diagramType: 'plantuml-state', dsl: '@startuml\n@enduml' }]);
    cv.setPeek('primary', 'timer_state.puml', SENIOR);
    expect(cv.pick(docs, 'd1', cv.PEEK_ID).id).toBe(cv.PEEK_ID);
    expect(cv.pick(docs, 'd2', cv.PEEK_ID).id).toBe(cv.PEEK_ID);
  });
});
