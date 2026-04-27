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

describe('state parser: simple state', function() {
  test('parses simple state', function() {
    var t = '@startuml\nstate A\n@enduml';
    var r = stMod.parse(t);
    expect(r.states.length).toBe(1);
    expect(r.states[0].kind).toBe('state');
    expect(r.states[0].id).toBe('A');
    expect(r.states[0].line).toBe(2);
    expect(r.states[0].parentId).toBe(null);
  });
  test('parses multiple states', function() {
    var t = '@startuml\nstate A\nstate B\nstate C\n@enduml';
    var r = stMod.parse(t);
    expect(r.states.length).toBe(3);
    expect(r.states[1].id).toBe('B');
  });
  test('returns empty for empty diagram', function() {
    var r = stMod.parse('@startuml\n@enduml');
    expect(r.states.length).toBe(0);
    expect(r.transitions.length).toBe(0);
  });
});

describe('state parser: transitions', function() {
  test('parses simple transition without label', function() {
    var t = '@startuml\nstate A\nstate B\nA --> B\n@enduml';
    var r = stMod.parse(t);
    expect(r.transitions.length).toBe(1);
    expect(r.transitions[0].from).toBe('A');
    expect(r.transitions[0].to).toBe('B');
    expect(r.transitions[0].label).toBe(null);
  });
  test('parses transition with full label (trigger [guard] / action)', function() {
    var t = '@startuml\nstate A\nstate B\nA --> B : click [enabled] / save()\n@enduml';
    var r = stMod.parse(t);
    var tr = r.transitions[0];
    expect(tr.label).toBe('click [enabled] / save()');
    expect(tr.trigger).toBe('click');
    expect(tr.guard).toBe('enabled');
    expect(tr.action).toBe('save()');
  });
  test('parses transition with only trigger', function() {
    var t = '@startuml\nA --> B : click\n@enduml';
    var r = stMod.parse(t);
    expect(r.transitions[0].trigger).toBe('click');
    expect(r.transitions[0].guard).toBe(null);
    expect(r.transitions[0].action).toBe(null);
  });
  test('parses transition with [*] as initial pseudo-state', function() {
    var t = '@startuml\n[*] --> A\n@enduml';
    var r = stMod.parse(t);
    expect(r.transitions[0].from).toBe('[*]');
    expect(r.transitions[0].to).toBe('A');
  });
  test('parses transition with [*] as final pseudo-state', function() {
    var t = '@startuml\nA --> [*]\n@enduml';
    var r = stMod.parse(t);
    expect(r.transitions[0].to).toBe('[*]');
  });
});

describe('state parser: composite', function() {
  test('parses composite state with inner state', function() {
    var t = '@startuml\nstate Outer {\n  state Inner\n}\n@enduml';
    var r = stMod.parse(t);
    expect(r.states.length).toBe(2);
    expect(r.states[0].id).toBe('Outer');
    expect(r.states[0].endLine).toBe(4);
    expect(r.states[1].id).toBe('Outer.Inner');
    expect(r.states[1].parentId).toBe('Outer');
  });
  test('inner state line tracking', function() {
    var t = '@startuml\nstate Outer {\n  state Inner\n}\n@enduml';
    var r = stMod.parse(t);
    expect(r.states[1].line).toBe(3);
  });
  test('multiple inner states', function() {
    var t = '@startuml\nstate Outer {\n  state A\n  state B\n}\n@enduml';
    var r = stMod.parse(t);
    expect(r.states.length).toBe(3);
    expect(r.states[1].id).toBe('Outer.A');
    expect(r.states[2].id).toBe('Outer.B');
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
