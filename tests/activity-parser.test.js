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

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
