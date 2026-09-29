'use strict';
// BLK-migrator-20260924-0012: web の実物 (puml-themes の usecase-ex / ex2 / with-actorstyle-ex) で、
// ユースケース図の要素にホバーしても枠がほとんど出なかった。
//   - パッケージの中の要素は `Restaurant.UC1` の修飾名で描かれ、完全一致で引いていたので当たらない
//   - `:User: --> (Use)` / `"Use the application" as (Use)` の略記だけの図はシーケンス図と判定された
//   - パーサが読めない要素・線・題・凡例には枠が 1 つも出なかった
// PlantUML が SVG に残す要素情報 (data-qualified-name / data-source-line) で当てる。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;

var depPaths = [
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/core/relation-options.js',
  '../src/core/group-notation.js',
  '../src/modules/usecase.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var W = global.window;
var uc = W.MA.modules.plantumlUsecase;
var PU = W.MA.parserUtils;

function svgOf(inner) {
  var div = document.createElement('div');
  div.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
  return div.querySelector('svg');
}
function rectsOf(out, type) {
  return Array.prototype.slice.call(out.querySelectorAll('rect[data-type="' + type + '"]'));
}

describe('ユースケースの略記だけの図もユースケース図と判定する', function() {
  test('`:User: --> (Use)` / `as (Use)` / skinparam actorStyle の図', function() {
    var dsl = ['@startuml', 'skinparam actorStyle awesome', ':User: --> (Use)',
      '"Main Admin" as Admin', '"Use the application" as (Use)',
      'Admin --> (Admin the application)', '@enduml'].join('\n');
    expect(PU.detectDiagramType(dsl)).toBe('plantuml-usecase');
    expect(PU.detectDiagramType(['@startuml', 'A --> (Use)', '@enduml'].join('\n'))).toBe('plantuml-usecase');
  });

  test('メッセージ文の中の括弧ではシーケンス図のまま', function() {
    var dsl = ['@startuml', 'participant A', 'participant B', 'A -> B : call (x)', 'B --> A : ok (200)', '@enduml'].join('\n');
    expect(PU.detectDiagramType(dsl)).toBe('plantuml-sequence');
    expect(PU.detectDiagramType(['@startuml', 'A -> B : read (all)', '@enduml'].join('\n'))).toBe('plantuml-sequence');
  });
});

// usecase-ex2 の形 (座標は簡略)。data-source-line は 0 始まり (PlantUML の出力どおり)。
var DSL = [
  '@startuml',                         // 1
  'title Usecase Diagram 2',           // 2
  'actor Guest as g',                  // 3
  'package Professional {',            // 4
  '  actor "Food Critic" as fc',       // 5
  '}',                                 // 6
  'rectangle Restaurant {',            // 7
  '  usecase "Eat Food" as UC1',       // 8
  '  usecase "Review" as UC4',         // 9
  '}',                                 // 10
  'fc --> UC4',                        // 11
  'g --> UC1',                         // 12
  'legend',                            // 13
  'note',                              // 14
  'endlegend',                         // 15
  '@enduml',                           // 16
].join('\n');
var SVG = '<g class="title" data-source-line="1"><text x="100" y="20" font-size="14" textLength="120">Usecase Diagram 2</text></g>' +
  '<g class="cluster" data-qualified-name="Professional" data-source-line="3" id="ent0003"><rect x="10" y="40" width="100" height="200"/><text x="20" y="55" textLength="60">Professional</text></g>' +
  '<g class="cluster" data-qualified-name="Restaurant" data-source-line="6" id="ent0006"><rect x="150" y="40" width="150" height="200"/><text x="160" y="55" textLength="60">Restaurant</text></g>' +
  '<g class="entity" data-qualified-name="Professional.fc" data-source-line="4" id="ent0005"><ellipse cx="60" cy="100" rx="8" ry="8"/><text x="30" y="150" textLength="60">Food Critic</text></g>' +
  '<g class="entity" data-qualified-name="Restaurant.UC1" data-source-line="7" id="ent0007"><ellipse cx="225" cy="90" rx="50" ry="18"/><text x="195" y="95" textLength="60">Eat Food</text></g>' +
  '<g class="entity" data-qualified-name="Restaurant.UC4" data-source-line="8" id="ent0010"><ellipse cx="225" cy="190" rx="50" ry="18"/><text x="200" y="195" textLength="50">Review</text></g>' +
  '<g class="entity" data-qualified-name="g" data-source-line="2" id="ent0002"><ellipse cx="60" cy="300" rx="8" ry="8"/><text x="45" y="350" textLength="40">Guest</text></g>' +
  '<g class="link" data-source-line="10" id="lnk1"><path d="M70,120 L175,190" fill="none"/><polygon points="175,190 165,185 168,195"/></g>' +
  '<g class="link" data-source-line="11" id="lnk2"><path d="M70,300 L175,90" fill="none"/><polygon points="175,90 165,95 170,100"/></g>' +
  '<g class="legend" data-source-line="12"><rect x="100" y="400" width="80" height="30"/><text x="110" y="420" textLength="30">note</text></g>';

function build() {
  var out = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  uc.buildOverlay(svgOf(SVG), uc.parse(DSL), out);
  return out;
}

describe('ユースケース図の枠を SVG の要素情報で当てる', function() {
  test('パッケージの中の要素 (修飾名 Restaurant.UC1 / Professional.fc) にも本人の枠が出る', function() {
    var out = build();
    var byId = {};
    rectsOf(out, 'usecase').concat(rectsOf(out, 'actor')).forEach(function(r) { byId[r.getAttribute('data-id')] = r; });
    expect(byId.UC1).toBeTruthy();
    expect(byId.UC4).toBeTruthy();
    expect(byId.fc).toBeTruthy();
    expect(byId.UC1.getAttribute('data-line')).toBe('8');
    // Eat Food の枠は Eat Food の楕円 (y≈72..108) に重なり、Review (y≈172..) には重ならない
    var y = parseFloat(byId.UC1.getAttribute('y'));
    var h = parseFloat(byId.UC1.getAttribute('height'));
    expect(y).toBeLessThan(80);
    expect(y + h).toBeLessThan(160);
  });

  test('入れ物は開始行で当たる', function() {
    var out = build();
    var pk = rectsOf(out, 'package').map(function(r) { return r.getAttribute('data-line'); }).sort();
    expect(pk).toEqual(['4', '7']);
  });

  test('パーサが読めない要素・題・凡例にも、書かれた行を指す枠が出る', function() {
    var out = build();
    var lines = rectsOf(out, 'source-line').map(function(r) { return r.getAttribute('data-src-kind') + '@' + r.getAttribute('data-line'); });
    expect(lines).toContain('title@2');
    expect(lines).toContain('legend@13');
    // `actor Guest as g` をフォームが読めなくても、描かれた Guest には枠が出る
    var guest = out.querySelector('rect[data-src-name="g"]') || out.querySelector('rect[data-type="actor"][data-id="g"]');
    expect(guest).not.toBeNull();
  });

  test('線は書かれた行で当たる', function() {
    var out = build();
    var rl = rectsOf(out, 'relation').map(function(r) { return r.getAttribute('data-line'); });
    expect(rl).toContain('11');
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
});
