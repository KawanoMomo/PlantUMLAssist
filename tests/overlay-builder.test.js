'use strict';
var jsdom = require('jsdom');

// run-tests.js が先に sandbox.window.MA に各 core モジュールを登録している。
// jsdom の window に置き換えると後続テスト (parser-utils 等) が落ちるため、
// 既存 window を保存し、本ファイル末尾で復元する。
// (line-resolver.test.js と同じパターン)
var prevWindow = global.window;
var prevDocument = global.document;

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;

// require.cache を落として overlay-builder.js の IIFE を現在の global.window で再実行させる。
try { delete require.cache[require.resolve('../src/core/overlay-builder.js')]; } catch (e) {}
require('../src/core/overlay-builder.js');

var OB = (typeof window !== 'undefined' && window.MA && window.MA.overlayBuilder)
  || (global.window && global.window.MA && global.window.MA.overlayBuilder);

describe('overlayBuilder.addRect', function() {
  beforeEach(function() {
    document.body.innerHTML = '<svg id="overlay" xmlns="http://www.w3.org/2000/svg"></svg>';
  });
  test('creates a rect with given coords + transparent fill', function() {
    var ov = document.getElementById('overlay');
    var r = OB.addRect(ov, 10, 20, 30, 40, { 'data-type': 'foo', 'data-id': 'X' });
    expect(r).not.toBeNull();
    expect(r.getAttribute('x')).toBe('10');
    expect(r.getAttribute('y')).toBe('20');
    expect(r.getAttribute('width')).toBe('30');
    expect(r.getAttribute('height')).toBe('40');
    expect(r.getAttribute('fill')).toBe('transparent');
    expect(r.getAttribute('data-type')).toBe('foo');
    expect(r.getAttribute('data-id')).toBe('X');
    expect(r.classList.contains('selectable')).toBe(true);
  });
  test('1x1 placeholder gets pointer-events: none', function() {
    var ov = document.getElementById('overlay');
    var r = OB.addRect(ov, 0, 0, 1, 1, { 'data-type': 'p' });
    expect(r.style.pointerEvents).toBe('none');
  });
});

describe('overlayBuilder.syncDimensions', function() {
  beforeEach(function() {
    document.body.innerHTML =
      '<svg id="src" viewBox="0 0 100 200" width="100" height="200"></svg>' +
      '<svg id="dst"></svg>';
  });
  test('copies viewBox/width/height from src to dst', function() {
    var src = document.getElementById('src');
    var dst = document.getElementById('dst');
    OB.syncDimensions(src, dst);
    expect(dst.getAttribute('viewBox')).toBe('0 0 100 200');
    expect(dst.getAttribute('width')).toBe('100');
    expect(dst.getAttribute('height')).toBe('200');
  });
});

// jsdom window を run-tests.js が用意した sandbox window に戻す。
// これをしないと後続 test ファイル (parser-utils, regex-parts 等) が
// window.MA.* を見失って失敗する。
if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
