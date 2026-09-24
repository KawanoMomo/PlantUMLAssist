'use strict';
// BLK-migrator-20260923-1909: class / component / deployment 図で、継承矢印・入れ子要素・非矩形アイコンに選択枠が出ない。
// PlantUML が SVG に残す要素情報 (data-qualified-name / data-source-line) を先に使って当てる。
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
var PU = global.window.MA.parserUtils;
var clMod = global.window.MA.modules.plantumlClass;
var coMod = global.window.MA.modules.plantumlComponent;

function build(mod, dsl, svgInner) {
  document.body.innerHTML = '<svg id="src" xmlns="http://www.w3.org/2000/svg">' + svgInner +
    '</svg><svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
  mod.buildOverlay(document.getElementById('src'), mod.parse(dsl), document.getElementById('ov'));
  return Array.prototype.map.call(document.querySelectorAll('#ov rect[data-type]'), function(r) {
    return r.getAttribute('data-type') + ':' + r.getAttribute('data-id') + '@' + r.getAttribute('data-line');
  });
}
function ent(qn, line, x) {
  return '<g class="entity" data-qualified-name="' + qn + '"' + (line == null ? '' : ' data-source-line="' + line + '"') + '>' +
    '<rect x="' + x + '" y="10" width="60" height="40"/><text x="' + (x + 5) + '" y="30" textLength="40">' + qn + '</text></g>';
}
function link(line, x) {
  return '<g class="link" data-source-line="' + line + '"><path d="M' + x + ',60 L' + x + ',120"/>' +
    '<polygon points="' + x + ',120 ' + (x - 4) + ',112 ' + (x + 4) + ',112 ' + x + ',120"/></g>';
}

describe('BLK-migrator-20260923-1909 SVG の要素情報で当てる', function() {
  test('findEntityByName: 完全一致、無ければ修飾名の末尾が 1 つだけ一致するもの', function() {
    document.body.innerHTML = '<svg id="s">' + ent('My Package.First Component', 11, 0) + ent('Solo', 12, 100) +
      ent('A.Dup', 1, 200) + ent('B.Dup', 2, 300) + '</svg>';
    var s = document.getElementById('s');
    expect(OB.findEntityByName(s, 'First Component').getAttribute('data-qualified-name')).toBe('My Package.First Component');
    expect(OB.findEntityByName(s, 'Solo').getAttribute('data-qualified-name')).toBe('Solo');
    expect(OB.findEntityByName(s, 'Dup')).toBe(null);
  });

  test('matchLinksByLine: パーサが読めない線が混じっても、書かれた行で当てる', function() {
    document.body.innerHTML = '<svg id="s">' + link(15, 10) + link(16, 30) + link(18, 50) + link(20, 70) + '</svg>';
    var got = OB.matchLinksByLine(document.getElementById('s'), [{ line: 16 }, { line: 17 }, { line: 21 }]);
    expect(got.map(function(g) { return g && g.getAttribute('data-source-line'); })).toEqual(['15', '16', '20']);
  });

  test('matchLinksByLine: SVG に行が無ければ並び順で当てる (旧来の fixture)', function() {
    document.body.innerHTML = '<svg id="s"><g class="link"><path d="M0,0 L1,1"/></g><g class="link"><path d="M0,0 L1,1"/></g></svg>';
    var got = OB.matchLinksByLine(document.getElementById('s'), [{ line: 3 }, { line: 4 }]);
    expect(got.every(function(g) { return !!g; })).toBe(true);
  });

  test('matchClusters: 読めない入れ物 (cloud) があっても、開始行・名前で当てる', function() {
    document.body.innerHTML = '<svg id="s">' +
      '<g class="cluster" data-qualified-name="My Package" data-source-line="10"><rect x="0" y="0" width="10" height="10"/></g>' +
      '<g class="cluster" data-qualified-name="My Cloud" data-source-line="23"><rect x="0" y="0" width="10" height="10"/></g>' +
      '<g class="cluster" data-qualified-name="My Database.My folder" data-source-line="30"><rect x="0" y="0" width="10" height="10"/></g>' +
      '</svg>';
    var got = OB.matchClusters(document.getElementById('s'), [
      { id: 'p0', label: 'My Package', startLine: 11 }, { id: 'p1', label: 'My folder', startLine: 99 },
    ]);
    expect(got.map(function(g) { return g && g.getAttribute('data-qualified-name'); })).toEqual(['My Package', 'My Database.My folder']);
  });

  test('class: `abstract X` / `<|-` のようにパーサが読めない記法があっても、関係の枠は隣へずれない', function() {
    var dsl = ['@startuml', 'abstract class AbstractList', 'abstract AbstractCollection', 'interface List', 'interface Collection',
      'List <|-- AbstractList', 'Collection <|- List', 'AbstractList <|-- ArrayList', '@enduml'].join('\n');
    var ids = build(clMod, dsl,
      ent('AbstractList', 1, 0) + ent('AbstractCollection', 2, 100) + ent('List', 3, 200) + ent('Collection', 4, 300) +
      ent('ArrayList', 7, 400) + link(5, 20) + link(6, 120) + link(7, 220));
    var rel = ids.filter(function(s) { return s.indexOf('relation:') === 0; });
    // 関係 2 本 (5 行目 / 7 行目) は自分の行の線に。読めない 6 行目の線は行を指す枠になる
    // BLK-builder-20260925-0305-1: `<|-` (短い線) も関係として読むようになったので、6 行目の線も
    // 行を指す枠ではなく関係の枠になる (3 本とも自分の行の線)。
    expect(rel.every(function(s) { return /@6$|@7$|@8$/.test(s); })).toBe(true);
    expect(rel.some(function(s) { return /@7$/.test(s); })).toBe(true);
    expect(ids).toContain('source-line:src:AbstractCollection@3:0@3');
    expect(ids.some(function(s) { return /^source-line:src:link@7:/.test(s); })).toBe(false);
  });

  test('component: 入れ物の中の部品・読めない要素 (artifact / cloud { }) にも枠が出る', function() {
    var dsl = ['@startuml', 'title T', 'package "My Package" {', '  [First Component]', '}', 'cloud "My Cloud" {',
      '  [Example 1]', '}', 'artifact "My Artifact"', '@enduml'].join('\n');
    var ids = build(coMod, dsl,
      '<g class="title" data-source-line="1"><text x="0" y="10" textLength="20">T</text></g>' +
      '<g class="cluster" data-qualified-name="My Package" data-source-line="2"><rect x="0" y="0" width="200" height="100"/></g>' +
      '<g class="cluster" data-qualified-name="My Cloud" data-source-line="5"><path d="M300,0 L500,100"/></g>' +
      ent('My Package.First Component', 3, 10) + ent('My Cloud.Example 1', 6, 310) + ent('My Artifact', 8, 600));
    expect(ids).toContain('component:First Component@4');
    expect(ids).toContain('component:Example 1@7');
    expect(ids).toContain('package:__pkg_0@3');
    var src = ids.filter(function(s) { return s.indexOf('source-line:') === 0; }).map(function(s) { return s.split(':').slice(0, 3).join(':'); });
    expect(src).toEqual(['source-line:src:My Cloud@6', 'source-line:src:My Artifact@9', 'source-line:src:title@2']);
  });

  test('行を持たない要素 (diamond) も名前があれば枠を出し、行は付けない', function() {
    var ids = build(clMod, '@startuml\ndiamond diamond\n@enduml', ent('diamond', null, 0));
    expect(ids).toEqual(['source-line:src:diamond@?:0@null']);
  });

  test('detectDiagramType: `[部品]` と node / cloud / artifact がある図は interface / queue があっても component', function() {
    var dsl = ['@startuml', 'package "P" {', '  [A]', '  collections C1', '}', 'node "N" {', '  [B]', '}',
      'queue "Q"', 'interface "I"', '[A] --> [B]', '@enduml'].join('\n');
    expect(PU.detectDiagramType(dsl)).toBe('plantuml-component');
    // class にしか無い記法があれば class のまま
    expect(PU.detectDiagramType(dsl.replace('interface "I"', 'abstract class X'))).toBe('plantuml-class');
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
