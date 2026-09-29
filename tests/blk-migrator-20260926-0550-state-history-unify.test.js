'use strict';
// BLK-migrator-20260926-0550: 履歴の疑似状態 (`[H]` / `[H*]` / `Comp[H]` / `<<history>>` / `<<history*>>`) の丸と「H」は、
// 宣言の有無・遷移の有無・入れ物に依らず state-svg-map の 1 か所 (_frameHistories) で当てる。
// 以前は 宣言して遷移でつないだ履歴 = 遷移の名前 (3.)、宣言だけの履歴 = 形と入れ物 (4.)、端に書いた履歴 = 遷移の行 (5.) と
// 3 つの経路に分かれていた。ここでは 1 枚の図にそれらを全部混ぜ、どの丸・文字にも本人の枠が出ることを守る。
// fixtures/svg/state-history-unify*.svg は同名の fixtures/dsl/*.puml を同梱の plantuml.jar (1.2026.8) で描いたもの。
// unify-blk は BLK の最小再現そのもの。
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

function load(name, tweak) {
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/state-history-' + name + '.svg'), 'utf8');
  if (tweak) svgText = tweak(svgText);
  var dsl = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/state-history-' + name + '.puml'), 'utf8').replace(/\r\n/g, '\n');
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
function circleUnder(f, t) {
  var c = center(t);
  return Array.prototype.find.call(f.svgEl.querySelectorAll('ellipse'), function(e) {
    var b = SM.shapeBox(e);
    return c.x >= b.x && c.x <= b.x + b.width && c.y >= b.y && c.y <= b.y + b.height;
  });
}
// 丸の中の「H」/「H*」ごとに [文字, 文字の中心で出る枠, 丸の中心で出る枠]
function glyphHits(f) {
  return Array.prototype.filter.call(f.svgEl.querySelectorAll('text'), function(t) {
    var s = t.textContent.trim();
    return (s === 'H' || s === 'H*') && !(t.parentNode.getAttribute && t.parentNode.getAttribute('class'));
  }).map(function(t) {
    return t.textContent.trim() + ' ' + topAt(f, center(t)) + ' ' + topAt(f, center(circleUnder(f, t)));
  }).sort();
}

describe('state 選択枠: BLK の最小再現 (遷移でつないだ最上位の [H] / [H*])', function() {
  test('[H] の丸と「H」、[H*] の丸と「H*」に、本人の履歴の枠 (最初に使う遷移の行) が出る', function() {
    expect(glyphHits(load('unify-blk'))).toEqual([
      'H pseudo:history@@6 pseudo:history@@6',
      'H* pseudo:historyDeep@@8 pseudo:historyDeep@@8',
    ]);
  });
});

describe('state 選択枠: 宣言した履歴・宣言だけの履歴・端に書いた履歴を 1 枚に混ぜても、全部の丸に本人の枠', function() {
  var expected = [
    'H pseudo:history@Comp@16 pseudo:history@Comp@16',      // Other --> Comp[H] (Comp の中に描かれる)
    'H pseudo:history@Other@12 pseudo:history@Other@12',    // Other の中の [H] --> C
    'H state:Comp.Lone@6 state:Comp.Lone@6',                // 宣言だけ (遷移なし)
    'H* pseudo:historyDeep@Other@15 pseudo:historyDeep@Other@15', // Comp --> Other[H*]
    'H* state:Comp.DeepHist@5 state:Comp.DeepHist@5',       // 宣言して B --> DeepHist でつないだ
  ];
  test('data-source-line のある SVG (1.2026.8)', function() {
    expect(glyphHits(load('unify'))).toEqual(expected);
  });
  test('遷移の行が分からない SVG でも、宣言した履歴は遷移の名前と形で本人の宣言行に当たる', function() {
    var f = load('unify', function(s) { return s.replace(/ data-source-line="\d+"/g, ''); });
    var got = glyphHits(f).filter(function(s) { return /Lone|DeepHist/.test(s); });
    expect(got).toEqual(['H state:Comp.Lone@6 state:Comp.Lone@6', 'H* state:Comp.DeepHist@5 state:Comp.DeepHist@5']);
  });
  test('履歴の枠は状態の枠と取り違えない (A / B / C は本人の枠のまま)', function() {
    var f = load('unify');
    var ids = {};
    Array.prototype.forEach.call(f.overlayEl.querySelectorAll('rect[data-type="state"]'), function(r) {
      ids[r.getAttribute('data-id')] = r.getAttribute('data-line');
    });
    expect(ids['Comp.A']).toBe('3');
    expect(ids['Comp.B']).toBe('4');
    expect(ids['Other.C']).toBe('11');
    expect(ids['Comp.DeepHist']).toBe('5');
    expect(ids['Comp.Lone']).toBe('6');
  });
});

global.window = _prevWindow;
global.document = _prevDocument;
MODS.forEach(function(m) { delete require.cache[require.resolve(m)]; });
