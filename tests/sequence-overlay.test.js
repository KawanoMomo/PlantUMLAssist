'use strict';
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;

// line-resolver.test.js は自前の jsdom window を作って line-resolver を require し、
// 終了時に global.window を復元する。しかし Node の require キャッシュに残るため
// 本ファイルで require してもモジュール IIFE が再実行されず、
// 新しい jsdom window への window.MA.lineResolver 登録が起きない。
// キャッシュを明示的に落として現在の window に再登録させる。
delete require.cache[require.resolve('../src/core/line-resolver.js')];
delete require.cache[require.resolve('../src/core/overlay-builder.js')];
delete require.cache[require.resolve('../src/core/selection-router.js')];

require('../src/core/html-utils.js');
require('../src/core/dsl-utils.js');
require('../src/core/regex-parts.js');
require('../src/core/dsl-updater.js');
require('../src/core/text-updater.js');
require('../src/core/parser-utils.js');
require('../src/core/line-resolver.js');
require('../src/core/overlay-builder.js');
require('../src/core/selection-router.js');
require('../src/modules/sequence.js');
require('../src/ui/sequence-overlay.js');

var seq = window.MA.modules.plantumlSequence;
var overlay = window.MA.sequenceOverlay;

function loadFixture(name) {
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/' + name + '.svg'), 'utf8');
  var dslText = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/' + name + '.puml'), 'utf8');
  var div = document.createElement('div');
  div.innerHTML = svgText;
  var svgEl = div.querySelector('svg');
  return { svgEl: svgEl, parsed: seq.parseSequence(dslText) };
}

describe('buildSequenceOverlay', function() {
  test('produces overlay rects matching participant count (unique by data-id)', function() {
    var f = loadFixture('sequence-basic');
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
    var partRects = overlayEl.querySelectorAll('rect[data-type="participant"]');
    var partsInModel = f.parsed.elements.filter(function(e) { return e.kind === 'participant'; }).length;
    // Bug C6 fix で head + tail の両方に rect を置くので rect 総数は participant
    // 数の 2 倍になる。「何人分の selectable box があるか」は data-id の unique 数で判定。
    var uniqueIds = {};
    Array.prototype.forEach.call(partRects, function(r) {
      uniqueIds[r.getAttribute('data-id')] = true;
    });
    expect(Object.keys(uniqueIds).length).toBe(partsInModel);
  });

  test('produces participant-tail overlay rects so bottom actors are selectable (Bug C6)', function() {
    var f = loadFixture('sequence-basic');
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
    var partRects = overlayEl.querySelectorAll('rect[data-type="participant"]');
    var partsInModel = f.parsed.elements.filter(function(e) { return e.kind === 'participant'; }).length;
    // Feature #7: head + tail + lifeline の 3 rect / participant を生成する。
    expect(partRects.length).toBe(partsInModel * 3);
    // tail rect は head よりも Y 座標が下。同一 id で Y が異なる rect が 3 本ある。
    var firstId = f.parsed.elements.filter(function(e) { return e.kind === 'participant'; })[0].id;
    var trio = overlayEl.querySelectorAll('rect[data-type="participant"][data-id="' + firstId + '"]');
    expect(trio.length).toBe(3);
    var ys = Array.prototype.map.call(trio, function(r) { return parseFloat(r.getAttribute('y')); }).sort(function(a, b) { return a - b; });
    // head (最上) / lifeline (中央) / tail (最下) で少なくとも 10px 以上離れている。
    expect(ys[2] - ys[0] > 10).toBe(true);
  });

  test('Feature #7: lifeline click overlay rect exists for each participant', function() {
    var f = loadFixture('sequence-basic');
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
    var participants = f.parsed.elements.filter(function(e) { return e.kind === 'participant'; });
    // 各 participant について 3 rect (head/tail/lifeline) が data-id 一致で存在する
    participants.forEach(function(p) {
      var rects = overlayEl.querySelectorAll('rect[data-type="participant"][data-id="' + p.id + '"]');
      expect(rects.length).toBe(3);
    });
  });

  test('produces overlay rects for messages with correct data-line', function() {
    var f = loadFixture('sequence-basic');
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
    var msgRects = overlayEl.querySelectorAll('rect[data-type="message"]');
    expect(msgRects.length).toBe(f.parsed.relations.length);
    var lines = Array.prototype.map.call(msgRects, function(r) { return parseInt(r.getAttribute('data-line'), 10); });
    var modelLines = f.parsed.relations.map(function(r) { return r.line; });
    function numCmp(a, b) { return a - b; }
    expect(lines.sort(numCmp)).toEqual(modelLines.sort(numCmp));
  });

  test('matches correctly when @startuml is not on line 1 (preamble)', function() {
    var f = loadFixture('sequence-with-preamble');
    // parsed.meta.startUmlLine should be 3 (after 2 comment lines)
    expect(f.parsed.meta.startUmlLine).toBe(3);
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
    var msgRects = overlayEl.querySelectorAll('rect[data-type="message"]');
    // 2 messages
    expect(msgRects.length).toBe(2);
    // data-line values should match parser line numbers (absolute)
    var lines = Array.prototype.map.call(msgRects, function(r) { return parseInt(r.getAttribute('data-line'), 10); });
    var modelLines = f.parsed.relations.map(function(r) { return r.line; });
    function numCmp(a, b) { return a - b; }
    expect(lines.sort(numCmp)).toEqual(modelLines.sort(numCmp));
  });

  test('produces overlay rects for notes', function() {
    var f = loadFixture('sequence-with-notes');
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
    var noteRects = overlayEl.querySelectorAll('rect[data-type="note"]');
    var notesInModel = f.parsed.elements.filter(function(e) { return e.kind === 'note'; }).length;
    expect(noteRects.length).toBe(notesInModel);
  });

  test('produces overlay rects for activations', function() {
    var f = loadFixture('sequence-with-notes');
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
    var actRects = overlayEl.querySelectorAll('rect[data-type="activation"]');
    var actsInModel = f.parsed.elements.filter(function(e) { return e.kind === 'activation'; }).length;
    expect(actRects.length).toBe(actsInModel);
  });

  test('returns failure report when participants cant be matched', function() {
    var f = loadFixture('sequence-basic');
    // 意図的に label を変えて parse を破壊
    f.parsed.elements[0].label = '存在しないラベル_zzz';
    // line 番号も誤値に変えて offset 推定もズラす
    f.parsed.elements[0].line = 9999;
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var report = overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
    expect(report).toBeDefined();
    expect(report.unmatched).toBeDefined();
    // Use toBeGreaterThan(0) since the test framework lacks toBeGreaterThanOrEqual.
    // Equivalent for integers: >=1 ⟺ >0.
    expect(report.unmatched.participant).toBeGreaterThan(0);
  });

  test('returns matched/unmatched counts in report', function() {
    var f = loadFixture('sequence-basic');
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var report = overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
    expect(report.matched.participant).toBe(3);
    expect(report.matched.message).toBe(4);
    expect(report.unmatched.participant).toBe(0);
    expect(report.unmatched.message).toBe(0);
  });

  test('produces overlay rect for label-less message via <line> bbox fallback (Bug B3)', function() {
    var f = loadFixture('sequence-basic');
    // label を持つ 4 messages から 1 つ選び、<text> を削除して label-less を擬似再現。
    var msgGroups = f.svgEl.querySelectorAll('g.message');
    expect(msgGroups.length).toBeGreaterThan(0);
    var targetG = msgGroups[0];
    var targetText = targetG.querySelector('text');
    if (targetText) targetG.removeChild(targetText);

    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
    var msgRects = overlayEl.querySelectorAll('rect[data-type="message"]');
    // <text> が欠けた group も <line> fallback で overlay rect を得る → 4 個全て生成。
    expect(msgRects.length).toBe(f.parsed.relations.length);
  });

  test('falls back to order-based matching when SVG lacks data-source-line (Bug B5)', function() {
    var f = loadFixture('sequence-basic');
    // v1.2026.x 以降の SVG を模倣: 全ての data-source-line attribute を剥奪。
    var allGroups = f.svgEl.querySelectorAll('[data-source-line]');
    Array.prototype.forEach.call(allGroups, function(g) {
      g.removeAttribute('data-source-line');
    });
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var report = overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
    // 順序 fallback により全 participant/message が overlay に出るはず。
    expect(report.matched.participant).toBe(3);
    expect(report.matched.message).toBe(4);
    expect(report.unmatched.participant).toBe(0);
    expect(report.unmatched.message).toBe(0);
  });

  test('note placeholder is positioned near target participant rect (Bug B4)', function() {
    var f = loadFixture('sequence-with-notes');
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
    var noteRects = overlayEl.querySelectorAll('rect[data-type="note"]');
    expect(noteRects.length).toBeGreaterThan(0);
    var nr = noteRects[0];
    // 1×1 placeholder 戦略ではなく target participant の座標近傍に box が置かれるので、
    // width は 1 より大きい (= クリック可能な大きさ)。
    expect(parseFloat(nr.getAttribute('width')) > 1).toBe(true);
    expect(parseFloat(nr.getAttribute('height')) > 1).toBe(true);
  });
});

describe('resolveInsertLine', function() {
  test('y below a message y-center returns position after that line', function() {
    var f = loadFixture('sequence-basic');
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
    // First message y center を見つけてそれより下を指す
    var msgRects = overlayEl.querySelectorAll('rect[data-type="message"]');
    if (msgRects.length === 0) return;  // jsdom fixture が rect を生成しない場合の safety
    var firstY = parseFloat(msgRects[0].getAttribute('y')) + parseFloat(msgRects[0].getAttribute('height')) / 2;
    var res = overlay.resolveInsertLine(overlayEl, firstY + 10);
    expect(res).toBeDefined();
    expect(res.position).toBe('after');
    expect(typeof res.line).toBe('number');
  });

  test('returns null when overlay has no messages', function() {
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(overlay.resolveInsertLine(overlayEl, 100)).toBe(null);
  });
});

describe('selection-router.applyHighlight integration', function() {
  test('adds selected class to matching rect and removes from others', function() {
    var f = loadFixture('sequence-basic');
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
    var firstMsg = f.parsed.relations[0];
    var SR = window.MA.selectionRouter;
    SR.applyHighlight(overlayEl, [{ type: 'message', id: firstMsg.id, line: firstMsg.line }]);
    var selectedRects = overlayEl.querySelectorAll('rect.selected');
    expect(selectedRects.length).toBe(1);
    expect(parseInt(selectedRects[0].getAttribute('data-line'), 10)).toBe(firstMsg.line);
    SR.applyHighlight(overlayEl, []);
    expect(overlayEl.querySelectorAll('rect.selected').length).toBe(0);
  });
});
