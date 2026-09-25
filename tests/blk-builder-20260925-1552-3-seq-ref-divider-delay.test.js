'use strict';
// BLK-builder-20260925-1552-3: ふつうの sequence 図 (参加者・メッセージに class が付く SVG) で、
// ref over の箱・== 区切り ==・... 遅延 ... に選択枠が 1 つも出ていなかった (手続きの図だけが見分けていた)。
// 直し方: 描かれた形 (見出しの五角形が角に付いた rect・rect を突き抜ける横線・枠の無い 1 行の文字) から
// どの図でも見分け、書かれた行を指す枠 (source-line) を置く。枠はライフラインより手前に置く。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

if (!global.window) {
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>',
    { url: 'http://localhost/' });
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
function load() {
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/' + NAME + '.svg'), 'utf8');
  var dslText = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/' + NAME + '.puml'), 'utf8').replace(/\r\n/g, '\n');
  var div = document.createElement('div');
  div.innerHTML = svgText;
  return { svgEl: div.querySelector('svg'), parsed: seq.parseSequence(dslText), dsl: dslText };
}
function build(f) {
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  var res = overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl, f.dsl);
  return { overlayEl: overlayEl, res: res };
}
function srcRects(overlayEl, kind) {
  return Array.prototype.slice.call(overlayEl.querySelectorAll('rect[data-type="source-line"][data-src-kind="' + kind + '"]'));
}
function lines(list) { return list.map(function(r) { return Number(r.getAttribute('data-line')); }); }
function num(r, a) { return parseFloat(r.getAttribute(a)); }
function textAt(svgEl, s) {
  var t = Array.prototype.find.call(svgEl.querySelectorAll('text'), function(n) { return (n.textContent || '').trim() === s; });
  return t ? { x: parseFloat(t.getAttribute('x')), y: parseFloat(t.getAttribute('y')) } : null;
}
function covers(r, p) {
  return p && p.x >= num(r, 'x') && p.x <= num(r, 'x') + num(r, 'width') &&
    p.y - 4 >= num(r, 'y') && p.y - 4 <= num(r, 'y') + num(r, 'height');
}

describe('BLK-builder-20260925-1552-3: ふつうの sequence 図の ref / 区切り / 遅延', function() {
  test('この SVG は参加者・メッセージの class を持つ (手続きの図ではない)', function() {
    var f = load();
    expect(f.svgEl.querySelector('g.participant-head')).not.toBe(null);
    expect(f.svgEl.querySelector('g.message')).not.toBe(null);
  });

  test('ref over の 2 つ (1 行・複数行) にその行を指す枠が出て、箱の文字を覆う', function() {
    var f = load();
    var b = build(f);
    var refs = srcRects(b.overlayEl, 'ref');
    expect(lines(refs)).toEqual([6, 14]);
    expect(covers(refs[0], textAt(f.svgEl, '初期化シーケンス(別図参照)'))).toBe(true);
    expect(covers(refs[1], textAt(f.svgEl, '複数行の'))).toBe(true);
  });

  test('区切り 2 つに枠が出る (<b> の飾りのある見出しも)。見出しの文字を覆う', function() {
    var f = load();
    var b = build(f);
    var dv = srcRects(b.overlayEl, 'divider');
    expect(lines(dv)).toEqual([4, 18]);
    expect(covers(dv[0], textAt(f.svgEl, '初期化フェーズ'))).toBe(true);
  });

  test('遅延 (~~ の飾りで語が分かれて描かれる) に枠が出て、文字を覆う', function() {
    var f = load();
    var b = build(f);
    var dl = srcRects(b.overlayEl, 'delay');
    expect(lines(dl)).toEqual([8]);
    expect(covers(dl[0], textAt(f.svgEl, 'Some'))).toBe(true);
  });

  test('ref・区切り・遅延の枠はライフラインより手前 (後) に置かれる', function() {
    var f = load();
    var b = build(f);
    var all = Array.prototype.slice.call(b.overlayEl.children);
    var lastLifeline = -1;
    all.forEach(function(el, i) { if (el.getAttribute('data-type') === 'lifeline') lastLifeline = i; });
    var firstSrc = all.findIndex(function(el) { return el.getAttribute('data-type') === 'source-line'; });
    expect(lastLifeline).toBeGreaterThan(-1);
    expect(firstSrc).toBeGreaterThan(lastLifeline);
  });

  test('alt の枠は今までどおり alt の行を指し、ref の枠と取り違えない', function() {
    var f = load();
    var b = build(f);
    var groups = Array.prototype.slice.call(b.overlayEl.querySelectorAll('rect[data-type="group"]'));
    expect(lines(groups)).toEqual([9]);
    expect(b.res.unmatched.group).toBe(0);
    expect(b.res.unmatched.message).toBe(0);
    expect(b.res.unmatched.note).toBe(0);
  });
});
