'use strict';
// BLK-migrator-20260923-2012 差し戻し: web の実物 (puml-themes の sequence-ex / sequence-ex2) で
//   - 長いメッセージが横切るライフラインを、文字も矢印も無い高さで指しても、そのメッセージの枠が出た
//     (メッセージの当たり判定は矢印とラベルの和集合の箱なので、箱の空いた所がライフラインを覆う)
//   - 図の題名 (title) に枠が出なかった。`!if` の枝ごとに title がある図では描かれた方を指す
// 描いた側で決める: ライフラインの線の真上にメッセージの文字・矢じり・線が無い所は、
// ライフラインを手前に出す (.selectable を持たない当たり判定だけを足し、枠の数は変えない)。
var jsdom = require('jsdom');
if (!global.window) {
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;
}
[
  'html-utils', 'dsl-utils', 'note-edit', 'regex-parts', 'id-normalizer',
  'dsl-updater', 'text-updater', 'parser-utils', 'line-resolver',
  'overlay-builder', 'selection-router', 'sequence-participant-zone',
].forEach(function(m) {
  try { delete require.cache[require.resolve('../src/core/' + m + '.js')]; } catch (e) {}
  require('../src/core/' + m + '.js');
});
try { delete require.cache[require.resolve('../src/modules/sequence.js')]; } catch (e) {}
require('../src/modules/sequence.js');
try { delete require.cache[require.resolve('../src/ui/sequence-overlay.js')]; } catch (e) {}
require('../src/ui/sequence-overlay.js');

var W = global.window;
var doc = global.document || W.document || new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>').window.document;
var _ownDoc = !global.document;
if (_ownDoc) global.document = doc;
var seq = W.MA.modules.plantumlSequence;
var overlay = W.MA.sequenceOverlay;

function svgOf(inner) {
  var div = doc.createElement('div');
  div.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
  return div.querySelector('svg');
}
function rectOf(el) {
  return {
    x: parseFloat(el.getAttribute('x')), y: parseFloat(el.getAttribute('y')),
    w: parseFloat(el.getAttribute('width')), h: parseFloat(el.getAttribute('height')),
  };
}
function head(name, x) {
  return '<g class="participant participant-head" data-qualified-name="' + name + '">' +
    '<rect x="' + x + '" y="10" width="40" height="30" fill="#E2E2F0"/>' +
    '<text x="' + (x + 10) + '" y="30" font-size="14" textLength="20">' + name + '</text></g>';
}
function lifeline(name, cx) {
  return '<g class="participant-lifeline" data-qualified-name="' + name + '">' +
    '<g><rect x="' + (cx - 4) + '" y="40" width="8" height="200" fill="#000" fill-opacity="0"/>' +
    '<line x1="' + cx + '" x2="' + cx + '" y1="40" y2="240"/></g></g>';
}
// A(30) → C(230) の長いメッセージ。ラベル "go" は A の近く (x=40..70) にだけ描かれ、
// B(130) の真上には矢印の線 (y=100) しか無い。
var MSG = '<g class="message">' +
  '<polygon points="220,96 230,100 220,104" fill="#000"/>' +
  '<line x1="30" x2="228" y1="100" y2="100"/>' +
  '<text x="40" y="95" font-size="13" textLength="30">go</text></g>';
var DSL = ['@startuml', 'participant A', 'participant B', 'participant C', 'A -> C : go', '@enduml'].join('\n');

function build() {
  var svg = svgOf(lifeline('A', 30) + lifeline('B', 130) + lifeline('C', 230) +
    head('A', 10) + head('B', 110) + head('C', 210) + MSG);
  var out = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.buildSequenceOverlay(svg, seq.parseSequence(DSL), out, DSL);
  return out;
}
// 点 (x, y) を覆う rect のうち、document 順で最後 (= 手前) のもの。pointer-events:none は除く。
function topAt(out, x, y) {
  var hit = null;
  Array.prototype.forEach.call(out.querySelectorAll('rect[data-type]'), function(r) {
    if (r.style && r.style.pointerEvents === 'none') return;
    var b = rectOf(r);
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) hit = r;
  });
  return hit;
}

describe('長いメッセージが横切るライフライン', function() {
  test('メッセージの箱の中でも、線の上に文字も矢印も無い高さはライフラインが選ばれる', function() {
    var out = build();
    // B の線の上、メッセージの箱 (y≈78..108) の中で、矢印の線 (y=100) から離れた高さ
    var hit = topAt(out, 130, 88);
    expect(hit).not.toBeNull();
    expect(hit.getAttribute('data-type')).toBe('lifeline');
    expect(hit.getAttribute('data-id')).toBe('B');
  });

  test('矢印の線・矢じり・ラベルの上はこれまでどおりメッセージが選ばれる', function() {
    var out = build();
    expect(topAt(out, 130, 100).getAttribute('data-type')).toBe('message');   // B を横切る線
    expect(topAt(out, 229, 100).getAttribute('data-type')).toBe('message');   // C の矢じり
    expect(topAt(out, 55, 90).getAttribute('data-type')).toBe('message');     // ラベル
    // A の線の上は、線の始まり (y=100) だけがメッセージ。ラベルより上の空き (y=80) はライフライン
    expect(topAt(out, 30, 80).getAttribute('data-type')).toBe('lifeline');
  });

  test('足した当たり判定は .selectable を持たず、ライフラインの枠の数は 1 本 1 つのまま', function() {
    var out = build();
    var fronts = out.querySelectorAll('rect[data-type="lifeline"][data-front]');
    expect(fronts.length).toBeGreaterThan(0);
    Array.prototype.forEach.call(fronts, function(r) {
      expect(r.classList.contains('selectable')).toBe(false);
    });
    ['A', 'B', 'C'].forEach(function(id) {
      expect(out.querySelectorAll('rect.selectable[data-type="lifeline"][data-id="' + id + '"]').length).toBe(1);
    });
  });
});

describe('図の題名 (title)', function() {
  var TITLE_SVG = '<title>Sequence Diagram</title><g>' +
    '<text x="60" y="20" font-size="14" textLength="120">Sequence Diagram</text></g>';

  test('`!if` の両枝に title がある図では、描かれた題名の行に枠が当たる', function() {
    var dsl = ['@startuml', '!if %variable_exists("$THEME")', 'title Sequence Diagram - $THEME theme',
      '!else', 'title Sequence Diagram', '!endif', 'participant A', '@enduml'].join('\n');
    var parsed = seq.parseSequence(dsl);
    expect(parsed.meta.titleLines.map(function(t) { return t.line; })).toEqual([3, 5]);
    var out = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(svgOf(TITLE_SVG + head('A', 10)), parsed, out, dsl);
    var r = out.querySelector('rect[data-type="title"]');
    expect(r).not.toBeNull();
    expect(r.getAttribute('data-line')).toBe('5');
    var b = rectOf(r);
    expect(b.x).toBeLessThanOrEqual(60);
    expect(b.x + b.w).toBeGreaterThanOrEqual(180);
  });

  test('title の無い図には題名の枠を出さない', function() {
    var dsl = ['@startuml', 'participant A', '@enduml'].join('\n');
    var out = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(svgOf(head('A', 10)), seq.parseSequence(dsl), out, dsl);
    expect(out.querySelector('rect[data-type="title"]')).toBeNull();
  });

  test('setTitle に行を渡すと、その行の題名だけを書き換える', function() {
    var dsl = ['@startuml', '!if 1', 'title Old A', '!else', '  title Old B', '!endif', '@enduml'].join('\n');
    var next = seq.setTitle(dsl, 'New B', 5);
    expect(next.split('\n')[2]).toBe('title Old A');
    expect(next.split('\n')[4]).toBe('  title New B');
  });
});

// 使い終わったら require キャッシュを落とす (後から自前の window を作るテストが登録し直せるように)。
[
  'core/html-utils', 'core/dsl-utils', 'core/note-edit', 'core/regex-parts', 'core/id-normalizer',
  'core/dsl-updater', 'core/text-updater', 'core/parser-utils', 'core/line-resolver',
  'core/overlay-builder', 'core/selection-router',
  'core/sequence-participant-zone', 'modules/sequence', 'ui/sequence-overlay',
].forEach(function(m) {
  try { delete require.cache[require.resolve('../src/' + m + '.js')]; } catch (e) {}
});
if (_ownDoc) delete global.document;
