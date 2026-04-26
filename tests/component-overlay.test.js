'use strict';
var jsdom = require('jsdom');

// run-tests.js が先に sandbox.window.MA に各 core モジュールを登録している。
// jsdom の window に置き換えると後続テスト (parser-utils 等) が落ちるため、
// 既存 window を保存し、本ファイル末尾で復元する。
// (usecase-overlay.test.js と同じパターン)
var prevWindow = global.window;
var prevDocument = global.document;

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;

// require.cache を落として各モジュールの IIFE を現在の global.window で
// 再実行させる。component.js は dslUtils / regexParts / dslUpdater /
// textUpdater / overlayBuilder などに依存しているので順序を守ってロード。
var depPaths = [
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/modules/component.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});

var coMod = (typeof window !== 'undefined' && window.MA && window.MA.modules
  && window.MA.modules.plantumlComponent)
  || (global.window && global.window.MA && global.window.MA.modules
  && global.window.MA.modules.plantumlComponent);

describe('component.buildOverlay — component/interface', function() {
  beforeEach(function() {
    document.body.innerHTML =
      '<svg id="src" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
        '<g class="entity" data-qualified-name="WebApp" data-source-line="3"><rect x="10" y="10" width="60" height="40"/><text x="20" y="30" textLength="40">WebApp</text></g>' +
        '<g class="entity" data-qualified-name="IAuth" data-source-line="4"><ellipse cx="100" cy="30" rx="8" ry="8"/><text x="80" y="50" textLength="40">IAuth</text></g>' +
      '</svg>' +
      '<svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
  });

  test('creates component rect', function() {
    var src = document.getElementById('src');
    var ov = document.getElementById('ov');
    coMod.buildOverlay(src, {
      meta: { startUmlLine: 1 },
      elements: [{ kind: 'component', id: 'WebApp', line: 3 }],
      relations: [], groups: [],
    }, ov);
    var c = ov.querySelectorAll('rect[data-type="component"]');
    expect(c.length).toBe(1);
    expect(c[0].getAttribute('data-id')).toBe('WebApp');
  });

  test('creates interface rect', function() {
    var src = document.getElementById('src');
    var ov = document.getElementById('ov');
    coMod.buildOverlay(src, {
      meta: { startUmlLine: 1 },
      elements: [{ kind: 'interface', id: 'IAuth', line: 4 }],
      relations: [], groups: [],
    }, ov);
    var i = ov.querySelectorAll('rect[data-type="interface"]');
    expect(i.length).toBe(1);
    expect(i[0].getAttribute('data-id')).toBe('IAuth');
  });
});

describe('component.buildOverlay — port + package', function() {
  test('port rect is added AFTER component rect (z-order: child first)', function() {
    document.body.innerHTML =
      '<svg id="src" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="entity" data-qualified-name="W" data-source-line="3"><rect x="0" y="0" width="60" height="40"/><text x="10" y="20" textLength="40">W</text></g>' +
        '<g class="entity" data-qualified-name="p1" data-source-line="4"><rect x="20" y="20" width="10" height="10"/></g>' +
      '</svg>' +
      '<svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
    var src = document.getElementById('src');
    var ov = document.getElementById('ov');
    coMod.buildOverlay(src, {
      meta: { startUmlLine: 1 },
      elements: [
        { kind: 'component', id: 'W', line: 3 },
        { kind: 'port', id: 'p1', parentComponentId: 'W', line: 4 },
      ],
      relations: [], groups: [],
    }, ov);
    var rects = ov.querySelectorAll('rect.selectable');
    expect(rects[0].getAttribute('data-type')).toBe('component');
    expect(rects[1].getAttribute('data-type')).toBe('port');
  });

  test('creates package rect via g.cluster', function() {
    document.body.innerHTML =
      '<svg id="src" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="cluster"><rect x="0" y="0" width="200" height="100"/><text x="10" y="15">Pkg</text></g>' +
      '</svg>' +
      '<svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
    var src = document.getElementById('src');
    var ov = document.getElementById('ov');
    coMod.buildOverlay(src, {
      meta: { startUmlLine: 1 },
      elements: [], relations: [],
      groups: [{ kind: 'package', id: '__pkg_0', label: 'Pkg', startLine: 2, endLine: 5 }],
    }, ov);
    var pkgs = ov.querySelectorAll('rect[data-type="package"]');
    expect(pkgs.length).toBe(1);
  });

  test('relation rect with data-relation-kind for 4 kinds', function() {
    document.body.innerHTML =
      '<svg id="src" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="link"><line x1="0" y1="0" x2="50" y2="0"/></g>' +
        '<g class="link"><line x1="0" y1="20" x2="50" y2="20"/></g>' +
      '</svg>' +
      '<svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
    var src = document.getElementById('src');
    var ov = document.getElementById('ov');
    coMod.buildOverlay(src, {
      meta: { startUmlLine: 1 },
      elements: [],
      relations: [
        { id: '__r_0', kind: 'association', from: 'A', to: 'B', line: 5 },
        { id: '__r_1', kind: 'provides', from: 'A', to: 'I', line: 6 },
      ],
      groups: [],
    }, ov);
    var rels = ov.querySelectorAll('rect[data-type="relation"]');
    expect(rels.length).toBe(2);
    expect(rels[0].getAttribute('data-relation-kind')).toBe('association');
    expect(rels[1].getAttribute('data-relation-kind')).toBe('provides');
  });
});

// jsdom window を run-tests.js が用意した sandbox window に戻す。
// これをしないと後続 test ファイル (parser-utils, regex-parts 等) が
// window.MA.* を見失って失敗する。
if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;

// require.cache を落とすことで、後続テストが各モジュールを
// 自分の sandbox window 上で再実行できるようにする。
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
});
