'use strict';
// BLK-migrator-20260924-1332: C4_Sequence の手続き (Person / Component / Rel …) で書いた sequence 図に
// alt / loop / ref over / == 区切り == / ... 遅延 ... が混ざると、選択枠がほぼ全滅していた (4/25)。
// 矢じりの付いた横線を「本数が一致したときだけ」上から順に当てていたため、斜めの線 ($rel="->(39)") や
// 枠の線が 1 本でも混ざると全部を諦めていた。
// 直し方: 枠 (見出しの五角形が角に付いた rect)・区切り・遅延を先に見分けてその文字を除き、
// 残りの矢印は線の上の文字とメッセージの文言の一致で当てる (本数の一致に頼らない)。
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

var NAME = 'c4-sequence-frames';
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
function rects(overlayEl, type) {
  return Array.prototype.slice.call(overlayEl.querySelectorAll('rect[data-type="' + type + '"]:not([data-front])'));
}
function lines(list) { return list.map(function(r) { return Number(r.getAttribute('data-line')); }); }
function num(r, a) { return parseFloat(r.getAttribute(a)); }
function textY(svgEl, s) {
  var t = Array.prototype.find.call(svgEl.querySelectorAll('text'), function(n) { return (n.textContent || '').trim() === s; });
  return t ? parseFloat(t.getAttribute('y')) : NaN;
}

var MSG_LINES = [88, 91, 94, 100, 109, 110, 114, 115, 119];

describe('BLK-migrator-20260924-1332: C4 手続きの sequence に枠・区切り・遅延が混ざる図', function() {
  test('この SVG は参加者・メッセージの class を持たない (手続きの図の当て方に入る)', function() {
    var f = load();
    expect(f.svgEl.querySelector('g.participant-head')).toBe(null);
    expect(f.svgEl.querySelector('g.message')).toBe(null);
    expect(f.parsed.relations.length).toBe(9);
  });

  test('メッセージ 9 本すべてに本人の枠が出て、取り残しが無い (斜めの線 ->(39) も含む)', function() {
    var f = load();
    var b = build(f);
    expect(lines(rects(b.overlayEl, 'message')).sort(function(a, c) { return a - c; })).toEqual(MSG_LINES);
    expect(b.res.unmatched.message).toBe(0);
  });

  test('参加者 3 (Alice・囲み System・Bob) に枠。囲みは名札の帯だけで Bob の頭にかぶらない', function() {
    var f = load();
    var b = build(f);
    var ps = rects(b.overlayEl, 'participant');
    var byId = {};
    ps.forEach(function(r) { byId[r.getAttribute('data-id')] = r; });
    expect(Object.keys(byId).sort()).toEqual(['Alice', 'Bob', 'system']);
    expect(b.res.unmatched.participant).toBe(0);
    var sys = byId.system, bob = byId.Bob;
    expect(num(sys, 'y') + num(sys, 'height')).toBeLessThan(num(bob, 'y') + 4);
    // Bob は説明と絵の付いた背の高い箱 (120px を超える) でも箱ごと当たる
    expect(num(bob, 'height')).toBeGreaterThan(120);
  });

  test('alt の見出しの条件 [successful case] はメッセージの枠に含めない', function() {
    var f = load();
    var b = build(f);
    var m91 = rects(b.overlayEl, 'message').filter(function(r) { return r.getAttribute('data-line') === '91'; })[0];
    var condY = textY(f.svgEl, '[successful case]');
    expect(isNaN(condY)).toBe(false);
    expect(num(m91, 'y')).toBeGreaterThan(condY);
  });

  test('ref の中の文字 (init) は直後のメッセージ (hello) の枠に含めない', function() {
    var f = load();
    var b = build(f);
    var m100 = rects(b.overlayEl, 'message').filter(function(r) { return r.getAttribute('data-line') === '100'; })[0];
    var initY = textY(f.svgEl, 'init');
    expect(isNaN(initY)).toBe(false);
    expect(num(m100, 'y')).toBeGreaterThan(initY);
  });

  test('alt / loop は群の枠、ref・区切り・遅延は書かれた行を指す枠 (source-line)', function() {
    var f = load();
    var b = build(f);
    expect(lines(rects(b.overlayEl, 'group'))).toEqual([90, 93]);
    var src = rects(b.overlayEl, 'source-line');
    var kinds = {};
    src.forEach(function(r) { kinds[r.getAttribute('data-line')] = r.getAttribute('data-src-kind'); });
    expect(kinds).toEqual({ 98: 'ref', 102: 'ref', 107: 'divider', 112: 'divider', 117: 'delay' });
  });

  test('パーサがメッセージを 1 本読み落としても、残りは文言で本人の線に当たり 1 本ずつずれない', function() {
    var f = load();
    f.parsed.relations = f.parsed.relations.filter(function(r) { return r.line !== 100; });
    var b = build(f);
    var got = lines(rects(b.overlayEl, 'message')).sort(function(a, c) { return a - c; });
    expect(got).toEqual(MSG_LINES.filter(function(l) { return l !== 100; }));
    // hello の線 (4: hello) は誰にも取られない
    var helloY = textY(f.svgEl, 'hello');
    rects(b.overlayEl, 'message').forEach(function(r) {
      var top = num(r, 'y'), bottom = top + num(r, 'height');
      expect(helloY >= top && helloY <= bottom).toBe(false);
    });
  });

  test('文言が 1 つも合わなくても、本数が同じなら上から順に当てる (これまでの当て方を保つ)', function() {
    var f = load();
    f.parsed.relations.forEach(function(r) { r.label = 'zz'; });
    var b = build(f);
    expect(lines(rects(b.overlayEl, 'message')).sort(function(a, c) { return a - c; })).toEqual(MSG_LINES);
  });
});

// 2012 と同じく、使い終わったら require キャッシュを落とす (後から自前の window を作る
// sequence-overlay.test.js が window.MA.* を登録し直せるように)。
[
  'core/html-utils', 'core/dsl-utils', 'core/note-edit', 'core/regex-parts',
  'core/id-normalizer', 'core/dsl-updater', 'core/text-updater', 'core/parser-utils',
  'core/line-resolver', 'core/overlay-builder', 'core/selection-router',
  'core/sequence-participant-zone', 'core/sequence-autonumber', 'modules/sequence', 'ui/sequence-overlay',
].forEach(function(m) {
  try { delete require.cache[require.resolve('../src/' + m + '.js')]; } catch (e) {}
});
