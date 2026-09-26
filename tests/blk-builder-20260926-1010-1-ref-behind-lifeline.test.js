'use strict';
// BLK-builder-20260926-1010-1: web の実物 (puml-themes sequence-ex) の `ref over Foo4, Foo5` は塗りの無い箱 (fill="none") で、
// 中を通る Foo4・Foo5 のライフラインが透けて見える。ref の枠を箱全体でライフラインより手前に置いていたため、
// 箱の中のライフラインを指すと ref の枠が出た (ライフラインが選べない)。描いた側の塗りで決める:
// 塗りの無い箱は群と同じく箱全体を奥に、札・枠線だけを手前に。塗りのある箱 (skinparam で塗る) は今までどおり箱全体を手前。
var fs = require('fs');
var path = require('path');
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
  'sequence-autonumber',
].forEach(function(m) {
  try { delete require.cache[require.resolve('../src/core/' + m + '.js')]; } catch (e) {}
  try { require('../src/core/' + m + '.js'); } catch (e) {}
});
try { delete require.cache[require.resolve('../src/modules/sequence.js')]; } catch (e) {}
require('../src/modules/sequence.js');
try { delete require.cache[require.resolve('../src/ui/sequence-overlay.js')]; } catch (e) {}
require('../src/ui/sequence-overlay.js');

var window = global.window;
var seq = window.MA.modules.plantumlSequence;
var overlay = window.MA.sequenceOverlay;

var NAME = 'seq-ref-divider-delay';
function load(paint) {
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/' + NAME + '.svg'), 'utf8');
  if (paint) {
    // ref の箱 (見出しの五角形が角に付いた塗りなしの rect) を skinparam で塗った形にする
    svgText = svgText.replace(/<rect fill="none"([^>]*?)x="27"/g, '<rect fill="#FFFFFF"$1x="27"');
  }
  var dslText = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/' + NAME + '.puml'), 'utf8').replace(/\r\n/g, '\n');
  var div = document.createElement('div');
  div.innerHTML = svgText;
  return { svgEl: div.querySelector('svg'), parsed: seq.parseSequence(dslText), dsl: dslText };
}
function build(f) {
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl, f.dsl);
  return Array.prototype.slice.call(overlayEl.children);
}
function lastIndexOf(all, type) {
  var last = -1;
  all.forEach(function(el, i) { if (el.getAttribute('data-type') === type) last = i; });
  return last;
}
function refBoxes(all) {
  return all.filter(function(el) { return el.getAttribute('data-src-kind') === 'ref' && el.tagName.toLowerCase() === 'rect'; });
}

describe('BLK-builder-20260926-1010-1: 塗りの無い ref の箱はライフラインより奥', function() {
  test('塗りの無い箱: 箱全体の枠はライフラインより前 (奥) に置かれ、同じ行を指す', function() {
    var all = build(load(false));
    var boxes = refBoxes(all);
    expect(boxes.map(function(r) { return Number(r.getAttribute('data-line')); })).toEqual([6, 14]);
    var firstLifeline = all.findIndex(function(el) { return el.getAttribute('data-type') === 'lifeline'; });
    var lastLifeline = lastIndexOf(all, 'lifeline');
    boxes.forEach(function(r) { expect(all.indexOf(r)).toBeLessThan(lastLifeline); });
    expect(firstLifeline).toBeGreaterThan(-1);
  });

  test('塗りの無い箱: 札と見出しの行・左右と下の枠線はライフラインより手前の当たりで、箱と同じ行・同じ id', function() {
    var all = build(load(false));
    var lastLifeline = lastIndexOf(all, 'lifeline');
    var fronts = all.filter(function(el) { return el.getAttribute('data-src-kind') === 'ref' && el.tagName.toLowerCase() === 'path'; });
    var parts = fronts.filter(function(el) { return el.getAttribute('data-line') === '6'; })
      .map(function(el) { return el.getAttribute('data-hit-part'); });
    expect(parts).toEqual(['head', 'edge', 'edge', 'edge']);
    fronts.forEach(function(el) {
      expect(all.indexOf(el)).toBeGreaterThan(lastLifeline);
      expect(el.getAttribute('data-type')).toBe('source-line');
      expect(el.getAttribute('data-id')).toBe('src:ref@' + el.getAttribute('data-line'));
    });
  });

  test('塗りのある箱: これまでどおり箱全体の枠をライフラインより手前に置き、札だけの当たりは作らない', function() {
    var all = build(load(true));
    var lastLifeline = lastIndexOf(all, 'lifeline');
    var boxes = refBoxes(all);
    expect(boxes.length).toBe(2);
    boxes.forEach(function(r) { expect(all.indexOf(r)).toBeGreaterThan(lastLifeline); });
    expect(all.filter(function(el) { return el.getAttribute('data-src-kind') === 'ref' && el.tagName.toLowerCase() === 'path'; }).length).toBe(0);
  });
});
