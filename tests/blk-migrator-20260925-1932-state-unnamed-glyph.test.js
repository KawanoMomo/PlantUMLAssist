'use strict';
// BLK-migrator-20260925-1932: どの遷移にもつながらない履歴 (`state H <<history>>` / `<<history*>>`) の丸と「H」、
// fork / join の棒にも、その宣言の枠が出る。PlantUML はこれらを名前の付いた <g> も名前の文字も無しに描くので、
// 遷移の端からも脇の文字からも名前が引けなかった。図形の種類と入れ物で組を作り、宣言順に当てる。
// fixtures/svg/state-unnamed-glyph-*.svg は同名の fixtures/dsl/*.puml を同梱の plantuml.jar (1.2026.8) で描いたもの。
// s6 は migrator の corpus/state-06-entry-exit-history.puml そのもの。
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
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/state-unnamed-glyph-' + name + '.svg'), 'utf8');
  var dsl = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/state-unnamed-glyph-' + name + '.puml'), 'utf8').replace(/\r\n/g, '\n');
  var div = document.createElement('div');
  div.innerHTML = svgText;
  var svgEl = div.querySelector('svg');
  var parsed = ST.parse(dsl);
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ST.buildOverlay(svgEl, parsed, overlayEl);
  return { svgEl: svgEl, parsed: parsed, overlayEl: overlayEl };
}
function ids(f) {
  var seen = {};
  Array.prototype.forEach.call(f.overlayEl.querySelectorAll('rect.selectable[data-type="state"]'), function(r) {
    seen[r.getAttribute('data-id')] = r.getAttribute('data-line');
  });
  return seen;
}
function topAt(f, p) {
  var r = OB.hitTestTopmost(f.overlayEl, p.x, p.y);
  return r ? r.getAttribute('data-type') + ':' + r.getAttribute('data-id') + '@' + r.getAttribute('data-line') : null;
}
function center(el) {
  var b = SM.shapeBox(el);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
function hText(f, s) {
  return Array.prototype.filter.call(f.svgEl.querySelectorAll('text'), function(t) { return t.textContent.trim() === s; });
}
function circleUnder(f, t) {
  var c = center(t);
  return Array.prototype.find.call(f.svgEl.querySelectorAll('ellipse'), function(e) {
    var b = SM.shapeBox(e);
    return c.x >= b.x && c.x <= b.x + b.width && c.y >= b.y && c.y <= b.y + b.height;
  });
}

describe('state 選択枠: 遷移の無い履歴 (BLK の最小再現)', function() {
  var f = load('min');
  test('History (遷移なし) と DeepHist (遷移あり) の丸と「H」の両方に、本人の宣言行の枠が出る', function() {
    var hs = hText(f, 'H');
    expect(hs.length).toBe(2);
    var got = hs.map(function(t) { return [topAt(f, center(t)), topAt(f, center(circleUnder(f, t)))]; });
    got.sort();
    expect(got).toEqual([['state:DeepHist@6', 'state:DeepHist@6'], ['state:History@5', 'state:History@5']]);
  });
});

describe('state 選択枠: migrator corpus state-06 (入口・出口・履歴 2 つ)', function() {
  var f = load('s6');
  test('History・DeepHist・入口・出口・複合状態・子の全部に枠が出る', function() {
    var s = ids(f);
    expect(s.History).toBe('9');
    expect(s.DeepHist).toBe('12');
    expect(s['Diagnostics.entry1']).toBe('4');
    expect(s['Diagnostics.exit1']).toBe('5');
    expect(s.Diagnostics).toBe('3');
    expect(s['Diagnostics.RunningDiag']).toBe('6');
  });
  test('遷移の無い History の「H」を指すと History が選ばれる', function() {
    var h = hText(f, 'H').map(function(t) { return topAt(f, center(t)); }).sort();
    expect(h).toEqual(['state:DeepHist@12', 'state:History@9']);
  });
});

describe('state 選択枠: 遷移の有無で枠の有無が変わらない (全部宣言だけの図)', function() {
  var f = load('iso');
  test('fork / join の棒・履歴 H / H*・複合状態の中の履歴に、宣言行の枠が出る', function() {
    var s = ids(f);
    expect(s.F1).toBe('4');
    expect(s.J1).toBe('5');
    expect(s.H1).toBe('8');
    expect(s.H2).toBe('9');
    expect(s['Comp.HH']).toBe('11');
  });
  test('棒は描いた順 = 宣言順 (左の棒が F1、右が J1)', function() {
    var bars = Array.prototype.filter.call(f.svgEl.querySelectorAll('rect'), function(r) {
      return (r.getAttribute('fill') || '').toLowerCase() === '#555';
    });
    expect(bars.length).toBe(2);
    expect(topAt(f, center(bars[0]))).toBe('state:F1@4');
    expect(topAt(f, center(bars[1]))).toBe('state:J1@5');
  });
  test('入口・出口・pin・expansion は今までどおり名前の文字で当たる', function() {
    var s = ids(f);
    ['Comp.EP', 'Comp.XP', 'Comp.I1', 'Comp.O1', 'Comp.X1', 'Comp.X2', 'Comp.B', 'C1', 'E1', 'S1', 'A'].forEach(function(id) {
      expect(s[id]).toBeTruthy();
    });
  });
});

describe('state 選択枠: 遷移の行き先の [H] と宣言だけの履歴が同じ複合状態にある', function() {
  var f = load('mix');
  test('`X --> Comp[H]` の丸は宣言に当てず、宣言だけの Keep にはもう 1 つの丸が当たる', function() {
    var s = ids(f);
    expect(s['Comp.Keep']).toBe('5');
    var hs = hText(f, 'H');
    expect(hs.length).toBe(2);
    var got = hs.map(function(t) { return topAt(f, center(t)); });
    expect(got.filter(function(x) { return x === 'state:Comp.Keep@5'; }).length).toBe(1);
    expect(got.filter(function(x) { return /Keep/.test(x || ''); }).length).toBe(1);
  });
  test('遷移のある fork (F2) と無い fork (Lone)、宣言だけの H* (Deep) にそれぞれ枠が出る', function() {
    var s = ids(f);
    expect(s.F2).toBe('8');
    expect(s.Lone).toBe('11');
    expect(s.Deep).toBe('12');
  });
});

global.window = _prevWindow;
global.document = _prevDocument;
MODS.forEach(function(m) { delete require.cache[require.resolve(m)]; });
