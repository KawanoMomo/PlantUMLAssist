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

describe('overlayBuilder.extractBBox', function() {
  beforeEach(function() {
    document.body.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" id="root">' +
      '<g id="g1"><text x="10" y="20" textLength="50">Hi</text></g>' +
      '<g id="g2"><line x1="0" y1="0" x2="100" y2="50"/></g>' +
      '<g id="g3"></g>' +
      '</svg>';
  });
  test('returns text bbox via x/y/textLength fallback (jsdom)', function() {
    var g = document.getElementById('g1');
    var bb = OB.extractBBox(g);
    expect(bb.x).toBe(10);
    expect(bb.y).toBe(20);
    expect(bb.width).toBe(50);
    expect(bb.height).toBe(14);
  });
  test('falls back to line bbox when text is missing', function() {
    var g = document.getElementById('g2');
    var bb = OB.extractBBox(g);
    expect(bb.x).toBe(0);
    expect(bb.y).toBe(-6);
    expect(bb.width).toBe(100);
  });
  test('returns null for empty group', function() {
    var g = document.getElementById('g3');
    expect(OB.extractBBox(g)).toBeNull();
  });
});

describe('overlayBuilder.extractEdgeBBox', function() {
  beforeEach(function() {
    document.body.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" id="root">' +
      '<line id="ln" x1="10" y1="20" x2="50" y2="60"/>' +
      '</svg>';
  });
  test('returns padded bbox around line endpoints', function() {
    var ln = document.getElementById('ln');
    var bb = OB.extractEdgeBBox(ln, 8);
    expect(bb.x).toBe(2);
    expect(bb.y).toBe(12);
    expect(bb.width).toBe(56);
    expect(bb.height).toBe(56);
  });
});

describe('overlayBuilder.matchByDataSourceLine', function() {
  beforeEach(function() {
    document.body.innerHTML = '<svg id="root" xmlns="http://www.w3.org/2000/svg">' +
      '<g class="X" data-source-line="2"></g>' +
      '<g class="X" data-source-line="3"></g>' +
      '<g class="X" data-source-line="5"></g>' +
      '</svg>';
  });
  test('matches items whose lineNum = svgLine + offset (offset=1)', function() {
    var svg = document.getElementById('root');
    var items = [{ id: 'a', line: 3 }, { id: 'b', line: 4 }, { id: 'c', line: 6 }];
    var matches = OB.matchByDataSourceLine(svg, items, 'g.X', 1);
    expect(matches.length).toBe(3);
    expect(matches[0].item.id).toBe('a');
    expect(matches[1].item.id).toBe('b');
    expect(matches[2].item.id).toBe('c');
  });
  test('returns empty when offset mismatches all', function() {
    var svg = document.getElementById('root');
    var items = [{ id: 'a', line: 100 }];
    expect(OB.matchByDataSourceLine(svg, items, 'g.X', 0).length).toBe(0);
  });
});

describe('overlayBuilder.matchByOrder', function() {
  beforeEach(function() {
    document.body.innerHTML = '<svg id="root" xmlns="http://www.w3.org/2000/svg">' +
      '<g class="Y"></g><g class="Y"></g><g class="Y"></g>' +
      '</svg>';
  });
  test('pairs N parsed items with first N matching SVG groups', function() {
    var svg = document.getElementById('root');
    var items = [{ id: 'a' }, { id: 'b' }];
    var matches = OB.matchByOrder(svg, items, 'g.Y');
    expect(matches.length).toBe(2);
    expect(matches[0].item.id).toBe('a');
    expect(matches[1].item.id).toBe('b');
  });
});

describe('overlayBuilder.pickBestOffset', function() {
  beforeEach(function() {
    document.body.innerHTML = '<svg id="root" xmlns="http://www.w3.org/2000/svg">' +
      '<g class="Z" data-source-line="3"></g>' +
      '<g class="Z" data-source-line="5"></g>' +
      '</svg>';
  });
  test('picks offset that yields max matches', function() {
    var svg = document.getElementById('root');
    var items = [{ id: 'a', line: 3 }, { id: 'b', line: 5 }];
    var result = OB.pickBestOffset(svg, items, 'g.Z', [0, 1, 2]);
    expect(result.offset).toBe(0);
    expect(result.matches.length).toBe(2);
  });
});

describe('overlayBuilder.hitTestTopmost', function() {
  beforeEach(function() {
    document.body.innerHTML = '<svg id="ov" xmlns="http://www.w3.org/2000/svg">' +
      '<rect class="selectable" x="0" y="0" width="100" height="100" data-id="parent"/>' +
      '<rect class="selectable" x="40" y="40" width="20" height="20" data-id="child"/>' +
      '</svg>';
  });
  test('returns the topmost (last appended) selectable rect at point', function() {
    var ov = document.getElementById('ov');
    var hit = OB.hitTestTopmost(ov, 50, 50);
    expect(hit).not.toBeNull();
    expect(hit.getAttribute('data-id')).toBe('child');
  });
  test('returns parent when point only intersects parent', function() {
    var ov = document.getElementById('ov');
    var hit = OB.hitTestTopmost(ov, 10, 10);
    expect(hit.getAttribute('data-id')).toBe('parent');
  });
  test('returns null when point is outside all rects', function() {
    var ov = document.getElementById('ov');
    expect(OB.hitTestTopmost(ov, 200, 200)).toBeNull();
  });
});

describe('overlayBuilder.extractMultiLineTextBBoxes', function() {
  beforeEach(function() {
    document.body.innerHTML = '<svg id="root" xmlns="http://www.w3.org/2000/svg"></svg>';
  });
  test('returns one entry per <text> in text-per-line mode', function() {
    var svg = document.getElementById('root');
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    for (var i = 0; i < 3; i++) {
      var t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', String(10 + i));
      t.setAttribute('y', String(20 + i * 10));
      t.textContent = 'line' + i;
      g.appendChild(t);
    }
    svg.appendChild(g);
    var lines = OB.extractMultiLineTextBBoxes(g);
    expect(lines.length).toBe(3);
    expect(lines[0].text).toBe('line0');
    expect(lines[2].lineIndex).toBe(2);
  });
  test('returns empty array for empty group', function() {
    var svg = document.getElementById('root');
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(g);
    var lines = OB.extractMultiLineTextBBoxes(g);
    expect(lines.length).toBe(0);
  });
  test('uses tspan-per-line mode', function() {
    var svg = document.getElementById('root');
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    var t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    for (var i = 0; i < 2; i++) {
      var ts = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      ts.textContent = 'span' + i;
      t.appendChild(ts);
    }
    g.appendChild(t);
    svg.appendChild(g);
    var lines = OB.extractMultiLineTextBBoxes(g, { mode: 'tspan-per-line' });
    expect(lines.length).toBe(2);
    expect(lines[0].text).toBe('span0');
    expect(lines[1].text).toBe('span1');
  });
});

describe('overlayBuilder.dedupById', function() {
  test('keeps first occurrence per data-id', function() {
    document.body.innerHTML = '<svg id="ov" xmlns="http://www.w3.org/2000/svg">' +
      '<rect data-id="A"/><rect data-id="A"/><rect data-id="B"/>' +
      '</svg>';
    var ov = document.getElementById('ov');
    var rects = Array.prototype.slice.call(ov.querySelectorAll('rect'));
    var unique = OB.dedupById(rects);
    expect(unique.length).toBe(2);
    expect(unique[0].getAttribute('data-id')).toBe('A');
    expect(unique[1].getAttribute('data-id')).toBe('B');
  });
});

// jsdom window を run-tests.js が用意した sandbox window に戻す。
// これをしないと後続 test ファイル (parser-utils, regex-parts 等) が
// window.MA.* を見失って失敗する。
if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
