'use strict';
// BLK-builder-20260925-0654-3: メンバーを指す note (`note right of E::field1 #yellow`) の本文に選択枠が出ない。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
[
  '../src/core/dsl-utils.js', '../src/core/regex-parts.js',
  '../src/core/line-resolver.js', '../src/core/text-updater.js',
  '../src/core/dsl-updater.js', '../src/core/parser-utils.js',
  '../src/core/props-renderer.js', '../src/core/overlay-builder.js',
  '../src/core/relation-options.js', '../src/modules/class.js',
].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var clMod = global.window.MA.modules.plantumlClass;

var DSL = ['@startuml', 'class B {', '  int lightblue', '  int yellow', '}',
  'note right of B::yellow #yellow', '  Hello yellow', 'end note',
  'note right of B::lightblue #lightblue', '  Hello lightblue', 'end note', '@enduml'].join('\n');

// PlantUML 1.2026.2 が描く形: クラスは g.entity、メンバーの note は g の外の吹き出し + 折り返し角 + 本文。
// 描かれる順はメンバーの順 (lightblue が先) で、DSL の順とは逆。
var SVG = '<g>' +
  '<g class="entity" data-qualified-name="B" data-source-line="2"><rect x="7" y="7" width="90" height="83"/>' +
  '<text x="45" y="28" textLength="9">B</text><text x="13" y="57" textLength="70">int lightblue</text>' +
  '<text x="13" y="75" textLength="57">int yellow</text></g>' +
  '<path d="M125,12 L125,21.17 L85.8,51.8 L125,29.17 L125,38.35 A0,0 0 0 0 125,38.35 L227.6,38.35 A0,0 0 0 0 227.6,38.35 L227.6,22 L217.6,12 L125,12 A0,0 0 0 0 125,12"/>' +
  '<path d="M217.6,12 L217.6,22 L227.6,22 L217.6,12"/>' +
  '<text x="131" y="30.5" textLength="90">Hello lightblue</text>' +
  '<path d="M125,48.35 L125,57.52 L72.5,71.4 L125,65.52 L125,74.7 A0,0 0 0 0 125,74.7 L215.3,74.7 A0,0 0 0 0 215.3,74.7 L215.3,58.35 L205.3,48.35 L125,48.35 A0,0 0 0 0 125,48.35"/>' +
  '<path d="M205.3,48.35 L205.3,58.35 L215.3,58.35 L205.3,48.35"/>' +
  '<text x="131" y="66.8" textLength="78">Hello yellow</text>' +
  '</g>';

function noteRects(dsl, svg) {
  document.body.innerHTML = '<svg id="src" xmlns="http://www.w3.org/2000/svg">' + svg +
    '</svg><svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
  clMod.buildOverlay(document.getElementById('src'), clMod.parse(dsl), document.getElementById('ov'));
  return Array.prototype.map.call(document.querySelectorAll('#ov rect[data-type="note"]'), function(r) {
    return [r.getAttribute('data-line'), r.getAttribute('data-target-id'),
      Math.round(+r.getAttribute('x')), Math.round(+r.getAttribute('y')),
      Math.round(+r.getAttribute('width')), Math.round(+r.getAttribute('height'))];
  }).sort();
}

describe('BLK-builder-20260925-0654-3 member note', function() {
  test('`Class::member #color` の note をクラスへの note として読み、メンバーと色を持つ', function() {
    var p = clMod.parse(DSL);
    expect(p.notes.map(function(n) { return [n.targetId, n.member, n.suffix, n.text, n.line, n.endLine]; })).toEqual([
      ['B', 'yellow', ' #yellow', 'Hello yellow', 6, 8],
      ['B', 'lightblue', ' #lightblue', 'Hello lightblue', 9, 11],
    ]);
  });

  test('inline / ステレオタイプ / 色つきのクラス note も読む (本文を `:member ...` と読み違えない)', function() {
    var p = clMod.parse(['@startuml', 'class G', 'note right of G::m1 <<yellowNote>>', '  x', 'end note',
      'note left of G::m2 : short', 'note right of G #yellow', '  y', 'end note', '@enduml'].join('\n'));
    expect(p.notes.map(function(n) { return [n.targetId, n.member, n.suffix, n.text]; })).toEqual([
      ['G', 'm1', ' <<yellowNote>>', 'x'], ['G', 'm2', '', 'short'], ['G', '', ' #yellow', 'y'],
    ]);
  });

  test('g の外に描かれた吹き出しに、本文の文字で本人の note を当てる (尖りを除いた箱)', function() {
    expect(noteRects(DSL, SVG)).toEqual([
      ['6', 'B', 125, 48, 90, 26],   // Hello yellow (DSL では先、描かれるのは後)
      ['9', 'B', 125, 12, 103, 26],  // Hello lightblue
    ]);
  });

  test('本文を書き換えてもメンバーと色の指定は残り、相手を替えるとメンバーだけ外れる', function() {
    var out = clMod.updateNote(DSL, 6, 8, { text: 'Hi yellow' }).split('\n');
    // 1 行の本文は従来どおり inline 形に畳む
    expect(out[5]).toBe('note right of B::yellow #yellow : Hi yellow');
    var n0 = clMod.parse(out.join('\n')).notes[0];
    expect([n0.targetId, n0.member, n0.suffix, n0.text]).toEqual(['B', 'yellow', ' #yellow', 'Hi yellow']);
    var moved = clMod.updateNote(DSL, 6, 8, { targetId: 'C' }).split('\n');
    expect(moved[5]).toBe('note right of C #yellow : Hello yellow');
  });
});

global.window = prevWindow;
global.document = prevDocument;
