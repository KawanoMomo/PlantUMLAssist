'use strict';
var jsdom = require('jsdom');

// run-tests.js が先に sandbox.window.MA に各 core モジュールを登録している。
// jsdom の window に置き換えると後続テスト (parser-utils 等) が落ちるため、
// 既存 window を保存し、本ファイル末尾で復元する。
// (overlay-builder.test.js / selection-router.test.js と同じパターン)
var prevWindow = global.window;
var prevDocument = global.document;

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;

// require.cache を落として各モジュールの IIFE を現在の global.window で
// 再実行させる。usecase.js は dslUtils / regexParts / dslUpdater /
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
  '../src/modules/usecase.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});

var ucMod = (typeof window !== 'undefined' && window.MA && window.MA.modules
  && window.MA.modules.plantumlUsecase)
  || (global.window && global.window.MA && global.window.MA.modules
  && global.window.MA.modules.plantumlUsecase);

describe('usecase.buildOverlay — actor/usecase', function() {
  beforeEach(function() {
    document.body.innerHTML =
      '<svg id="src" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
        '<g class="actor" data-source-line="3"><text x="10" y="20" textLength="30">User</text></g>' +
        '<g class="usecase" data-source-line="4"><text x="60" y="20" textLength="50">Login</text></g>' +
      '</svg>' +
      '<svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
  });

  test('creates rect for each actor with data-type="actor"', function() {
    var src = document.getElementById('src');
    var ov = document.getElementById('ov');
    var parsed = {
      meta: { startUmlLine: 1 },
      elements: [
        { kind: 'actor', id: 'User', line: 3 },
        { kind: 'usecase', id: 'Login', line: 4 },
      ],
      relations: [],
      groups: [],
    };
    ucMod.buildOverlay(src, parsed, ov);
    var actors = ov.querySelectorAll('rect[data-type="actor"]');
    expect(actors.length).toBe(1);
    expect(actors[0].getAttribute('data-id')).toBe('User');
    expect(actors[0].getAttribute('data-line')).toBe('3');
  });

  test('creates rect for each usecase with data-type="usecase"', function() {
    var src = document.getElementById('src');
    var ov = document.getElementById('ov');
    var parsed = {
      meta: { startUmlLine: 1 },
      elements: [
        { kind: 'usecase', id: 'Login', line: 4 },
      ],
      relations: [],
      groups: [],
    };
    ucMod.buildOverlay(src, parsed, ov);
    var ucs = ov.querySelectorAll('rect[data-type="usecase"]');
    expect(ucs.length).toBe(1);
    expect(ucs[0].getAttribute('data-id')).toBe('Login');
  });

  test('returns matched/unmatched report', function() {
    var src = document.getElementById('src');
    var ov = document.getElementById('ov');
    var parsed = {
      meta: { startUmlLine: 1 },
      elements: [
        { kind: 'actor', id: 'User', line: 3 },
        { kind: 'actor', id: 'Missing', line: 99 },
      ],
      relations: [],
      groups: [],
    };
    var report = ucMod.buildOverlay(src, parsed, ov);
    expect(report.matched.actor).toBe(1);
    expect(report.unmatched.actor).toBe(1);
  });
});

describe('usecase.buildOverlay — package + relation', function() {
  beforeEach(function() {
    document.body.innerHTML =
      '<svg id="src" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">' +
        '<g class="cluster"><rect x="0" y="0" width="200" height="100"/><text x="10" y="15">Pkg</text></g>' +
        '<g class="link"><line x1="10" y1="50" x2="100" y2="50"/></g>' +
      '</svg>' +
      '<svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
  });

  test('creates package rect with data-type="package"', function() {
    var src = document.getElementById('src');
    var ov = document.getElementById('ov');
    var parsed = {
      meta: { startUmlLine: 1 },
      elements: [],
      relations: [],
      groups: [{ kind: 'package', id: '__pkg_0', label: 'Pkg', startLine: 2, endLine: 5 }],
    };
    ucMod.buildOverlay(src, parsed, ov);
    var pkgs = ov.querySelectorAll('rect[data-type="package"]');
    expect(pkgs.length).toBe(1);
    expect(pkgs[0].getAttribute('data-id')).toBe('__pkg_0');
  });

  test('creates relation rect with data-relation-kind', function() {
    var src = document.getElementById('src');
    var ov = document.getElementById('ov');
    var parsed = {
      meta: { startUmlLine: 1 },
      elements: [],
      relations: [{ id: 'rel_0', kind: 'association', from: 'A', to: 'B', line: 3 }],
      groups: [],
    };
    ucMod.buildOverlay(src, parsed, ov);
    var rels = ov.querySelectorAll('rect[data-type="relation"]');
    expect(rels.length).toBe(1);
    expect(rels[0].getAttribute('data-relation-kind')).toBe('association');
  });

  test('relation rect uses extractEdgeBBox padding', function() {
    var src = document.getElementById('src');
    var ov = document.getElementById('ov');
    var parsed = {
      meta: { startUmlLine: 1 },
      elements: [],
      relations: [{ id: 'rel_0', kind: 'association', from: 'A', to: 'B', line: 3 }],
      groups: [],
    };
    ucMod.buildOverlay(src, parsed, ov);
    var rect = ov.querySelector('rect[data-type="relation"]');
    var width = parseFloat(rect.getAttribute('width'));
    expect(width).toBeGreaterThan(90);  // line長 90 + 2*8 padding
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
