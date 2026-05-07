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
  '../src/modules/state.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var stMod = global.window.MA.modules.plantumlState;
var SVG_NS = 'http://www.w3.org/2000/svg';

function makeSvg(html) {
  document.body.innerHTML = '';
  var div = document.createElement('div');
  div.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">' + html + '</svg>';
  document.body.appendChild(div);
  return div.querySelector('svg');
}

describe('state buildOverlay: entity matching', function() {
  test('creates overlay rect for simple state', function() {
    var svg = makeSvg(
      '<g class="entity" data-qualified-name="A">' +
        '<rect x="10" y="10" width="50" height="40" rx="12.5" fill="#F1F1F1"/>' +
      '</g>'
    );
    var overlay = document.createElementNS(SVG_NS, 'svg');
    var parsed = {
      meta: {}, transitions: [], notes: [],
      states: [{ kind: 'state', id: 'A', label: 'A', stereotype: null, parentId: null, line: 2, endLine: 2 }],
    };
    stMod.buildOverlay(svg, parsed, overlay);
    expect(overlay.querySelectorAll('rect[data-type="state"]').length).toBe(1);
    expect(overlay.querySelector('rect[data-type="state"]').getAttribute('data-id')).toBe('A');
  });
  test('handles composite state with child', function() {
    var svg = makeSvg(
      '<rect x="100" y="0" width="100" height="200" rx="12.5" fill="none"/>' +
      '<g class="entity" data-qualified-name="Outer.Inner">' +
        '<rect x="110" y="50" width="50" height="40" rx="12.5" fill="#F1F1F1"/>' +
      '</g>'
    );
    var overlay = document.createElementNS(SVG_NS, 'svg');
    var parsed = {
      meta: {}, transitions: [], notes: [],
      states: [
        { kind: 'state', id: 'Outer', label: 'Outer', stereotype: null, parentId: null, line: 2, endLine: 4 },
        { kind: 'state', id: 'Outer.Inner', label: 'Inner', stereotype: null, parentId: 'Outer', line: 3, endLine: 3 },
      ],
    };
    stMod.buildOverlay(svg, parsed, overlay);
    expect(overlay.querySelectorAll('rect[data-type="state"][data-id="Outer.Inner"]').length).toBe(1);
    expect(overlay.querySelectorAll('rect[data-type="state"][data-id="Outer"]').length).toBe(1);
  });
});
