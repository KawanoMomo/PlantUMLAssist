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
