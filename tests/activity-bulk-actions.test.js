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

var BASE = ['@startuml', 'start', '@enduml'].join('\n');

describe('splitActionLines', function() {
  test('splits one action per line', function() {
    expect(actMod.splitActionLines('a\nb\nc')).toEqual(['a', 'b', 'c']);
  });
  test('accepts CRLF', function() {
    expect(actMod.splitActionLines('a\r\nb')).toEqual(['a', 'b']);
  });
  test('drops blank lines and trims', function() {
    expect(actMod.splitActionLines('  a  \n\n   \nb\n')).toEqual(['a', 'b']);
  });
  test('strips leading colon and trailing semicolon', function() {
    expect(actMod.splitActionLines(':a;\n:b;')).toEqual(['a', 'b']);
  });
  test('drops a line that is only a colon and semicolon', function() {
    expect(actMod.splitActionLines(':;\na')).toEqual(['a']);
  });
  test('empty input yields empty list', function() {
    expect(actMod.splitActionLines('')).toEqual([]);
    expect(actMod.splitActionLines(null)).toEqual([]);
  });
});

describe('addActions', function() {
  test('appends four actions in order with one call', function() {
    var out = actMod.addActions(BASE, 'クロック設定\nピン設定\nボーレート設定\n割り込み許可');
    expect(out.split('\n')).toEqual([
      '@startuml',
      'start',
      ':クロック設定;',
      ':ピン設定;',
      ':ボーレート設定;',
      ':割り込み許可;',
      '@enduml',
    ]);
  });
  test('single line behaves like addAction', function() {
    expect(actMod.addActions(BASE, 'only')).toBe(actMod.addAction(BASE, 'only'));
  });
  test('empty input leaves the text untouched', function() {
    expect(actMod.addActions(BASE, '   \n\n')).toBe(BASE);
  });
  test('appends after existing actions', function() {
    var t = ['@startuml', 'start', ':first;', '@enduml'].join('\n');
    var out = actMod.addActions(t, 'second\nthird');
    expect(out).toContain(':first;\n:second;\n:third;');
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
