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
  '../src/modules/usecase.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var ucMod = global.window.MA.modules.plantumlUsecase;

var BASE = ['@startuml', '@enduml'].join('\n');
var EMPTY = { elements: [] };

describe('usecase parseBulkLines', function() {
  test('a bare word is a usecase, actor needs a marker', function() {
    expect(ucMod.parseBulkLines('CanInit\nactor Dev\n:Tester:')).toEqual([
      { op: 'usecase', id: 'CanInit', label: '' },
      { op: 'actor', id: 'Dev', label: '' },
      { op: 'actor', id: 'Tester', label: '' },
    ]);
  });
  test('() notation and : label', function() {
    expect(ucMod.parseBulkLines('(Diag) : 診断実行')).toEqual([
      { op: 'usecase', id: 'Diag', label: '診断実行' },
    ]);
  });
  test('arrows map to relation kinds', function() {
    expect(ucMod.parseBulkLines([
      'Dev --> CanInit : 実行',
      'CanInit ..> Log',
      'CanInit ..> Retry : extend',
      'Dev <|-- Admin',
    ].join('\n'))).toEqual([
      { op: 'relation', kind: 'association', from: 'Dev', to: 'CanInit', label: '実行' },
      { op: 'relation', kind: 'include', from: 'CanInit', to: 'Log', label: '' },
      { op: 'relation', kind: 'extend', from: 'CanInit', to: 'Retry', label: '' },
      { op: 'relation', kind: 'generalization', from: 'Dev', to: 'Admin', label: '' },
    ]);
  });
  test('--|> is generalization with the ends swapped', function() {
    expect(ucMod.parseBulkLines('Admin --|> Dev')).toEqual([
      { op: 'relation', kind: 'generalization', from: 'Dev', to: 'Admin', label: '' },
    ]);
  });
  test('blank lines and comments are ignored', function() {
    expect(ucMod.parseBulkLines("\n  \n' note\n# note")).toEqual([]);
  });
});

describe('usecase addBulk', function() {
  test('declarations come first, relations after, regardless of input order', function() {
    var block = [
      'Dev --> CanInit',
      'actor Dev',
      'CanInit',
    ].join('\n');
    var out = ucMod.addBulk(BASE, block, EMPTY);
    var lines = out.split('\n');
    expect(lines).toEqual([
      '@startuml',
      'actor Dev',
      'usecase CanInit',
      'Dev --> CanInit',
      '@enduml',
    ]);
  });
  test('include/extend emit the stereotype form', function() {
    var out = ucMod.addBulk(BASE, 'A\nB\nA ..> B\nA ..> B : extend', EMPTY);
    expect(out).toContain('A ..> B : <<include>>');
    expect(out).toContain('A ..> B : <<extend>>');
  });
  test('japanese names become ASCII aliases and relations follow', function() {
    var out = ucMod.addBulk(BASE, '通信初期化\nactor 開発者\n開発者 --> 通信初期化', EMPTY);
    var decl = out.split('\n').filter(function(l) { return /^(actor|usecase)/.test(l); });
    expect(decl.length).toBe(2);
    var ucId = decl[0].match(/as (\w+)$/)[1];
    var acId = decl[1].match(/as (\w+)$/)[1];
    expect(out).toContain(acId + ' --> ' + ucId);
    expect(out).toContain('"通信初期化"');
  });
  test('nothing addable leaves the text untouched', function() {
    expect(ucMod.addBulk(BASE, '   \n\n', EMPTY)).toBe(BASE);
  });
  test('appends after existing content', function() {
    var t = ['@startuml', 'usecase Existing', '@enduml'].join('\n');
    expect(ucMod.addBulk(t, 'New', { elements: [{ id: 'Existing', kind: 'usecase' }] }))
      .toContain('usecase Existing\nusecase New');
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
