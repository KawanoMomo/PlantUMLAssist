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

function appendEllipse(s, attrs) {
  var e = document.createElementNS(SVG_NS, 'ellipse');
  Object.keys(attrs).forEach(function(k) { e.setAttribute(k, attrs[k]); });
  s.appendChild(e);
  return e;
}

function appendRect(s, attrs) {
  var r = document.createElementNS(SVG_NS, 'rect');
  Object.keys(attrs).forEach(function(k) { r.setAttribute(k, attrs[k]); });
  s.appendChild(r);
  return r;
}

function appendPolygon(s, points) {
  var p = document.createElementNS(SVG_NS, 'polygon');
  p.setAttribute('points', points);
  s.appendChild(p);
  return p;
}

describe('activity buildOverlay: shape classification (real PlantUML SVG signatures)', function() {

  test('start: standalone filled ellipse fill="#222222" classified as start', function() {
    var svg = makeSvg(function(s) {
      appendEllipse(s, { cx: '60', cy: '25', rx: '10', ry: '10', fill: '#222222' });
    });
    var overlay = document.createElementNS(SVG_NS, 'svg');
    var parsed = {
      meta: {}, swimlanes: [], notes: [],
      nodes: [{ kind: 'start', id: '__a_0', line: 2, endLine: 2, swimlaneId: null }],
    };
    actMod.buildOverlay(svg, parsed, overlay);
    var rects = overlay.querySelectorAll('rect[data-type="start"]');
    expect(rects.length).toBe(1);
    expect(rects[0].getAttribute('data-id')).toBe('__a_0');
  });

  test('stop: paired ellipses (outer none + inner filled at same center) → single stop rect', function() {
    var svg = makeSvg(function(s) {
      appendEllipse(s, { cx: '60', cy: '120', rx: '11', ry: '11', fill: 'none' });
      appendEllipse(s, { cx: '60', cy: '120', rx: '6', ry: '6', fill: '#222222' });
    });
    var overlay = document.createElementNS(SVG_NS, 'svg');
    var parsed = {
      meta: {}, swimlanes: [], notes: [],
      nodes: [{ kind: 'stop', id: '__a_0', line: 4, endLine: 4, swimlaneId: null }],
    };
    actMod.buildOverlay(svg, parsed, overlay);
    var rects = overlay.querySelectorAll('rect[data-type="stop"]');
    expect(rects.length).toBe(1);
  });

  test('action: rect rx="12.5" classified as action', function() {
    var svg = makeSvg(function(s) {
      appendRect(s, { x: '16', y: '55', width: '87', height: '34', rx: '12.5', ry: '12.5', fill: '#F1F1F1' });
    });
    var overlay = document.createElementNS(SVG_NS, 'svg');
    var parsed = {
      meta: {}, swimlanes: [], notes: [],
      nodes: [{ kind: 'action', id: '__a_0', text: 'Hello', line: 2, endLine: 2, swimlaneId: null }],
    };
    actMod.buildOverlay(svg, parsed, overlay);
    expect(overlay.querySelectorAll('rect[data-type="action"]').length).toBe(1);
  });

  test('decision: 7-point hexagonal polygon classified as decision (not 4-point)', function() {
    var svg = makeSvg(function(s) {
      // Real PlantUML hexagon: 7 points (last = first to close), comma-separated
      appendPolygon(s, '64.4553,55,95.2908,55,107.2908,67,95.2908,79,64.4553,79,52.4553,67,64.4553,55');
    });
    var overlay = document.createElementNS(SVG_NS, 'svg');
    var parsed = {
      meta: {}, swimlanes: [], notes: [],
      nodes: [{ kind: 'if', id: '__a_0', condition: 'a?', branches: [], line: 2, endLine: 4, swimlaneId: null }],
    };
    actMod.buildOverlay(svg, parsed, overlay);
    expect(overlay.querySelectorAll('rect[data-type="decision"]').length).toBe(1);
  });

  test('fork bar: thin rect height=6 fill=#555555 classified as fork', function() {
    var svg = makeSvg(function(s) {
      appendRect(s, { x: '16', y: '186', width: '112', height: '6', rx: '2.5', ry: '2.5', fill: '#555555' });
    });
    var overlay = document.createElementNS(SVG_NS, 'svg');
    var parsed = {
      meta: {}, swimlanes: [], notes: [],
      nodes: [{ kind: 'fork', id: '__a_0', branches: [], line: 2, endLine: 4, swimlaneId: null }],
    };
    actMod.buildOverlay(svg, parsed, overlay);
    expect(overlay.querySelectorAll('rect[data-type="fork"]').length).toBe(1);
  });

  test('arrow heads (small 4-point polygons) are ignored', function() {
    var svg = makeSvg(function(s) {
      // Only an arrow head, no real node shapes
      appendPolygon(s, '55.6357,45,59.6357,55,63.6357,45,59.6357,49');
    });
    var overlay = document.createElementNS(SVG_NS, 'svg');
    var parsed = {
      meta: {}, swimlanes: [], notes: [],
      nodes: [{ kind: 'action', id: '__a_0', text: 'A', line: 2, endLine: 2, swimlaneId: null }],
    };
    actMod.buildOverlay(svg, parsed, overlay);
    // No action rect was in SVG, so no overlay rect for action
    expect(overlay.querySelectorAll('rect[data-type="decision"]').length).toBe(0);
    // Crucially, the arrow head should NOT be matched as decision
  });

  test('full pattern: start + action + stop produces 3 overlay rects in order', function() {
    var svg = makeSvg(function(s) {
      // Mimics the actual PlantUML SVG output for `@startuml\nstart\n:Hello;\nstop\n@enduml`
      appendEllipse(s, { cx: '60', cy: '25', rx: '10', ry: '10', fill: '#222222' });
      appendRect(s, { x: '16', y: '55', width: '87', height: '34', rx: '12.5', ry: '12.5', fill: '#F1F1F1' });
      appendEllipse(s, { cx: '60', cy: '120', rx: '11', ry: '11', fill: 'none' });
      appendEllipse(s, { cx: '60', cy: '120', rx: '6', ry: '6', fill: '#222222' });
      // Transition arrow heads (4-point polygons)
      appendPolygon(s, '55.6357,45,59.6357,55,63.6357,45,59.6357,49');
      appendPolygon(s, '55.6357,98.9688,59.6357,108.9688,63.6357,98.9688,59.6357,102.9688');
    });
    var overlay = document.createElementNS(SVG_NS, 'svg');
    var parsed = {
      meta: {}, swimlanes: [], notes: [],
      nodes: [
        { kind: 'start', id: '__a_0', line: 2, endLine: 2, swimlaneId: null },
        { kind: 'action', id: '__a_1', text: 'Hello', line: 3, endLine: 3, swimlaneId: null },
        { kind: 'stop', id: '__a_2', line: 4, endLine: 4, swimlaneId: null },
      ],
    };
    actMod.buildOverlay(svg, parsed, overlay);
    expect(overlay.querySelectorAll('rect[data-type="start"]').length).toBe(1);
    expect(overlay.querySelectorAll('rect[data-type="action"]').length).toBe(1);
    expect(overlay.querySelectorAll('rect[data-type="stop"]').length).toBe(1);
    // Verify document order via data-id
    var allRects = overlay.querySelectorAll('rect.selectable');
    expect(allRects[0].getAttribute('data-id')).toBe('__a_0');
    expect(allRects[1].getAttribute('data-id')).toBe('__a_1');
    expect(allRects[2].getAttribute('data-id')).toBe('__a_2');
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
