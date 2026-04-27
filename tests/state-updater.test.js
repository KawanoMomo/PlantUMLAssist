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

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
