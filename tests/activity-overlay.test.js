'use strict';
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/modules/activity.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var actMod = global.window.MA.modules.plantumlActivity;
var SVG_NS = 'http://www.w3.org/2000/svg';

function makeSvg(setup) {
  document.body.innerHTML = '';
  var svg = document.createElementNS(SVG_NS, 'svg');
  document.body.appendChild(svg);
  setup(svg);
  return svg;
}

describe('activity buildOverlay: shape classification', function() {
  test('classifies action rect (rounded)', function() {
    var svg = makeSvg(function(s) {
      var r = document.createElementNS(SVG_NS, 'rect');
      r.setAttribute('x', '10'); r.setAttribute('y', '10');
      r.setAttribute('width', '80'); r.setAttribute('height', '30');
      r.setAttribute('rx', '8');
      s.appendChild(r);
      var t = document.createElementNS(SVG_NS, 'text');
      t.textContent = 'Hello';
      s.appendChild(t);
    });
    var overlay = document.createElementNS(SVG_NS, 'svg');
    var parsed = {
      meta: {}, swimlanes: [], notes: [],
      nodes: [{ kind: 'action', id: '__a_0', text: 'Hello', line: 2, endLine: 2, swimlaneId: null }],
    };
    actMod.buildOverlay(svg, parsed, overlay);
    var rects = overlay.querySelectorAll('rect[data-type="action"]');
    expect(rects.length).toBe(1);
    expect(rects[0].getAttribute('data-id')).toBe('__a_0');
  });
  test('classifies decision diamond (4-point polygon)', function() {
    var svg = makeSvg(function(s) {
      var p = document.createElementNS(SVG_NS, 'polygon');
      p.setAttribute('points', '50,10 90,30 50,50 10,30');
      s.appendChild(p);
    });
    var overlay = document.createElementNS(SVG_NS, 'svg');
    var parsed = {
      meta: {}, swimlanes: [], notes: [],
      nodes: [{ kind: 'if', id: '__a_0', condition: 'a?', branches: [], line: 2, endLine: 4, swimlaneId: null }],
    };
    actMod.buildOverlay(svg, parsed, overlay);
    var rects = overlay.querySelectorAll('rect[data-type="decision"]');
    expect(rects.length).toBe(1);
  });
  test('skips overlay generation when shape count mismatches node count', function() {
    var svg = makeSvg(function() { /* no shapes */ });
    var overlay = document.createElementNS(SVG_NS, 'svg');
    var parsed = {
      meta: {}, swimlanes: [], notes: [],
      nodes: [{ kind: 'action', id: '__a_0', text: 'A', line: 2, endLine: 2, swimlaneId: null }],
    };
    actMod.buildOverlay(svg, parsed, overlay);
    expect(overlay.querySelectorAll('rect[data-type="action"]').length).toBe(0);
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
