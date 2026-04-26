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
  '../src/modules/class.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});

var clMod = global.window.MA.modules.plantumlClass;

describe('class.parse — bare class', function() {
  test('parses minimal class declaration', function() {
    var t = '@startuml\nclass Foo\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements.length).toBe(1);
    expect(r.elements[0].kind).toBe('class');
    expect(r.elements[0].id).toBe('Foo');
    expect(r.elements[0].label).toBe('Foo');
    expect(r.elements[0].line).toBe(2);
    expect(r.elements[0].members.length).toBe(0);
  });

  test('parses class with quoted label', function() {
    var t = '@startuml\nclass "User Profile" as UP\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].id).toBe('UP');
    expect(r.elements[0].label).toBe('User Profile');
  });
});

describe('class.parse — block form', function() {
  test('parses class with empty body { }', function() {
    var t = '@startuml\nclass Foo {\n}\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements.length).toBe(1);
    expect(r.elements[0].id).toBe('Foo');
    expect(r.elements[0].endLine).toBe(3);
  });
  test('endLine matches closing brace for nested empty class', function() {
    var t = '@startuml\nclass Foo {\n}\nclass Bar\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].endLine).toBe(3);
    expect(r.elements[1].endLine).toBe(4);
  });
});

// jsdom epilogue
if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
