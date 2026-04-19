'use strict';
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;

require('../src/core/html-utils.js');
require('../src/core/text-updater.js');
require('../src/core/parser-utils.js');
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
  test('produces overlay rects matching participant count', function() {
    var f = loadFixture('sequence-basic');
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
    var partRects = overlayEl.querySelectorAll('rect[data-type="participant"]');
    var partsInModel = f.parsed.elements.filter(function(e) { return e.kind === 'participant'; }).length;
    expect(partRects.length).toBe(partsInModel);
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

describe('setSelectedHighlight', function() {
  test('adds selected class to matching rect and removes from others', function() {
    var f = loadFixture('sequence-basic');
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
    var firstLine = f.parsed.relations[0].line;
    overlay.setSelectedHighlight(overlayEl, [{ type: 'message', line: firstLine }]);
    var selectedRects = overlayEl.querySelectorAll('rect.selected');
    expect(selectedRects.length).toBe(1);
    expect(parseInt(selectedRects[0].getAttribute('data-line'), 10)).toBe(firstLine);
    overlay.setSelectedHighlight(overlayEl, []);
    expect(overlayEl.querySelectorAll('rect.selected').length).toBe(0);
  });
});
