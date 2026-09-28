'use strict';
// BLK-migrator-20260926-2118: 新記法のアクティビティ図の折れた矢印 (分岐の菱形から枝へ「横へ → 下へ」、枝から合流へ
// 「下へ → 横へ」、while / repeat の戻り) は、矢じりに触れる最後の 1 区間にしか枠が無く、残りの区間を指すと枠が出なかった。
// 1 本の矢印 = 矢じりから元の要素まで端点でつながった区間の全部として、区間ごとの細い枠を同じ data-id で置く。
// fixtures/svg/activity-2118-*.svg は同名の fixtures/dsl/*.puml を同梱の plantuml.jar (1.2026.8) で描いたもの。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

var _prevWindow = global.window;
var _prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;

var MODS = [
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/modules/activity.js',
];
MODS.forEach(function(m) { try { delete require.cache[require.resolve(m)]; } catch (e) {} });
MODS.forEach(function(m) { require(m); });

var AM = window.MA.modules.plantumlActivity;

function load(name) {
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/activity-2118-' + name + '.svg'), 'utf8');
  var dsl = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/activity-2118-' + name + '.puml'), 'utf8');
  var div = document.createElement('div');
  div.innerHTML = svgText.replace(/<\?[^?]*\?>/g, '');
  var svgEl = div.querySelector('svg');
  var parsed = AM.parse(dsl);
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  var warn = console.warn;
  console.warn = function() {};
  try { AM.buildOverlay(svgEl, parsed, overlayEl); } finally { console.warn = warn; }
  return { svgEl: svgEl, overlayEl: overlayEl };
}
function box(r) {
  return { x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') };
}
// その点を覆う枠のうち一番手前 (後ろの子) のもの。
function topAt(f, x, y) {
  var hit = null;
  Array.prototype.forEach.call(f.overlayEl.querySelectorAll('rect.selectable'), function(r) {
    var b = box(r);
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) hit = r;
  });
  return hit;
}
function segs(f) {
  return Array.prototype.map.call(f.svgEl.querySelectorAll('line'), function(l) {
    var s = { x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1'), x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2') };
    s.mx = (s.x1 + s.x2) / 2; s.my = (s.y1 + s.y2) / 2;
    s.key = [s.x1, s.y1, s.x2, s.y2].map(Math.round).join(',');
    return s;
  }).filter(function(s) { return Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1) >= 0.5; });
}
function hitOf(f, s) {
  var r = topAt(f, s.mx, s.my);
  return r ? { type: r.getAttribute('data-type'), id: r.getAttribute('data-id'), line: r.getAttribute('data-line') } : null;
}

describe('BLK-migrator-20260926-2118 折れた矢印の全区間に枠', function() {
  test('最小再現 (if / else): 11 本の線分の中点すべてに流れの枠が出て、枝→合流の縦の線は各枝の矢印の枠', function() {
    var f = load('if-else');
    var all = segs(f);
    expect(all.length).toBe(11);
    all.forEach(function(s) {
      var h = hitOf(f, s);
      expect({ seg: s.key, type: h && h.type }).toEqual({ seg: s.key, type: 'flow' });
    });
    function at(key) { return hitOf(f, all.filter(function(s) { return s.key === key; })[0]); }
    // 枝 a (4 行目) から合流へ: 下へ → 横へ。縦も横も a の後を指す同じ矢印
    expect(at('29,124,29,142').line).toBe('4');
    expect(at('29,124,29,142').id).toBe(at('29,142,54,142').id);
    // 枝 b (6 行目) から合流へ
    expect(at('103,124,103,142').line).toBe('6');
    expect(at('103,124,103,142').id).toBe(at('103,142,78,142').id);
    // 菱形から枝 a へ: 横へ → 下へ。横の区間も a の前 (if の行) を指す同じ矢印
    expect(at('39,67,29,67').line).toBe('3');
    expect(at('39,67,29,67').id).toBe(at('29,67,29,89').id);
    expect(at('93,67,103,67').id).toBe(at('103,67,103,89').id);
  });

  test('折れ線は外接矩形 1 つでなく区間ごとの細い枠 (L 字の内側の空所は枠の外)', function() {
    var f = load('if-else');
    // a から合流への L 字 (29,124)→(29,142)→(54,142) の内側 (40,130) は空所
    var r = topAt(f, 40, 130);
    expect(r && r.getAttribute('data-type')).not.toBe('flow');
  });

  test('if / elseif / else・switch / case・fork・repeat / backward・while・else の無い if: 全部の線分の中点に流れの枠', function() {
    var f = load('bent');
    var none = segs(f).filter(function(s) {
      var h = hitOf(f, s);
      return !h || h.type !== 'flow';
    }).map(function(s) { return s.key; });
    expect(none).toEqual([]);
    // while の出口 (endwhile の行) は、菱形の左から下を回って次へ戻る 4 区間が同じ 1 本の矢印
    var lines = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/activity-2118-bent.puml'), 'utf8').split(/\r?\n/);
    var endwhile = String(lines.findIndex(function(l) { return /^endwhile/.test(l.trim()); }) + 1);
    var exit = ['87,621,75,621', '75,621,75,723', '75,723,111,723', '111,723,111,743'].map(function(k) {
      return hitOf(f, segs(f).filter(function(s) { return s.key === k; })[0]);
    });
    exit.forEach(function(h) { expect(h.line).toBe(endwhile); });
    expect(exit.map(function(h) { return h.id; }).filter(function(v, i, a) { return a.indexOf(v) === i; }).length).toBe(1);
  });
});

global.window = _prevWindow;
global.document = _prevDocument;
MODS.forEach(function(m) { try { delete require.cache[require.resolve(m)]; } catch (e) {} });
