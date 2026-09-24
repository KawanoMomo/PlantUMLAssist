'use strict';
// BLK-owner-20260924-0637-2: alt / loop の枠は、左上の札・条件の文字・枠線のどれを押しても枠が選ばれる。
// 枠全体の rect はライフラインの当たりの下にあり、札を押すとライフライン選択や帯の挿入に吸われていた。
// PlantUML が残した札の五角形 (枠の左上角から始まる path) の高さで見出しの行を取り、枠線と条件の文字と
// 合わせて一番手前の当たり (<path>) にする。枠を数える rect は 1 枠 1 つのまま。
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
// overlay-builder の addRect は document を使う。単独で走らせたときだけ補う。
var _ownDoc = !global.document;
if (_ownDoc) global.document = doc;
var OB = W.MA.overlayBuilder;
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


var DSL = [
  '@startuml',      // 1
  'participant A',  // 2
  'participant B',  // 3
  'alt 成功',       // 4
  'A -> B : x',     // 5
  'else 失敗',      // 6
  'B --> A : y',    // 7
  'end',            // 8
  '@enduml',
].join(String.fromCharCode(10));
// 実物 (PlantUML 1.2026) の形: 枠の rect が 2 回、札の五角形、条件の文字。
var SVG = '<rect x="10" y="84.9609" width="136.4141" height="125.2422" fill="none" style="stroke:#000000;stroke-width:1.5;"/>' +
  '<path d="M10,84.9609 L70.1709,84.9609 L70.1709,93.3125 L60.1709,103.3125 L10,103.3125 L10,84.9609" fill="#EEEEEE" style="stroke:#000000;stroke-width:1.5;"/>' +
  '<text x="25" y="99.4561" fill="#000000">alt</text>' +
  '<text x="85.1709" y="98.3799" fill="#000000">[成功]</text>' +
  '<text x="15" y="176.4346" fill="#000000">[失敗]</text>' +
  '<rect x="10" y="84.9609" width="136.4141" height="125.2422" fill="none" style="stroke:#000000;stroke-width:1.5;"/>';

function hitsOf() {
  var out = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.buildSequenceOverlay(svgOf(SVG), seq.parseSequence(DSL), out, DSL);
  return out;
}

function boxOfPath(p) {
  var n = (p.getAttribute('d').match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  // M x,y h w v h h -w Z
  return { x: n[0], y: n[1], w: n[2], h: n[3] };
}

describe('枠の札・条件の文字・枠線を押しても枠が選ばれる (BLK-owner-20260924-0637-2)', function() {
  test('枠を数える rect は 1 枠 1 つのまま、当たりは <path> で足す', function() {
    var out = hitsOf();
    expect(out.querySelectorAll('rect[data-type="group"]').length).toBe(1);
    var hits = out.querySelectorAll('path.group-hit[data-type="group"]');
    expect(hits.length).toBeGreaterThanOrEqual(4);
    Array.prototype.forEach.call(hits, function(h) {
      expect(h.getAttribute('data-line')).toBe('4');
      expect(h.getAttribute('data-id')).toBe(out.querySelector('rect[data-type="group"]').getAttribute('data-id'));
    });
  });

  test('見出しの行は札の五角形の下端 (103.3) まで、枠の幅いっぱい (札と [成功] を含む)', function() {
    var head = boxOfPath(hitsOf().querySelector('path.group-hit[data-hit-part="head"]'));
    expect(head.x).toBeLessThanOrEqual(10);
    expect(head.y).toBeLessThanOrEqual(84.9609);
    expect(Math.abs(head.y + head.h - 103.3125) < 0.01).toBe(true);
    expect(head.x + head.w).toBeGreaterThanOrEqual(146.4141);
  });

  test('左・右・下の枠線に幅 6 の当たりがある', function() {
    var edges = Array.prototype.map.call(hitsOf().querySelectorAll('path.group-hit[data-hit-part="edge"]'), boxOfPath);
    expect(edges.length).toBe(3);
    expect(edges.some(function(b) { return b.x <= 10 && b.x + b.w >= 10 && b.h > 100; })).toBe(true);
    expect(edges.some(function(b) { return b.x <= 146.4141 && b.x + b.w >= 146.4141 && b.h > 100; })).toBe(true);
    expect(edges.some(function(b) { return b.y <= 210.2031 && b.y + b.h >= 210.2031 && b.w > 100; })).toBe(true);
  });

  test('else の条件の文字 [失敗] にも当たりがある', function() {
    var conds = Array.prototype.map.call(hitsOf().querySelectorAll('path.group-hit[data-hit-part="cond"]'), boxOfPath);
    expect(conds.length).toBe(1);
    expect(conds[0].x).toBeLessThanOrEqual(15);
    expect(conds[0].y).toBeLessThan(176.4346);
    expect(conds[0].y + conds[0].h).toBeGreaterThan(170);
  });

  test('当たりは一番手前 (ライフラインの当たりより後ろの子)', function() {
    var out = hitsOf();
    var kids = Array.prototype.slice.call(out.childNodes);
    var firstHit = kids.findIndex(function(k) { return k.getAttribute && k.getAttribute('class') === 'group-hit'; });
    var lastLife = -1;
    kids.forEach(function(k, i) { if (k.getAttribute && k.getAttribute('data-type') === 'lifeline') lastLife = i; });
    expect(firstHit).toBeGreaterThan(lastLife);
  });
});

[
  'core/html-utils', 'core/dsl-utils', 'core/note-edit', 'core/regex-parts',
  'core/id-normalizer', 'core/dsl-updater', 'core/text-updater', 'core/parser-utils',
  'core/line-resolver', 'core/overlay-builder', 'core/selection-router',
  'core/sequence-participant-zone', 'modules/sequence', 'ui/sequence-overlay',
].forEach(function(m) {
  try { delete require.cache[require.resolve('../src/' + m + '.js')]; } catch (e) {}
});
if (_ownDoc) delete global.document;
