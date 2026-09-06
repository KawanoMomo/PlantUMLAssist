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
  '../src/core/id-normalizer.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/modules/component.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var coMod = global.window.MA.modules.plantumlComponent;

var BASE = ['@startuml', '@enduml'].join('\n');
var EMPTY = { elements: [] };

describe('parseBulkLines', function() {
  test('a bare word is a component', function() {
    expect(coMod.parseBulkLines('CanDrv')).toEqual([
      { op: 'component', id: 'CanDrv', label: '' },
    ]);
  });
  test('interface keyword and () notation both mean interface', function() {
    expect(coMod.parseBulkLines('interface ICan\n()IPdu')).toEqual([
      { op: 'interface', id: 'ICan', label: '' },
      { op: 'interface', id: 'IPdu', label: '' },
    ]);
  });
  test('label after a colon is kept', function() {
    expect(coMod.parseBulkLines('component CanIf : CAN 抽象化')).toEqual([
      { op: 'component', id: 'CanIf', label: 'CAN 抽象化' },
    ]);
  });
  test('brackets around a component alias are stripped', function() {
    expect(coMod.parseBulkLines('[CanDrv]')).toEqual([
      { op: 'component', id: 'CanDrv', label: '' },
    ]);
  });
  test('each arrow maps to its relation kind', function() {
    var ops = coMod.parseBulkLines([
      'A -- B',
      'A -> B',
      'A --> B',
      'A ..> B',
      'A .. B',
      'A -() I',
      'A )- I',
    ].join('\n'));
    expect(ops.map(function(o) { return o.kind; })).toEqual([
      'association', 'association', 'association',
      'dependency', 'dependency', 'provides', 'requires',
    ]);
    expect(ops[0]).toEqual({ op: 'relation', kind: 'association', from: 'A', to: 'B', label: '' });
  });
  test('relation label after a colon is kept', function() {
    expect(coMod.parseBulkLines('CanDrv ..> CanIf : 送信要求')).toEqual([
      { op: 'relation', kind: 'dependency', from: 'CanDrv', to: 'CanIf', label: '送信要求' },
    ]);
  });
  test('brackets and () are stripped from relation ends', function() {
    expect(coMod.parseBulkLines('[CanDrv] -() ()ICan')).toEqual([
      { op: 'relation', kind: 'provides', from: 'CanDrv', to: 'ICan', label: '' },
    ]);
  });
  test('blank lines and comments are ignored', function() {
    expect(coMod.parseBulkLines("A\n\n   \n' note\n# note\nB")).toEqual([
      { op: 'component', id: 'A', label: '' },
      { op: 'component', id: 'B', label: '' },
    ]);
  });
  test('CRLF input splits the same way', function() {
    expect(coMod.parseBulkLines('A\r\nB').length).toBe(2);
  });
  test('empty input yields no ops', function() {
    expect(coMod.parseBulkLines('')).toEqual([]);
    expect(coMod.parseBulkLines(null)).toEqual([]);
  });
});

describe('addBulk', function() {
  test('four components and six relations land in one call', function() {
    var block = [
      'CanDrv',
      'CanIf',
      'PduR',
      'Com',
      'CanDrv -- CanIf',
      'CanIf -- PduR',
      'PduR -- Com',
      'CanDrv ..> CanIf : 送信要求',
      'PduR ..> CanIf',
      'Com ..> PduR',
    ].join('\n');
    var out = coMod.addBulk(BASE, block, EMPTY);
    expect(out.split('\n')).toEqual([
      '@startuml',
      'component CanDrv',
      'component CanIf',
      'component PduR',
      'component Com',
      'CanDrv -- CanIf',
      'CanIf -- PduR',
      'PduR -- Com',
      'CanDrv ..> CanIf : 送信要求',
      'PduR ..> CanIf',
      'Com ..> PduR',
      '@enduml',
    ]);
  });
  test('declarations come before relations even when interleaved', function() {
    var out = coMod.addBulk(BASE, 'A -- B\nA\nB', EMPTY);
    var lines = out.split('\n');
    expect(lines.indexOf('component A')).toBeLessThan(lines.indexOf('A -- B'));
    expect(lines.indexOf('component B')).toBeLessThan(lines.indexOf('A -- B'));
  });
  test('an interface is declared with the interface keyword', function() {
    expect(coMod.addBulk(BASE, 'interface ICan', EMPTY)).toContain('interface ICan');
  });
  test('a Japanese alias gets an ASCII id and relations follow it', function() {
    var out = coMod.addBulk(BASE, '通信ドライバ\n通信ドライバ -- Com', EMPTY);
    expect(out).toContain('component "通信ドライバ" as C1');
    expect(out).toContain('C1 -- Com');
  });
  test('two Japanese aliases get distinct ASCII ids', function() {
    var out = coMod.addBulk(BASE, '送信\n受信', EMPTY);
    expect(out).toContain('as C1');
    expect(out).toContain('as C2');
  });
  test('empty input leaves the text untouched', function() {
    expect(coMod.addBulk(BASE, '   \n\n', EMPTY)).toBe(BASE);
  });
  test('appends after existing content', function() {
    var t = ['@startuml', 'component Existing', '@enduml'].join('\n');
    expect(coMod.addBulk(t, 'New', { elements: [{ id: 'Existing', kind: 'component' }] }))
      .toContain('component Existing\ncomponent New');
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
