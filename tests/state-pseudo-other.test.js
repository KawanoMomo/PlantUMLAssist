'use strict';
// BLK-builder-20260907-1244-4: design 5d「UML 要素の網羅一覧」State 行の
// 「その他パレット」— fork / join、入口・出口ポイント、並行領域 (`--`)。
var jsdom = require('jsdom');
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/dsl-utils.js',
  '../src/core/state-transition.js',
  '../src/core/regex-parts.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/modules/state.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var stMod = global.window.MA.modules.plantumlState;

describe('state: fork / join / entryPoint / exitPoint', function() {
  test('fork と join がそれぞれの kind で読める', function() {
    var t = '@startuml\nstate Split1 <<fork>>\nstate Merge1 <<join>>\n@enduml';
    var r = stMod.parse(t);
    expect(r.states.length).toBe(2);
    expect(r.states[0].kind).toBe('fork');
    expect(r.states[0].stereotype).toBe('fork');
    expect(r.states[1].kind).toBe('join');
  });
  test('入口・出口ポイントが読める', function() {
    var t = '@startuml\nstate In1 <<entryPoint>>\nstate Out1 <<exitPoint>>\n@enduml';
    var r = stMod.parse(t);
    expect(r.states[0].kind).toBe('entryPoint');
    expect(r.states[1].kind).toBe('exitPoint');
  });
  test('既存の choice / history の kind は変わらない', function() {
    var t = '@startuml\nstate C <<choice>>\nstate H <<history>>\nstate D <<historyDeep>>\n@enduml';
    var r = stMod.parse(t);
    expect(r.states[0].kind).toBe('choice');
    expect(r.states[1].kind).toBe('history');
    expect(r.states[2].kind).toBe('historyDeep');
  });
  test('知らないステレオタイプは state のまま', function() {
    var r = stMod.parse('@startuml\nstate X <<whatever>>\n@enduml');
    expect(r.states[0].kind).toBe('state');
    expect(r.states[0].stereotype).toBe('whatever');
  });
  test('addState で fork を末尾に足せる', function() {
    var t = '@startuml\nstate A\n@enduml';
    var out = stMod.addState(t, 'Split1', 'Split1', 'fork');
    expect(out.indexOf('state Split1 <<fork>>')).toBeGreaterThan(-1);
    expect(stMod.parse(out).states[1].kind).toBe('fork');
  });
});

describe('state: 並行領域の区切り', function() {
  var COMPOSITE = [
    '@startuml',
    'state Outer {',
    '  state A',
    '  state B',
    '}',
    '@enduml',
  ].join('\n');

  test('複合状態の中の -- を region として読む', function() {
    var t = '@startuml\nstate Outer {\n  state A\n  --\n  state B\n}\n@enduml';
    var r = stMod.parse(t);
    expect(r.regions.length).toBe(1);
    expect(r.regions[0].parentId).toBe('Outer');
    expect(r.regions[0].line).toBe(4);
    expect(r.states.length).toBe(3);
  });
  test('|| も並行領域の区切りとして読む', function() {
    var t = '@startuml\nstate Outer {\n  state A\n  ||\n  state B\n}\n@enduml';
    expect(stMod.parse(t).regions.length).toBe(1);
  });
  test('複合状態の外の -- は region にしない', function() {
    var t = '@startuml\nstate A\n--\nstate B\n@enduml';
    expect(stMod.parse(t).regions.length).toBe(0);
  });
  test('addRegionSeparator が閉じ } の直前に -- を入れる', function() {
    var r = stMod.parse(COMPOSITE);
    var out = stMod.addRegionSeparator(COMPOSITE, 'Outer', r);
    var lines = out.split('\n');
    expect(lines[4].trim()).toBe('--');
    expect(lines[5].trim()).toBe('}');
    var r2 = stMod.parse(out);
    expect(r2.regions.length).toBe(1);
    expect(r2.regions[0].parentId).toBe('Outer');
  });
  test('単純 state を指定しても DSL は変わらない', function() {
    var t = '@startuml\nstate A\n@enduml';
    expect(stMod.addRegionSeparator(t, 'A', stMod.parse(t))).toBe(t);
  });
  test('存在しない id / 空 id では DSL は変わらない', function() {
    var r = stMod.parse(COMPOSITE);
    expect(stMod.addRegionSeparator(COMPOSITE, 'Nope', r)).toBe(COMPOSITE);
    expect(stMod.addRegionSeparator(COMPOSITE, '', r)).toBe(COMPOSITE);
  });
});
