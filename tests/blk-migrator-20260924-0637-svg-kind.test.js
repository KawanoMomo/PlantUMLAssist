'use strict';
// BLK-migrator-20260924-0637: AWS アイコンの手続き (`WorkDocs(...)` / `SimpleStorageService(...)`) で部品を宣言した図は、
// DSL に見えるのが `actor` と `-->` だけなのでシーケンス図と読まれ、選択枠が 1 つも出なかった (0/21、「⚠ Overlay マッチング失敗」)。
// 手続きの中身は展開せず、PlantUML が SVG に残した図種 (<svg data-diagram-type>) に合わせる (src/core/svg-kind.js)。
// あわせて、行き先の図形の枠に食い込む矢じりの上では関係が選ばれるようにした (overlay-builder の linkhead)。
// fixtures/svg/aws-helloworld.svg は fixtures/dsl/aws-helloworld.puml (web の実物) を同梱の plantuml.jar で描いたもの。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

var _prevWindow = global.window;
var _prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;

var MODS = [
  '../src/core/html-utils.js', '../src/core/dsl-utils.js', '../src/core/regex-parts.js', '../src/core/id-normalizer.js',
  '../src/core/line-resolver.js', '../src/core/text-updater.js', '../src/core/dsl-updater.js', '../src/core/parser-utils.js',
  '../src/core/props-renderer.js', '../src/core/overlay-builder.js', '../src/core/relation-options.js',
  '../src/core/group-notation.js', '../src/core/svg-kind.js', '../src/modules/component.js',
];
MODS.forEach(function(m) { try { delete require.cache[require.resolve(m)]; } catch (e) {} });
MODS.forEach(function(m) { require(m); });

var SK = window.MA.svgKind;
var PU = window.MA.parserUtils;
var OB = window.MA.overlayBuilder;
var CO = window.MA.modules.plantumlComponent;

var SVG_TEXT = fs.readFileSync(path.join(__dirname, 'fixtures/svg/aws-helloworld.svg'), 'utf8');
var DSL = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/aws-helloworld.puml'), 'utf8').replace(/\r\n/g, '\n');

function load() {
  var div = document.createElement('div');
  div.innerHTML = SVG_TEXT.replace(/^<\?plantuml[^>]*\?>/, '');
  document.body.innerHTML = '';
  document.body.appendChild(div);
  var svgEl = div.querySelector('svg');
  var ov = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.appendChild(ov);
  CO.buildOverlay(svgEl, CO.parse(DSL), ov, DSL);
  return { svgEl: svgEl, ov: ov };
}
function frames(f, kind) {
  return Array.prototype.slice.call(f.ov.querySelectorAll('rect.selectable[data-type]')).filter(function(r) {
    return !kind || r.getAttribute('data-hit-kind') === kind;
  });
}
// 後ろの子が手前 (ブラウザの pointer-events と同じ)。点を含む最後の rect。
function topAt(f, x, y) {
  var rs = Array.prototype.slice.call(f.ov.querySelectorAll('rect.selectable'));
  for (var i = rs.length - 1; i >= 0; i--) {
    var r = rs[i];
    var rx = +r.getAttribute('x'), ry = +r.getAttribute('y'), rw = +r.getAttribute('width'), rh = +r.getAttribute('height');
    if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) return r;
  }
  return null;
}

describe('BLK-migrator-20260924-0637 SVG の図種で DSL の判定を正す', function() {
  test('SVG の図種を読む (要素・文字列のどちらからでも)', function() {
    expect(SK.of(SVG_TEXT)).toBe('DESCRIPTION');
    expect(SK.of(load().svgEl)).toBe('DESCRIPTION');
    expect(SK.of('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBe('');
    expect(SK.of(null)).toBe('');
  });

  test('手続きで宣言した部品の図は、DSL だけではシーケンス図と読まれる (直す前の原因)', function() {
    expect(PU.detectDiagramType(DSL)).toBe('plantuml-sequence');
  });

  test('reconcile: 食い違えば SVG の図種、合っていれば今のまま', function() {
    expect(SK.reconcile('plantuml-sequence', 'DESCRIPTION')).toBe('plantuml-component');
    expect(SK.reconcile('plantuml-usecase', 'DESCRIPTION')).toBe('plantuml-usecase');
    expect(SK.reconcile('plantuml-component', 'DESCRIPTION')).toBe('plantuml-component');
    expect(SK.reconcile('plantuml-component', 'SEQUENCE')).toBe('plantuml-sequence');
    expect(SK.reconcile('plantuml-sequence', 'SEQUENCE')).toBe('plantuml-sequence');
    expect(SK.reconcile('plantuml-usecase', 'CLASS')).toBe('plantuml-class');
    expect(SK.reconcile(null, 'STATE')).toBe('plantuml-state');
    expect(SK.reconcile('plantuml-activity', 'ACTIVITY')).toBe('plantuml-activity');
  });

  test('reconcile: SVG が図種を言わない・このツールに無い図種なら変えない', function() {
    expect(SK.reconcile('plantuml-sequence', '')).toBe('plantuml-sequence');
    expect(SK.reconcile('plantuml-sequence', 'TIMING')).toBe('plantuml-sequence');
    expect(SK.reconcile('plantuml-class', 'MINDMAP')).toBe('plantuml-class');
  });

  test('component で読むと、actor と手続き 2 つの部品・関係 2 本に行付きの枠が出る', function() {
    var f = load();
    var byLine = {};
    frames(f).forEach(function(r) { byLine[r.getAttribute('data-line')] = true; });
    ['13', '14', '15', '17', '18'].forEach(function(l) { expect(byLine[l]).toBe(true); });
    var ids = frames(f).map(function(r) { return r.getAttribute('data-id'); });
    expect(ids.indexOf('desktopAlias')).toBeGreaterThan(-1);
    expect(ids.indexOf('storageAlias')).toBeGreaterThan(-1);
  });
});

describe('BLK-migrator-20260924-0637 矢じりの上は関係', function() {
  test('関係 1 本につき矢じりの枠 (linkhead) を 1 つ、余白なしで置く', function() {
    var f = load();
    var heads = frames(f, 'linkhead');
    expect(heads.length).toBe(2);
    expect(+heads[0].getAttribute('width')).toBeLessThan(10);
    expect(+heads[0].getAttribute('height')).toBeLessThan(11);
  });

  test('矢じりの中心を指すと、行き先の部品ではなくその関係が一番手前', function() {
    var f = load();
    frames(f, 'linkhead').forEach(function(h) {
      var cx = +h.getAttribute('x') + +h.getAttribute('width') / 2;
      var cy = +h.getAttribute('y') + +h.getAttribute('height') / 2;
      var top = topAt(f, cx, cy);
      expect(top.getAttribute('data-type')).toBe('relation');
      expect(top.getAttribute('data-line')).toBe(h.getAttribute('data-line'));
    });
  });

  test('部品の中心は今までどおり部品 (矢じりの枠は矢じりの外へ広げない)', function() {
    var f = load();
    ['desktopAlias', 'storageAlias'].forEach(function(id) {
      var r = frames(f).filter(function(x) { return x.getAttribute('data-id') === id; })[0];
      var top = topAt(f, +r.getAttribute('x') + +r.getAttribute('width') / 2, +r.getAttribute('y') + +r.getAttribute('height') / 2);
      expect(top.getAttribute('data-id')).toBe(id);
    });
  });

  test('raiseSmallestLast: 入れ物 < 関係 < 要素 < 矢じり の順に手前', function() {
    var ov = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    OB.addRect(ov, 0, 0, 5, 5, { 'data-type': 'relation', 'data-id': 'h', 'data-hit-kind': 'linkhead' });
    OB.addRect(ov, 0, 0, 50, 50, { 'data-type': 'component', 'data-id': 'e' });
    OB.addRect(ov, 0, 0, 10, 80, { 'data-type': 'relation', 'data-id': 'l', 'data-hit-kind': 'link' });
    OB.addRect(ov, 0, 0, 300, 300, { 'data-type': 'package', 'data-id': 'c', 'data-hit-kind': 'container' });
    OB.raiseSmallestLast(ov);
    var order = Array.prototype.map.call(ov.querySelectorAll('rect.selectable'), function(r) { return r.getAttribute('data-id'); });
    expect(order).toEqual(['c', 'l', 'e', 'h']);
  });
});

global.window = _prevWindow;
global.document = _prevDocument;
MODS.forEach(function(m) { try { delete require.cache[require.resolve(m)]; } catch (e) {} });
