'use strict';
// BLK-migrator-20260924-0752: 旧記法 (`(*) -->` / `if "..." then` / `===LABEL===`) のアクティビティ図で
// 選択枠が全滅していた。PlantUML は旧記法の図では関係 (<g class="link">) に書かれた行を残すので、
// 関係は行で、<g> に入らない動作の箱・同期バーは端が触れている関係の行で当てる (overlay-builder.addLooseShapes)。
// 新記法の図は SVG に行が無いので本文で当てるが、動作は並び順ではなく箱の中の文字で当てる
// (レーンをまたぐ図・角の丸くないテーマの図でずれ / 全滅していた)。
// fixtures/svg/activity-0752-*.svg は同名の fixtures/dsl/*.puml を同梱の plantuml.jar で描いたもの。
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

var OB = window.MA.overlayBuilder;
var AM = window.MA.modules.plantumlActivity;

function load(name) {
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/activity-0752-' + name + '.svg'), 'utf8');
  var dsl = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/activity-0752-' + name + '.puml'), 'utf8').replace(/\r\n/g, '\n');
  var div = document.createElement('div');
  div.innerHTML = svgText;
  var svgEl = div.querySelector('svg');
  var parsed = AM.parse(dsl);
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  AM.buildOverlay(svgEl, parsed, overlayEl);
  return { svgEl: svgEl, parsed: parsed, overlayEl: overlayEl };
}

function frames(f, type) {
  return Array.prototype.filter.call(f.overlayEl.querySelectorAll('rect.selectable'), function(r) {
    return !type || r.getAttribute('data-type') === type;
  });
}
function box(r) {
  return { x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') };
}
// その点を覆う枠のうち一番手前 (後ろの子) のもの。
function topAt(f, x, y) {
  var hit = null;
  frames(f).forEach(function(r) {
    var b = box(r);
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) hit = r;
  });
  return hit;
}
function rectOfText(svgEl, s) {
  var t = Array.prototype.filter.call(svgEl.querySelectorAll('text'), function(e) { return e.textContent === s; })[0];
  return { x: +t.getAttribute('x') + 2, y: +t.getAttribute('y') - 4 };
}

describe('旧記法のアクティビティ図: SVG の行とつながりで枠を当てる', function() {
  test('開始・動作・分岐・同期バー・終了・関係のどれにも枠が出る (全滅しない)', function() {
    var f = load('legacy');
    var fr = frames(f, 'source-line');
    expect(fr.length).toBeGreaterThanOrEqual(11);
    var kinds = {};
    fr.forEach(function(r) { kinds[r.getAttribute('data-src-kind')] = true; });
    expect(kinds.start_entity).toBe(true);
    expect(kinds.end_entity).toBe(true);
    expect(kinds.entity).toBe(true);
    expect(kinds.link).toBe(true);
    expect(kinds.shape).toBe(true);
  });

  test('動作の箱は、その動作を初めて書いた行を指す (Action1 は L2、Action2 は L4)', function() {
    var f = load('legacy');
    var a1 = rectOfText(f.svgEl, 'Action1');
    var a2 = rectOfText(f.svgEl, 'Action2');
    expect(topAt(f, a1.x, a1.y).getAttribute('data-line')).toBe('2');
    expect(topAt(f, a2.x, a2.y).getAttribute('data-line')).toBe('4');
  });

  test('分岐の菱形は入ってくる関係の行、同期バー ===LABEL=== は最初に書いた行を指す', function() {
    var f = load('legacy');
    var diamond = f.svgEl.querySelector('g.entity polygon');
    var pts = diamond.getAttribute('points').split(',').map(Number);
    var hitD = topAt(f, pts[0], pts[1] + 12);
    expect(hitD.getAttribute('data-src-kind')).toBe('entity');
    expect(hitD.getAttribute('data-line')).toBe('3');
    var bar = Array.prototype.filter.call(f.svgEl.querySelectorAll('rect'), function(r) { return r.getAttribute('height') === '8'; })[0];
    var hitB = topAt(f, +bar.getAttribute('x') + 40, +bar.getAttribute('y') + 4);
    expect(hitB.getAttribute('data-line')).toBe('5');
  });

  test('枝のラベル (yes / no) を指すと、その関係の行が選ばれる', function() {
    var f = load('legacy');
    var yes = rectOfText(f.svgEl, 'yes');
    var no = rectOfText(f.svgEl, 'no');
    expect(topAt(f, yes.x, yes.y).getAttribute('data-line')).toBe('4');
    expect(topAt(f, no.x, no.y).getAttribute('data-line')).toBe('7');
  });

  test('関係に行の無い SVG (新記法) では addLooseShapes は何も置かない', function() {
    var f = load('lanes');
    var ov = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(OB.addLooseShapes(f.svgEl, ov, [])).toBe(0);
  });
});

describe('新記法: 動作は箱の中の文字で当てる', function() {
  test('レーンをまたぐ図でも、各動作の枠がその名前の箱に出る (並び順でずれない)', function() {
    var f = load('lanes');
    ['foo1', 'foo2', 'foo3', 'foo4', 'foo5'].forEach(function(nm, i) {
      var p = rectOfText(f.svgEl, nm);
      var hit = topAt(f, p.x, p.y);
      expect(hit).not.toBeNull();
      expect(hit.getAttribute('data-type')).toBe('action');
      var node = f.parsed.nodes.filter(function(n) { return n.kind === 'action' && n.text === nm; })[0];
      expect(hit.getAttribute('data-line')).toBe(String(node.line));
    });
  });

  test('角の丸くない箱 (テーマ・roundcorner 0) も動作として当たる', function() {
    var f = load('lanes');
    expect(frames(f, 'action').length).toBe(5);
  });

  test('レーンの見出しを指すと、そのレーンを最初に書いた行が選ばれる', function() {
    var f = load('lanes');
    var p = rectOfText(f.svgEl, 'Swimlane2');
    var hit = topAt(f, p.x, p.y);
    expect(hit.getAttribute('data-type')).toBe('swimlane');
    expect(hit.getAttribute('data-line')).toBe('6');
  });
});

global.window = _prevWindow;
global.document = _prevDocument;
MODS.forEach(function(m) { try { delete require.cache[require.resolve(m)]; } catch (e) {} });
