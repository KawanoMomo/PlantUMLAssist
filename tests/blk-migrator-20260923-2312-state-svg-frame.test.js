'use strict';
// BLK-migrator-20260923-2312: 状態遷移図の選択枠を、PlantUML が SVG に残した要素情報で当てる。
// 宣言の無い状態 (`[*] --> State1` だけ)・複合状態の子・並行領域・choice / fork / join / 終了・
// 入口 / 出口・`->` や `--->` の遷移が混ざっても、どの要素にも本人の枠が出る。
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

describe('state 選択枠: 宣言の無い状態だけの図 (BLK の最小再現)', function() {
  var f = load('minimal');
  test('宣言の無い状態・複合状態とその子・開始の全部に枠が出る', function() {
    var s = ids(f, 'state');
    expect(s.State1).toBe('2');
    expect(s.State2).toBe('3');
    expect(s.State3).toBe('4');
    expect(s['State3.Sub1']).toBe('5');
    expect(s['State3.Sub2']).toBe('6');
    var p = ids(f, 'pseudo');
    expect(Object.keys(p).sort()).toEqual(['start@', 'start@State3']);
  });
  test('遷移 4 本すべてに枠が出て、ラベルを押すとその遷移が選ばれる', function() {
    expect(Object.keys(ids(f, 'transition')).sort()).toEqual(['__t_0', '__t_1', '__t_2', '__t_3']);
    var label = Array.prototype.find.call(f.svgEl.querySelectorAll('g.link text'), function(t) { return t.textContent.trim() === 'event1'; });
    expect(topAt(f, center(label))).toBe('transition:__t_1');
  });
  test('複合状態の中の子の遷移は、複合状態の枠より手前', function() {
    var g = f.svgEl.querySelectorAll('g.link')[1];   // Sub1 --> Sub2 (SVG では子が先に描かれる)
    var poly = g.querySelector('polygon');
    expect(topAt(f, center(poly))).toBe('transition:__t_3');
  });
});

describe('state 選択枠: choice / fork / join / 名前付き終了 / `--->` と `->`', function() {
  var f = load('pseudo');
  test('擬似状態は宣言行、宣言の無い状態は最初の遷移の行で開く', function() {
    var s = ids(f, 'state');
    expect(s.choice1).toBe('3');
    expect(s.fork1).toBe('4');
    expect(s.join2).toBe('5');
    expect(s.end3).toBe('6');
    expect(s.Worker1).toBe('10');
    expect(s.Worker2).toBe('11');
  });
  test('fork / join の棒 (名前の付いた <g> を持たない図形) にも、その状態の枠が重なる', function() {
    var bars = Array.prototype.filter.call(f.svgEl.querySelectorAll('rect'), function(r) {
      return (r.getAttribute('fill') || '').toLowerCase() === '#555555';
    });
    expect(bars.length).toBe(2);
    var got = bars.map(function(b) { return topAt(f, center(b)); }).sort();
    expect(got).toEqual(['state:fork1', 'state:join2']);
  });
  test('遷移 8 本 (`--->` と `->` を含む) がすべて読めて枠が出る', function() {
    expect(f.parsed.transitions.length).toBe(8);
    expect(Object.keys(ids(f, 'transition')).length).toBe(8);
  });
});

describe('state 選択枠: 並行領域 / cluster の複合状態 / 入口・出口', function() {
  var f = load('regions');
  test('並行領域の子は仮の段 (CONC2) を外した名前で、開始は親の開始として出る', function() {
    var s = ids(f, 'state');
    ['Active.Off', 'Active.On', 'Active.Low', 'Active.High', 'Active', 'Box', 'Box.inner', 'Idle'].forEach(function(id) {
      expect(s[id]).toBeTruthy();
    });
    expect(s['Box.entryA']).toBe('13');
    expect(s.exitB).toBe('16');
    expect(ids(f, 'pseudo')['start@Active']).toBeTruthy();
  });
  test('複合状態の中の遷移のラベルは、複合状態ではなくその遷移が選ばれる', function() {
    var labels = Array.prototype.filter.call(f.svgEl.querySelectorAll('g.link text'), function(t) { return t.textContent.trim() === 'press' || t.textContent.trim() === 'tick'; });
    expect(labels.length).toBe(3);
    labels.forEach(function(t) { expect(/^transition:/.test(topAt(f, center(t)))).toBe(true); });
  });
  test('複合状態は入れ物として関係より後ろに置かれる', function() {
    var comp = frames(f, 'state').filter(function(r) { return r.getAttribute('data-composite') === '1'; });
    expect(comp.length).toBe(2);
    comp.forEach(function(r) { expect(r.getAttribute('data-hit-kind')).toBe('container'); });
  });
});

describe('state の遷移行: 実物で使われる矢印を同じ 1 本として読む', function() {
  test('`->` / `--->` / `-up->` / `-[#red,dashed]->` / 行き先の <<exitPoint>>', function() {
    var p = ST.parse('@startuml\nA -> B : a\nB ---> C\nC -up-> D : u\nD -[#red,dashed]-> E\nE --> X <<exitPoint>>\nF -down[#blue]-> G\n@enduml');
    expect(p.transitions.map(function(t) { return t.from + '>' + t.to; })).toEqual(['A>B', 'B>C', 'C>D', 'D>E', 'E>X', 'F>G']);
    expect(p.transitions[3].color).toBe('red');
    expect(p.transitions[0].trigger).toBe('a');
  });
  test('トリガを直しても元の矢印と <<exitPoint>> はそのまま', function() {
    var t = '@startuml\nA -up-> B : a\nE --> X <<exitPoint>> : go\n@enduml';
    var out = ST.updateTransition(t, 2, { trigger: 'b' });
    expect(out.split('\n')[1]).toBe('A -up-> B : b');
    out = ST.updateTransition(out, 3, { trigger: 'stop' });
    expect(out.split('\n')[2]).toBe('E --> X <<exitPoint>> : stop');
  });
});

global.window = _prevWindow;
global.document = _prevDocument;
MODS.forEach(function(m) { delete require.cache[require.resolve(m)]; });
