'use strict';
// BLK-migrator-20260924-2232: 題 (title) を持つ新記法のアクティビティ図で、題の文字と矢印に選択枠が出なかった
// (web/plantuml の svg-sprites 系 5 枚)。当て方を「本文の並び」から「PlantUML が SVG に残した情報」へ寄せる:
//  - 題・凡例・見出し・脚注・説明は <g class="title" data-source-line> の行で当てる (@startuml を 0 とする)
//  - 分岐の菱形は中に描いた条件の文字で当てる (elseif の菱形にも枠が出る)
//  - 矢印は矢じりの先が触れている要素から「その 1 つ前の行の後」= 流れ (flow) の枠を置く
//  - それでも枠の無い文字は、同じ文字を書いた本文の行で当てる (switch / while の出口 / ノートなど)
// fixtures/svg/activity-2232-*.svg は同名の fixtures/dsl/*.puml を同梱の plantuml.jar で描いたもの。
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
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/activity-2232-' + name + '.svg'), 'utf8');
  // 本文は開いたファイルのまま (CRLF のものもある) 読む。
  var dsl = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/activity-2232-' + name + '.puml'), 'utf8');
  var div = document.createElement('div');
  div.innerHTML = svgText.replace(/<\?[^?]*\?>/g, '');
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
function textPoint(f, s) {
  var t = Array.prototype.filter.call(f.svgEl.querySelectorAll('text'), function(e) { return e.textContent === s; })[0];
  return { x: +t.getAttribute('x') + 2, y: +t.getAttribute('y') - 4 };
}
function hitAt(f, p) {
  var r = topAt(f, p.x, p.y);
  return r ? { type: r.getAttribute('data-type'), line: r.getAttribute('data-line') } : null;
}

describe('BLK-migrator-20260924-2232 題のあるアクティビティ図 (svg-sprites 系)', function() {
  test('題の文字にホバーすると title 行を指す枠、動作はどれも本人の枠', function() {
    var f = load('title-sprite');
    expect(hitAt(f, textPoint(f, 'Transform Translate Test'))).toEqual({ type: 'source-line', line: '10' });
    expect(hitAt(f, textPoint(f, 'The blue circle (with translate) should appear at 40,50'))).toEqual({ type: 'action', line: '11' });
    expect(hitAt(f, textPoint(f, 'The red circle (without translate) should appear at 10,10'))).toEqual({ type: 'action', line: '12' });
    // sprite だけの動作は箱の中に文字が無いので並び順で当たる (今までどおり)
    expect(frames(f, 'action').map(function(r) { return r.getAttribute('data-line'); }).sort()).toEqual(['11', '12', '13']);
  });

  test('矢じりの上には流れの枠が出て、矢じりの先の要素の 1 つ前の行を指す', function() {
    var f = load('title-sprite');
    // 11 → 12 の矢じり (先端 169.749,104.7031)、12 → 13 の矢じり (先端 169.749,159.7969)
    expect(hitAt(f, { x: 169.749, y: 100 })).toEqual({ type: 'flow', line: '11' });
    expect(hitAt(f, { x: 169.749, y: 155 })).toEqual({ type: 'flow', line: '12' });
    // 流れの枠は動作の箱に食い込まない (箱の中ほどは動作のまま)
    expect(hitAt(f, { x: 169.749, y: 110 })).toEqual({ type: 'action', line: '12' });
  });
});

describe('BLK-migrator-20260924-2232 見出し・凡例・elseif・矢印の文字', function() {
  test('header / footer / title / caption / legend は各行を指す (本文の行番号)', function() {
    var f = load('elseif-decor');
    expect(hitAt(f, textPoint(f, 'H1'))).toEqual({ type: 'source-line', line: '2' });
    expect(hitAt(f, textPoint(f, 'F1'))).toEqual({ type: 'source-line', line: '3' });
    expect(hitAt(f, textPoint(f, 'T1'))).toEqual({ type: 'source-line', line: '4' });
    expect(hitAt(f, textPoint(f, 'C1'))).toEqual({ type: 'source-line', line: '5' });
    expect(hitAt(f, textPoint(f, 'L1'))).toEqual({ type: 'source-line', line: '6' });
  });

  test('elseif の菱形にも枠が出て、elseif の行を指す (押すと分岐のフォーム)', function() {
    var f = load('elseif-decor');
    expect(hitAt(f, textPoint(f, 'c1?'))).toEqual({ type: 'decision', line: '11' });
    expect(hitAt(f, textPoint(f, 'c2?'))).toEqual({ type: 'decision', line: '13' });
    var ids = frames(f, 'decision').map(function(r) { return r.getAttribute('data-id'); });
    expect(ids[0]).toBe(ids[1]);
  });

  test('矢印に書いた文字 (`-> lbl;`) とその矢印は、同じ行 (-> lbl;) の流れを指す', function() {
    var f = load('elseif-decor');
    expect(hitAt(f, textPoint(f, 'lbl'))).toEqual({ type: 'flow', line: '18' });
    expect(hitAt(f, { x: 103, y: 308 })).toEqual({ type: 'flow', line: '18' });
    // else 側の最初の動作へ入る矢印は else の行の後 (= no 側のはじめ)
    expect(hitAt(f, { x: 171, y: 207 })).toEqual({ type: 'flow', line: '15' });
    // 分岐を閉じる前の矢印 (動作 b から下へ) は b の後
    expect(hitAt(f, { x: 44, y: 266 })).toEqual({ type: 'flow', line: '12' });
  });

  test('文字で当たらなかった要素の枠は、同じ文字が本文に無ければ置かない (でたらめな行を指さない)', function() {
    var f = load('elseif-decor');
    frames(f, 'source-line').forEach(function(r) {
      expect(+r.getAttribute('data-line') >= 2 && +r.getAttribute('data-line') <= 20).toBe(true);
    });
  });

  test('本文の行を持たない (parse 結果を作り直した) ときも、流れは矢じりの先の 1 つ前の行を指す', function() {
    var f = load('title-sprite');
    var parsed = JSON.parse(JSON.stringify(f.parsed));
    expect(parsed.sourceLines === undefined).toBe(true);
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    AM.buildOverlay(f.svgEl, parsed, overlayEl);
    var lines = Array.prototype.map.call(overlayEl.querySelectorAll('rect[data-type="flow"]'),
      function(r) { return r.getAttribute('data-line'); }).sort();
    expect(lines).toEqual(['11', '12']);
  });
});

describe('BLK-migrator-20260924-2232 流れの枠を押したときの右欄', function() {
  test('矢印を選ぶと「流れの矢印」と、その位置を既定にした ＋ ここに挿入 が出る', function() {
    var dsl = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/activity-2232-elseif-decor.puml'), 'utf8');
    window.MA.htmlUtils = window.MA.htmlUtils || { escHtml: function(s) { return String(s); } };
    var propsEl = document.createElement('div');
    var calls = 0;
    var ctx = { getMmdText: function() { return dsl; }, setMmdText: function() {}, onUpdate: function() { calls++; } };
    AM.renderProps([{ type: 'flow', id: 'flow:18:0', line: 18 }], AM.parse(dsl), propsEl, ctx);
    expect(propsEl.textContent.indexOf('流れの矢印') >= 0).toBe(true);
    expect(propsEl.textContent.indexOf('L18') >= 0).toBe(true);
    expect(calls).toBe(0);
  });
});

global.window = _prevWindow;
global.document = _prevDocument;
MODS.forEach(function(m) { try { delete require.cache[require.resolve(m)]; } catch (e) {} });
