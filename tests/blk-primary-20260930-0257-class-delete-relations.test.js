'use strict';
// BLK-primary-20260930-0257: 1 枚のクラス図を「複製」して要らないクラスを消し、2 枚に分けたい。
// 「クラスを削除」は宣言の行だけを消し、そのクラスへの関係の行を残していたので、PlantUML が関係の行から
// 同じ名前のクラスを描き直し、消したクラスが図に残った。関係の行も一緒に消し、確かめる窓で数を先に言う。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/core/relation-options.js',
  '../src/modules/class.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var clMod = global.window.MA.modules.plantumlClass;

var DOC = [
  '@startuml',
  'interface ISpi',
  'class SpiDrv {',
  '  +init()',
  '}',
  'class App',
  'class Driver_Common',
  'note right of ISpi : SPI の口',
  'App ..> ISpi : uses',
  'SpiDrv ..|> ISpi',
  'ISpi --> Driver_Common',
  'SpiDrv --|> Driver_Common',
  '@enduml',
].join('\n');

describe('クラスを削除すると、繋がる関係の行も消える (BLK-primary-20260930-0257)', function() {
  test('宣言・note・そのクラスに繋がる関係の行が消え、他の関係は残る', function() {
    var out = clMod.deleteClassWithNotes(DOC, 'ISpi');
    expect(out).not.toContain('interface ISpi');
    expect(out).not.toContain('note right of ISpi');
    expect(out).not.toContain('App ..> ISpi');
    expect(out).not.toContain('SpiDrv ..|> ISpi');
    expect(out).not.toContain('ISpi --> Driver_Common');
    // 本文のどこにも ISpi が残らない (PlantUML が描き直す元が無い)。
    expect(out).not.toContain('ISpi');
    // 関係の無いクラス・他の関係はそのまま。
    expect(out).toContain('class SpiDrv {');
    expect(out).toContain('SpiDrv --|> Driver_Common');
    expect(out).toContain('class App');
  });

  test('本体の {} ごと消える', function() {
    var out = clMod.deleteClassWithNotes(DOC, 'SpiDrv');
    expect(out).not.toContain('SpiDrv');
    expect(out).not.toContain('+init()');
    expect(out).toContain('App ..> ISpi : uses');
    expect(out).toContain('ISpi --> Driver_Common');
  });

  test('消える関係と note の数を先に数える', function() {
    var plan = clMod.classDeletePlan(DOC, 'ISpi');
    expect(plan.relations).toBe(3);
    expect(plan.notes).toBe(1);
    expect(clMod.classDeleteMessage('ISpi', plan)).toBe('クラス ISpi を削除します。関係 3 本とnote 1 つも消えます。');
  });

  test('繋がりが無ければそう言う。無いクラスは何もしない', function() {
    var plan = clMod.classDeletePlan(DOC, 'App');
    expect(plan.relations).toBe(1);
    expect(plan.notes).toBe(0);
    var lone = '@startuml\nclass Solo\nclass Other\n@enduml';
    var p2 = clMod.classDeletePlan(lone, 'Solo');
    expect(clMod.classDeleteMessage('Solo', p2)).toBe('クラス Solo を削除します。繋がる関係と note はありません。');
    expect(clMod.classDeletePlan(lone, 'Nope')).toBe(null);
    expect(clMod.deleteClassWithNotes(lone, 'Nope')).toBe(lone);
  });

  test('自分への関係 (自己参照) は 1 本として数え、1 回だけ消す', function() {
    var t = '@startuml\nclass Node\nclass List\nNode --> Node : next\nList o-- Node\n@enduml';
    var plan = clMod.classDeletePlan(t, 'Node');
    expect(plan.relations).toBe(2);
    var out = clMod.deleteClassWithNotes(t, 'Node');
    expect(out).toBe('@startuml\nclass List\n@enduml');
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
