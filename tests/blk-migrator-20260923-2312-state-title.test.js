'use strict';
// BLK-migrator-20260923-2312 差し戻し 1 回目: state 図の題 (title) にホバーしても枠が出ない、
// または下の複合状態の枠が出た (web の state-ex / state-ex2 / state-with-point-ex の 1 件目)。
// class / component と同じく、題にも本文の行を指す枠 (source-line) を置く。
// fixtures/svg/state-svgmap-*.svg は同名の fixtures/dsl/*.puml を同梱の plantuml.jar で描いたもの。
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

function load(name) {
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/state-svgmap-' + name + '.svg'), 'utf8');
  var dsl = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/state-svgmap-' + name + '.puml'), 'utf8').replace(/\r\n/g, '\n');
  var div = document.createElement('div');
  div.innerHTML = svgText;
  var svgEl = div.querySelector('svg');
  var parsed = ST.parse(dsl);
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ST.buildOverlay(svgEl, parsed, overlayEl);
  return { svgEl: svgEl, parsed: parsed, overlayEl: overlayEl };
}

function frames(f, type) {
  return Array.prototype.filter.call(f.overlayEl.querySelectorAll('rect.selectable'), function(r) {
    return !type || r.getAttribute('data-type') === type;
  });
}
function ids(f, type) {
  var seen = {};
  frames(f, type).forEach(function(r) { seen[r.getAttribute('data-id')] = r.getAttribute('data-line'); });
  return seen;
}
function center(el) {
  var b = SM.shapeBox(el);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
function topAt(f, p) {
  var r = OB.hitTestTopmost(f.overlayEl, p.x, p.y);
  return r ? r.getAttribute('data-type') + ':' + r.getAttribute('data-id') : null;
}

describe('state 選択枠: 図の題', function() {
  var f = load('titled');
  test('題に本文の title 行 (L2) を指す枠が 1 つ出る', function() {
    var t = frames(f, 'source-line').filter(function(r) { return r.getAttribute('data-src-kind') === 'title'; });
    expect(t.length).toBe(1);
    expect(t[0].getAttribute('data-line')).toBe('2');
  });
  test('題の文字の中心を指すと、その題の枠が一番手前', function() {
    var txt = f.svgEl.querySelector('g.title text');
    expect(topAt(f, center(txt))).toBe('source-line:' + frames(f, 'source-line')[0].getAttribute('data-id'));
  });
  test('状態・遷移の枠は今までどおり (題の枠を足しても他は増減しない)', function() {
    expect(Object.keys(ids(f, 'state')).indexOf('State1')).toBeGreaterThan(-1);
    expect(Object.keys(ids(f, 'state')).indexOf('Active.NumLockOn')).toBeGreaterThan(-1);
    expect(frames(f, 'source-line').length).toBe(1);
  });
  test('題の無い図には題の枠を置かない', function() {
    var m = load('minimal');
    expect(frames(m, 'source-line').length).toBe(0);
  });
});

describe('addUnclaimed の見る範囲を絞る', function() {
  test('selector を渡すとその <g> だけに枠を置く (要素は自前で当てた図種のため)', function() {
    var f = load('titled');
    var ov = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var n = OB.addUnclaimed(f.svgEl, ov, [], 'g.title');
    expect(n).toBe(1);
    expect(ov.querySelectorAll('rect.selectable').length).toBe(1);
  });
});

global.window = _prevWindow;
global.document = _prevDocument;
MODS.forEach(function(m) { delete require.cache[require.resolve(m)]; });
