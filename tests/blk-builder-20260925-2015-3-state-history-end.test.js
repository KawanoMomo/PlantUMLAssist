'use strict';
// BLK-builder-20260925-2015-3: 遷移の端に書いた履歴 (`Operation --> [H]` / `[H] --> A` / `Idle --> Comp[H*]`) の丸と「H」にも
// 枠が出る。PlantUML は名前の付いた <g> を作らず、線の名前も `*historical*Comp` のような仮の名なので状態としては引けず、
// 丸の「H」を指すと隣の遷移の大きな枠が出て (corpus の state-11)、「H*」では何も出なかった。
// 丸に触れる遷移の DSL の端の書き方から「どこの履歴か」を決め、開始・終了と同じ 'pseudo' の枠にする。
// fixtures/svg/state-history-end-*.svg は同名の fixtures/dsl/*.puml を同梱の plantuml.jar (1.2026.8) で描いたもの。
// s11 は migrator の corpus/state-11-hstate-transitions-full.puml そのもの (@startuml の前にコメント行がある)。
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
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/state-history-end-' + name + '.svg'), 'utf8');
  var dsl = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/state-history-end-' + name + '.puml'), 'utf8').replace(/\r\n/g, '\n');
  var div = document.createElement('div');
  div.innerHTML = svgText;
  var svgEl = div.querySelector('svg');
  var parsed = ST.parse(dsl);
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ST.buildOverlay(svgEl, parsed, overlayEl);
  return { svgEl: svgEl, parsed: parsed, overlayEl: overlayEl };
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
function hits(f, s) {
  return hText(f, s).map(function(t) { return [topAt(f, center(t)), topAt(f, center(circleUnder(f, t)))]; });
}

describe('state 選択枠: 遷移の端の履歴 (corpus の state-11)', function() {
  var f = load('s11');
  test('最上位の [H] / [H*] の丸と文字に、履歴の枠 (最初に使う遷移の行) が出る', function() {
    expect(hits(f, 'H')).toEqual([['pseudo:history@@10', 'pseudo:history@@10']]);
    expect(hits(f, 'H*')).toEqual([['pseudo:historyDeep@@12', 'pseudo:historyDeep@@12']]);
  });
  test('@startuml の前に行がある図でも、開始・終了の枠の行が本文の [*] の行になる', function() {
    var got = {};
    Array.prototype.forEach.call(f.overlayEl.querySelectorAll('rect[data-type="pseudo"]'), function(r) {
      got[r.getAttribute('data-id')] = r.getAttribute('data-line');
    });
    expect(got['start@Operation']).toBe('4');
    expect(got['start@']).toBe('9');
    expect(got['end@']).toBe('13');
  });
  test('遷移の枠は今までどおり全部出る', function() {
    var n = f.overlayEl.querySelectorAll('rect[data-type="transition"]');
    var ids = {};
    Array.prototype.forEach.call(n, function(r) { ids[r.getAttribute('data-id')] = true; });
    expect(Object.keys(ids).length).toBe(9);
  });
});

describe('state 選択枠: 入れ物の中の [H] と、親を名指す Comp[H] / Comp[H*]', function() {
  var f = load('mix');
  test('丸 4 つが、書かれた { } または名指した親の履歴になる', function() {
    var got = hits(f, 'H').concat(hits(f, 'H*')).map(function(p) { return p[0] + '|' + p[1]; }).sort();
    expect(got).toEqual([
      'pseudo:history@Comp@7|pseudo:history@Comp@7',
      'pseudo:history@Other@15|pseudo:history@Other@15',
      'pseudo:historyDeep@Comp@14|pseudo:historyDeep@Comp@14',
      'pseudo:historyDeep@Other@11|pseudo:historyDeep@Other@11',
    ]);
  });
  test('履歴を選ぶと、右パネルにその履歴につながる遷移が並ぶ', function() {
    var propsEl = document.createElement('div');
    document.body.appendChild(propsEl);
    window.MA.properties = window.MA.properties || {};
    var P = window.MA.properties;
    if (!P.primaryButtonHtml) P.primaryButtonHtml = function(id, l) { return '<button id="' + id + '">' + l + '</button>'; };
    if (!P.bindEvent) P.bindEvent = function() {};
    ST.renderProps([{ type: 'pseudo', id: 'history@Comp', line: 7 }], f.parsed, propsEl, {});
    var info = propsEl.querySelector('#st-pseudo-info');
    expect(info.getAttribute('data-kind')).toBe('history');
    expect(info.textContent).toContain('履歴 [H]');
    var items = Array.prototype.map.call(propsEl.querySelectorAll('#st-pseudo-links li'), function(li) { return li.textContent; });
    expect(items).toEqual(['L7 [H] --> A', 'L13 Idle --> Comp[H]']);
    ST.renderProps([{ type: 'pseudo', id: 'historyDeep@Other', line: 11 }], f.parsed, propsEl, {});
    items = Array.prototype.map.call(propsEl.querySelectorAll('#st-pseudo-links li'), function(li) { return li.textContent; });
    expect(items).toEqual(['L11 C --> [H*]']);
    propsEl.remove();
  });
});

global.window = _prevWindow;
global.document = _prevDocument;
MODS.forEach(function(m) { delete require.cache[require.resolve(m)]; });
