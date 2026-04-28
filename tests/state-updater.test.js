'use strict';
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/dsl-utils.js',
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

describe('state formatters', function() {
  test('fmtState bare', function() {
    expect(stMod.fmtState('A', 'A', null)).toBe('state A');
  });
  test('fmtState with stereotype', function() {
    expect(stMod.fmtState('X', 'X', 'choice')).toBe('state X <<choice>>');
  });
  test('fmtState with quoted label', function() {
    expect(stMod.fmtState('A', 'My Label', null)).toBe('state "My Label" as A');
  });
  test('fmtTransition without label', function() {
    expect(stMod.fmtTransition('A', 'B', null, null, null)).toBe('A --> B');
  });
  test('fmtTransition with full label', function() {
    expect(stMod.fmtTransition('A', 'B', 'click', 'enabled', 'save()')).toBe('A --> B : click [enabled] / save()');
  });
  test('fmtTransition with only trigger', function() {
    expect(stMod.fmtTransition('A', 'B', 'click', null, null)).toBe('A --> B : click');
  });
  test('fmtTransition with [*]', function() {
    expect(stMod.fmtTransition('[*]', 'A', null, null, null)).toBe('[*] --> A');
  });
  test('fmtNote 1-line', function() {
    expect(stMod.fmtNote('right', 'A', 'tip')).toBe('note right of A : tip');
  });
  test('fmtNote multi-line returns array', function() {
    expect(stMod.fmtNote('left', 'A', 'a\nb')).toEqual(['note left of A', 'a', 'b', 'end note']);
  });
});

describe('state add ops', function() {
  test('addState appends bare state', function() {
    var t = '@startuml\n@enduml';
    var out = stMod.addState(t, 'A', 'A', null);
    expect(out).toContain('state A');
  });
  test('addState with stereotype', function() {
    var t = '@startuml\n@enduml';
    var out = stMod.addState(t, 'X', 'X', 'choice');
    expect(out).toContain('state X <<choice>>');
  });
  test('addCompositeState appends state X { } skeleton', function() {
    var t = '@startuml\n@enduml';
    var out = stMod.addCompositeState(t, 'Outer');
    expect(out).toContain('state Outer {');
    expect(out).toContain('}');
  });
  test('addTransition', function() {
    var t = '@startuml\nstate A\nstate B\n@enduml';
    var out = stMod.addTransition(t, 'A', 'B', 'click', null, null);
    expect(out).toContain('A --> B : click');
  });
  test('addNote', function() {
    var t = '@startuml\nstate A\n@enduml';
    var out = stMod.addNote(t, 'A', 'right', 'tip');
    expect(out).toContain('note right of A : tip');
  });
  test('addStateAtLine inserts before specified line', function() {
    var t = '@startuml\nstate A\nstate B\n@enduml';
    var out = stMod.addStateAtLine(t, 3, 'before', 'NEW', null);
    var ls = out.split('\n');
    expect(ls[2]).toBe('state NEW');
  });
});

describe('state update/delete ops', function() {
  test('updateState changes id', function() {
    var t = '@startuml\nstate Old\n@enduml';
    var out = stMod.updateState(t, 2, { id: 'New' });
    expect(out).toContain('state New');
  });
  test('updateState changes stereotype', function() {
    var t = '@startuml\nstate X\n@enduml';
    var out = stMod.updateState(t, 2, { stereotype: 'choice' });
    expect(out).toContain('state X <<choice>>');
  });
  test('updateTransition changes label', function() {
    var t = '@startuml\nA --> B : old\n@enduml';
    var out = stMod.updateTransition(t, 2, { trigger: 'new' });
    expect(out).toContain('A --> B : new');
  });
  test('updateTransition swap from/to', function() {
    var t = '@startuml\nA --> B\n@enduml';
    var out = stMod.updateTransition(t, 2, { from: 'B', to: 'A' });
    expect(out).toContain('B --> A');
  });
  test('updateNote', function() {
    var t = '@startuml\nstate A\nnote right of A : old\n@enduml';
    var out = stMod.updateNote(t, 3, 3, { position: 'left', text: 'new' });
    expect(out).toContain('note left of A : new');
  });
  test('deleteNode removes single line', function() {
    var t = '@startuml\nstate A\nstate B\n@enduml';
    var out = stMod.deleteNode(t, 2, 2);
    expect(out).not.toContain('state A');
    expect(out).toContain('state B');
  });
  test('deleteStateWithRefs cascades incoming/outgoing transitions + notes', function() {
    var t = '@startuml\nstate A\nstate B\nA --> B\nB --> A\nnote right of A : x\n@enduml';
    var out = stMod.deleteStateWithRefs(t, 'A');
    expect(out).not.toContain('state A');
    expect(out).not.toContain('A --> B');
    expect(out).not.toContain('B --> A');
    expect(out).not.toContain('note right of A');
    expect(out).toContain('state B');
  });
});

describe('state setStateBehavior', function() {
  test('inserts entry description line', function() {
    var t = '@startuml\nstate Driving\n@enduml';
    var out = stMod.setStateBehavior(t, 'Driving', 'entry', 'start_engine()');
    expect(out).toContain('Driving : entry / start_engine()');
  });
  test('updates existing entry line', function() {
    var t = '@startuml\nstate Driving\nDriving : entry / old()\n@enduml';
    var out = stMod.setStateBehavior(t, 'Driving', 'entry', 'new()');
    expect(out).toContain('Driving : entry / new()');
    expect(out).not.toContain('old()');
  });
  test('removes line when value is empty', function() {
    var t = '@startuml\nstate Driving\nDriving : entry / x()\n@enduml';
    var out = stMod.setStateBehavior(t, 'Driving', 'entry', '');
    expect(out).not.toContain('entry / x()');
    expect(out).toContain('state Driving');
  });
  test('multi-line do uses backslash-n escape', function() {
    var t = '@startuml\nstate Driving\n@enduml';
    var out = stMod.setStateBehavior(t, 'Driving', 'do', 'a\nb\nc');
    expect(out).toContain('Driving : do / a\\nb\\nc');
  });
  test('do prefix and entry prefix coexist', function() {
    var t = '@startuml\nstate Driving\nDriving : entry / a\n@enduml';
    var out = stMod.setStateBehavior(t, 'Driving', 'do', 'b');
    expect(out).toContain('Driving : entry / a');
    expect(out).toContain('Driving : do / b');
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
