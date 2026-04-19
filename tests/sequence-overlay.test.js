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
});
