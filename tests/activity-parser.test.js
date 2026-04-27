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
  '../src/modules/activity.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var actMod = global.window.MA.modules.plantumlActivity;

describe('activity parser: start/stop/end', function() {
  test('parses start keyword', function() {
    var t = '@startuml\nstart\n@enduml';
    var r = actMod.parse(t);
    expect(r.nodes.length).toBe(1);
    expect(r.nodes[0].kind).toBe('start');
    expect(r.nodes[0].line).toBe(2);
  });
  test('parses stop keyword', function() {
    var t = '@startuml\nstart\nstop\n@enduml';
    var r = actMod.parse(t);
    expect(r.nodes.length).toBe(2);
    expect(r.nodes[1].kind).toBe('stop');
  });
  test('parses end keyword', function() {
    var t = '@startuml\nstart\nend\n@enduml';
    var r = actMod.parse(t);
    expect(r.nodes[1].kind).toBe('end');
  });
  test('returns empty nodes for empty diagram', function() {
    var r = actMod.parse('@startuml\n@enduml');
    expect(r.nodes.length).toBe(0);
  });
  test('assigns sequential ids', function() {
    var r = actMod.parse('@startuml\nstart\nstop\n@enduml');
    expect(r.nodes[0].id).toBe('__a_0');
    expect(r.nodes[1].id).toBe('__a_1');
  });
});

describe('activity parser: action', function() {
  test('parses single-line action', function() {
    var t = '@startuml\n:Hello;\n@enduml';
    var r = actMod.parse(t);
    expect(r.nodes[0].kind).toBe('action');
    expect(r.nodes[0].text).toBe('Hello');
  });
  test('parses multi-line action with embedded newline before semicolon', function() {
    var t = '@startuml\n:line one\nline two;\n@enduml';
    var r = actMod.parse(t);
    expect(r.nodes.length).toBe(1);
    expect(r.nodes[0].kind).toBe('action');
    expect(r.nodes[0].text).toBe('line one\nline two');
    expect(r.nodes[0].line).toBe(2);
    expect(r.nodes[0].endLine).toBe(3);
  });
  test('parses multiple actions in sequence', function() {
    var t = '@startuml\nstart\n:A;\n:B;\nstop\n@enduml';
    var r = actMod.parse(t);
    expect(r.nodes.length).toBe(4);
    expect(r.nodes[1].text).toBe('A');
    expect(r.nodes[2].text).toBe('B');
  });
});

describe('activity parser: if/elseif/else/endif', function() {
  test('parses simple if/else', function() {
    var t = '@startuml\nstart\nif (a?) then (yes)\n:A;\nelse (no)\n:B;\nendif\nstop\n@enduml';
    var r = actMod.parse(t);
    var ifNode = r.nodes.find(function(n) { return n.kind === 'if'; });
    expect(ifNode).toBeDefined();
    expect(ifNode.condition).toBe('a?');
    expect(ifNode.branches.length).toBe(2);
    expect(ifNode.branches[0].kind).toBe('then');
    expect(ifNode.branches[0].label).toBe('yes');
    expect(ifNode.branches[0].body.length).toBe(1);
    expect(ifNode.branches[0].body[0].text).toBe('A');
    expect(ifNode.branches[1].kind).toBe('else');
    expect(ifNode.branches[1].label).toBe('no');
  });
  test('parses if without else', function() {
    var t = '@startuml\nif (a?) then\n:A;\nendif\n@enduml';
    var r = actMod.parse(t);
    var ifNode = r.nodes[0];
    expect(ifNode.kind).toBe('if');
    expect(ifNode.branches.length).toBe(1);
    expect(ifNode.branches[0].kind).toBe('then');
    expect(ifNode.branches[0].label).toBe('yes');  // default label
  });
  test('parses if with elseif', function() {
    var t = '@startuml\nif (a?) then (y)\n:A;\nelseif (b?) then (y)\n:B;\nelse (n)\n:C;\nendif\n@enduml';
    var r = actMod.parse(t);
    var ifNode = r.nodes[0];
    expect(ifNode.branches.length).toBe(3);
    expect(ifNode.branches[1].kind).toBe('elseif');
    expect(ifNode.branches[1].condition).toBe('b?');
    expect(ifNode.branches[1].label).toBe('y');
  });
  test('parses nested if (depth 2)', function() {
    var t = '@startuml\nif (a?) then (y)\n  if (b?) then (y)\n    :B;\n  endif\nendif\n@enduml';
    var r = actMod.parse(t);
    var outer = r.nodes[0];
    expect(outer.kind).toBe('if');
    expect(outer.branches[0].body[0].kind).toBe('if');
    expect(outer.branches[0].body[0].branches[0].body[0].text).toBe('B');
  });
  test('endif endLine is set on outer if', function() {
    var t = '@startuml\nif (a?) then\n:A;\nendif\n@enduml';
    var r = actMod.parse(t);
    expect(r.nodes[0].line).toBe(2);
    expect(r.nodes[0].endLine).toBe(4);
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
