'use strict';
// BLK-builder-20260925-0656-2: SVG の <path d> の外接矩形を、コマンドを読んで求める。
// smetana は複合状態の見出しを円弧 (`A rx,ry rot large sweep x,y`) 付きの path で描く。数字を 2 つずつ
// 座標として読むと円弧の半径やフラグ (0 0 1) が座標に混ざり、枠が図の左上 (x=0) まで広がっていた。
// fixtures/svg/state-smetana-*.svg / state-pin-*.svg は同名の fixtures/dsl/*.puml を同梱の plantuml.jar で描いたもの。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

var _prevWindow = global.window;
var _prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;

var MODS = [
  '../src/core/html-utils.js',
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js',
  '../src/core/dsl-updater.js',
  '../src/core/text-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/line-resolver.js',
  '../src/core/overlay-builder.js',
  '../src/core/state-svg-map.js',
  '../src/core/state-transition.js',
  '../src/modules/state.js'
];
MODS.forEach(function(m) { delete require.cache[require.resolve(m)]; });
MODS.forEach(function(m) { require(m); });

var OB = window.MA.overlayBuilder;
var SM = window.MA.stateSvgMap;
var ST = window.MA.modules.plantumlState;

function near(box, x, y, w, h) {
  expect(Math.abs(box.x - x)).toBeLessThan(0.05);
  expect(Math.abs(box.y - y)).toBeLessThan(0.05);
  expect(Math.abs(box.width - w)).toBeLessThan(0.05);
  expect(Math.abs(box.height - h)).toBeLessThan(0.05);
}

describe('pathBox: path の外接矩形をコマンドで読む', function() {
  test('smetana の複合状態の見出し (角丸の円弧) は円弧の半径・フラグを座標に混ぜない', function() {
    var d = 'M26.5,4 L101.5,4 A12.5,12.5 0 0 1 114,16.5 L114,26.6094 L14,26.6094 L14,16.5 A12.5,12.5 0 0 1 26.5,4';
    near(OB.pathBox(d), 14, 4, 100, 22.6094);
  });
  test('半円より大きい円弧は端点の外へ膨らむぶんも含める', function() {
    // (0,0) から (20,0) への半径 10 の上側の半円: y は -10 まで
    var b = OB.pathBox('M0,0 A10,10 0 0 1 20,0');
    near(b, 0, -10, 20, 10);
  });
  test('H / V と小文字 (相対) のコマンド、Z で始点に戻る', function() {
    near(OB.pathBox('M10,20 H50 V60 H10 Z'), 10, 20, 40, 40);
    near(OB.pathBox('m10,20 h40 v40 h-40 z'), 10, 20, 40, 40);
    near(OB.pathBox('M5 5 l10 0 l0 10'), 5, 5, 10, 10);
  });
  test('曲線は制御点まで含める (当たり判定は安全側)。数字の連続 (暗黙の繰り返し) も読む', function() {
    near(OB.pathBox('M0,0 C0,10 20,10 20,0'), 0, 0, 20, 10);
    near(OB.pathBox('M0,0 L10,0 20,5 30,-5'), 0, -5, 30, 10);
    near(OB.pathBox('M1e1,0 L2.5e1,4'), 10, 0, 15, 4);
  });
  test('読めない d は null', function() {
    expect(OB.pathBox('')).toBe(null);
    expect(OB.pathBox(null)).toBe(null);
  });
  test('nodeBBox の path と stateSvgMap.shapeBox も同じ読み方をする', function() {
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M26.5,98 L101.5,98 A12.5,12.5 0 0 1 114,110.5 L114,120.6094 L14,120.6094 L14,110.5 A12.5,12.5 0 0 1 26.5,98');
    near(OB.nodeBBox(p), 14, 98, 100, 22.6094);
    near(SM.shapeBox(p), 14, 98, 100, 22.6094);
  });
});

function load(name) {
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/state-' + name + '.svg'), 'utf8');
  var dsl = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/state-' + name + '.puml'), 'utf8').replace(/\r\n/g, '\n');
  var div = document.createElement('div');
  div.innerHTML = svgText;
  var svgEl = div.querySelector('svg');
  var parsed = ST.parse(dsl);
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ST.buildOverlay(svgEl, parsed, overlayEl);
  return { svgEl: svgEl, parsed: parsed, overlayEl: overlayEl };
}
function frameOf(f, id) {
  return Array.prototype.filter.call(f.overlayEl.querySelectorAll('rect.selectable'), function(r) {
    return r.getAttribute('data-type') === 'state' && r.getAttribute('data-id') === id;
  })[0];
}
function boxOf(r) {
  return { x: parseFloat(r.getAttribute('x')), y: parseFloat(r.getAttribute('y')), width: parseFloat(r.getAttribute('width')), height: parseFloat(r.getAttribute('height')) };
}
function clusterRect(f, qn) {
  return SM.shapeBox(f.svgEl.querySelector('g.cluster[data-qualified-name="' + qn + '"] rect'));
}
function within(frame, shape, tol) {
  expect(Math.abs(frame.x - shape.x)).toBeLessThanOrEqual(tol);
  expect(Math.abs(frame.y - shape.y)).toBeLessThanOrEqual(tol);
  expect(Math.abs(frame.x + frame.width - (shape.x + shape.width))).toBeLessThanOrEqual(tol);
  expect(Math.abs(frame.y + frame.height - (shape.y + shape.height))).toBeLessThanOrEqual(tol);
}
function topAt(f, x, y) {
  var r = OB.hitTestTopmost(f.overlayEl, x, y);
  return r ? r.getAttribute('data-type') + ':' + r.getAttribute('data-id') : null;
}

describe('smetana の state 図: 複合状態の枠は描かれた外枠に重なる', function() {
  test('並んだ複合状態 A / B の枠がそれぞれの外枠に合い、互いをまたがない', function() {
    var f = load('smetana-siblings');
    within(boxOf(frameOf(f, 'A')), clusterRect(f, 'A'), 4);
    within(boxOf(frameOf(f, 'B')), clusterRect(f, 'B'), 4);
  });
  test('2 つ目の複合状態の名前を指すとその複合状態が出る (前は 1 つ目にまたがる枠が出た)', function() {
    var f = load('smetana-siblings');
    var t = Array.prototype.filter.call(f.svgEl.querySelectorAll('g.cluster text'), function(e) { return e.textContent.trim() === 'B'; })[0];
    // 名前の文字の少し上 (x / y はベースライン)
    expect(topAt(f, parseFloat(t.getAttribute('x')) + 4, parseFloat(t.getAttribute('y')) - 5)).toBe('state:B');
  });
  test('入れ子の複合状態 A > B > C の枠がそれぞれの外枠に合う', function() {
    var f = load('smetana-nested');
    within(boxOf(frameOf(f, 'A')), clusterRect(f, 'A'), 4);
    within(boxOf(frameOf(f, 'A.B')), clusterRect(f, 'A.B'), 4);
  });
});

function stateAt(f, x, y) { return topAt(f, x, y); }
function orphanShapeNear(f, text) {
  var t = Array.prototype.filter.call(f.svgEl.querySelectorAll('text'), function(e) {
    return e.textContent.trim() === text && e.parentNode && !(e.parentNode.getAttribute('class'));
  })[0];
  var tx = parseFloat(t.getAttribute('x')), ty = parseFloat(t.getAttribute('y'));
  var best = null, bd = Infinity;
  Array.prototype.forEach.call(f.svgEl.querySelectorAll('ellipse, rect'), function(e) {
    if (e.parentNode.getAttribute('class')) return;
    var b = SM.shapeBox(e);
    var d = Math.abs(b.x + b.width / 2 - tx) + Math.abs(b.y + b.height / 2 - ty);
    if (d < bd) { bd = d; best = b; }
  });
  return best;
}

describe('行き先の側の出口・pin と、どの遷移にもつながらない pin にも枠が出る', function() {
  test('出口 exit1 (矢じりの側) の丸を指すと exit1 が出る', function() {
    var f = load('pin-exits');
    var b = orphanShapeNear(f, 'exit1');
    expect(stateAt(f, b.x + b.width / 2, b.y + b.height / 2)).toBe('state:Diagnostics.exit1');
  });
  test('scxml の pin: 遷移の行き先 (entry1 / entry2) とつながらない pin (ex / sig_in / count_start) の四角を指すとその pin が出る', function() {
    var f = load('pin-pins');
    ['entry1', 'entry2', 'ex', 'sig_in', 'count_start', 'count_done'].forEach(function(n) {
      var b = orphanShapeNear(f, n);
      var got = stateAt(f, b.x + b.width / 2, b.y + b.height / 2) || '';
      expect(got.replace(/^state:(.*\.)?/, '')).toBe(n);
    });
  });
  test('履歴の「H」のような記号の文字では名前を付けない', function() {
    var f = load('pin-exits');
    var s = Array.prototype.map.call(f.overlayEl.querySelectorAll('rect.selectable[data-type="state"]'), function(r) { return r.getAttribute('data-id'); });
    expect(s.indexOf('H')).toBe(-1);
  });
});

global.window = _prevWindow;
global.document = _prevDocument;
MODS.forEach(function(m) { delete require.cache[require.resolve(m)]; });
