'use strict';
// BLK-owner-20260930-0711-1: クラス図・コンポーネント図・ユースケース図の境界 (package / rectangle) の中を通る関係は、
// 線・矢じり・ラベルで関係そのものが当たる。境界が当たるのは中の空所・4 辺の枠線・見出しの札だけ
// (状態遷移図の複合状態・アクティビティ図の partition と同じ入れ物の当て方。決める所は overlay-builder の addContainer 1 か所)。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
var depPaths = [
  '../src/core/dsl-utils.js', '../src/core/regex-parts.js', '../src/core/id-normalizer.js',
  '../src/core/line-resolver.js', '../src/core/text-updater.js',
  '../src/core/dsl-updater.js', '../src/core/parser-utils.js',
  '../src/core/props-renderer.js', '../src/core/overlay-builder.js',
  '../src/core/relation-options.js', '../src/core/group-notation.js', '../src/modules/class.js', '../src/modules/component.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var OB = global.window.MA.overlayBuilder;
var clMod = global.window.MA.modules.plantumlClass;
var coMod = global.window.MA.modules.plantumlComponent;

function build(mod, dsl, svgInner) {
  document.body.innerHTML = '<svg id="src" xmlns="http://www.w3.org/2000/svg">' + svgInner +
    '</svg><svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
  var ov = document.getElementById('ov');
  mod.buildOverlay(document.getElementById('src'), mod.parse(dsl), ov);
  return ov;
}
function ent(qn, line, x, y) {
  return '<g class="entity" data-qualified-name="' + qn + '" data-source-line="' + line + '">' +
    '<rect x="' + x + '" y="' + y + '" width="60" height="30"/><text x="' + (x + 5) + '" y="' + (y + 20) + '" textLength="40">' + qn + '</text></g>';
}
// 境界 (0,0)-(300,240)。見出しの札「Mcal」は左上。中に A (y=40) と B (y=170) を縦に置き、
// A → B の関係の線は x=50 を y=70→170、ラベル「uses」は線の右 (x=56, y=125)。
function svgOf(entA, entB, lineNo) {
  return '<g class="cluster" data-qualified-name="Mcal" data-source-line="1">' +
      '<rect x="0" y="0" width="300" height="240"/><text x="10" y="16" textLength="36">Mcal</text></g>' +
    ent(entA, 2, 20, 40) + ent(entB, 3, 20, 170) +
    '<g class="link" data-source-line="' + lineNo + '"><path d="M50,70 L50,165"/>' +
      '<polygon points="50,170 46,162 54,162 50,170"/><text x="56" y="125" textLength="28">uses</text></g>';
}
function hit(ov, x, y) {
  var r = OB.hitTestTopmost(ov, x, y);
  return r ? r.getAttribute('data-type') : null;
}

var cases = [
  { name: 'component', mod: function() { return coMod; }, rel: 'relation',
    dsl: ['@startuml', 'package Mcal {', '  [Spi]', '  [Dio]', '}', '[Spi] --> [Dio] : uses', '@enduml'].join('\n'),
    svg: svgOf('Mcal.Spi', 'Mcal.Dio', 5) },
  { name: 'class', mod: function() { return clMod; }, rel: 'relation',
    dsl: ['@startuml', 'package Mcal {', '  class Spi', '  class Dio', '  Spi --> Dio : uses', '}', '@enduml'].join('\n'),
    svg: svgOf('Mcal.Spi', 'Mcal.Dio', 4) },
];

cases.forEach(function(c) {
  describe(c.name + ': 境界の中を通る関係は本人、境界は空所・枠線・見出しで当たる', function() {
    test('関係のラベル・線の中ほど・矢じりは関係', function() {
      var ov = build(c.mod(), c.dsl, c.svg);
      expect(hit(ov, 66, 120)).toBe(c.rel);   // ラベル「uses」
      expect(hit(ov, 50, 110)).toBe(c.rel);   // 線の中ほど
      expect(hit(ov, 50, 166)).toBe(c.rel);   // 矢じり
    });
    test('中の空所・右の枠線・見出しの札は境界', function() {
      var ov = build(c.mod(), c.dsl, c.svg);
      expect(hit(ov, 220, 120)).toBe('package');  // 空所
      expect(hit(ov, 300, 120)).toBe('package');  // 右の枠線の上
      expect(hit(ov, 25, 10)).toBe('package');    // 見出しの札「Mcal」
    });
    test('中の部品は部品本人', function() {
      var ov = build(c.mod(), c.dsl, c.svg);
      var t = hit(ov, 50, 50);
      expect(t).not.toBe('package');
      expect(t).not.toBe(null);
    });
  });
});

describe('addContainer: 入れ物の当たりの形', function() {
  test('中の空所 1 つ (container) と、4 辺の帯・見出しの札 (framebelt) を同じ data-type / data-id で置く', function() {
    document.body.innerHTML = '<svg id="src" xmlns="http://www.w3.org/2000/svg"><g id="g"><rect x="0" y="0" width="100" height="80"/>' +
      '<text x="5" y="14" textLength="20">P</text></g></svg><svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
    var ov = document.getElementById('ov');
    var main = OB.addContainer(ov, 0, 0, 100, 80, { 'data-type': 'package', 'data-id': 'P', 'data-line': '2' }, document.getElementById('g'));
    expect(main.getAttribute('data-hit-kind')).toBe('container');
    var all = ov.querySelectorAll('rect[data-type="package"][data-id="P"]');
    expect(all.length).toBe(6);
    expect(ov.querySelectorAll('rect[data-hit-kind="framebelt"]').length).toBe(5);
    Array.prototype.forEach.call(all, function(r) { expect(r.getAttribute('data-line')).toBe('2'); });
  });
  test('並べ替えると帯は関係の線・ラベルより手前、部品より後ろ、空所は関係の線より後ろ', function() {
    document.body.innerHTML = '<svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
    var ov = document.getElementById('ov');
    OB.addRect(ov, 90, 30, 20, 20, { 'data-type': 'component', 'data-id': 'Port' });          // 辺の上の部品
    OB.addRect(ov, 0, 38, 200, 4, { 'data-type': 'relation', 'data-id': 'r', 'data-hit-kind': 'linkline' }); // 辺を横切る線
    OB.addContainer(ov, 0, 0, 100, 80, { 'data-type': 'package', 'data-id': 'P' }, null);
    OB.raiseSmallestLast(ov);
    expect(OB.hitTestTopmost(ov, 100, 40).getAttribute('data-type')).toBe('component'); // 部品 > 帯
    expect(OB.hitTestTopmost(ov, 100, 39).getAttribute('data-type')).toBe('component');
    expect(OB.hitTestTopmost(ov, 101, 60).getAttribute('data-type')).toBe('package');   // 帯
    expect(OB.hitTestTopmost(ov, 150, 40).getAttribute('data-type')).toBe('relation');  // 境界の外の線
    expect(OB.hitTestTopmost(ov, 50, 40).getAttribute('data-type')).toBe('relation');   // 空所の上の線 > 空所
    expect(OB.hitTestTopmost(ov, 50, 60).getAttribute('data-type')).toBe('package');    // 空所
  });
});

describe('litRects: 境界の帯・札を指したら境界全体の枠を光らせる', function() {
  test('framebelt は同じ境界の container 1 つに畳む', function() {
    document.body.innerHTML = '<svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
    var ov = document.getElementById('ov');
    var main = OB.addContainer(ov, 0, 0, 100, 80, { 'data-type': 'package', 'data-id': 'P', 'data-line': '2' }, null);
    OB.addContainer(ov, 200, 0, 100, 80, { 'data-type': 'package', 'data-id': 'Q', 'data-line': '6' }, null);
    var belts = Array.prototype.filter.call(ov.querySelectorAll('rect[data-hit-kind="framebelt"]'), function(r) {
      return r.getAttribute('data-id') === 'P';
    });
    expect(belts.length).toBe(4);
    var lit = OB.litRects(ov, belts.concat([main]));
    expect(lit.length).toBe(1);
    expect(lit[0]).toBe(main);
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
