'use strict';
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/dsl-utils.js',
  '../src/core/state-transition.js',
  '../src/core/regex-parts.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/core/state-svg-map.js',
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

// BLK-human-20260923-2001: 開始・終了 [*] の丸も選べ、どこの (最上位 / 親) 開始・終了かが id で分かる。
describe('state buildOverlay: 開始・終了の丸', function() {
  test('qualified-name から kind と scope を読む', function() {
    expect(stMod.pseudoFromQualifiedName('.start.', 'start_entity')).toEqual({ kind: 'start', scope: '' });
    expect(stMod.pseudoFromQualifiedName('Idle..end.Idle', 'end_entity')).toEqual({ kind: 'end', scope: 'Idle' });
    expect(stMod.pseudoFromQualifiedName('A.B..start.A.B', 'start_entity')).toEqual({ kind: 'start', scope: 'A.B' });
    expect(stMod.pseudoFromQualifiedName('X', 'entity')).toBe(null);
  });
  test('start_entity / end_entity に pseudo の当たり矩形を置く', function() {
    var svg = makeSvg(
      '<g class="start_entity" data-qualified-name=".start." data-source-line="1">' +
        '<ellipse cx="44" cy="16" rx="10" ry="10"/></g>' +
      '<g class="start_entity" data-qualified-name="Idle..start.Idle" data-source-line="5">' +
        '<ellipse cx="45" cy="135" rx="10" ry="10"/></g>' +
      '<g class="end_entity" data-qualified-name="Idle..end.Idle" data-source-line="7">' +
        '<ellipse cx="45" cy="384" rx="11" ry="11"/><ellipse cx="45" cy="384" rx="6" ry="6"/></g>'
    );
    var overlay = document.createElementNS(SVG_NS, 'svg');
    stMod.buildOverlay(svg, { meta: {}, transitions: [], notes: [], states: [] }, overlay);
    var ids = Array.prototype.map.call(overlay.querySelectorAll('rect[data-type="pseudo"]'), function(r) {
      return r.getAttribute('data-id') + ':' + r.getAttribute('data-line');
    }).sort();
    expect(ids).toEqual(['end@Idle:8', 'start@:2', 'start@Idle:6']);
    var endRect = overlay.querySelector('rect[data-id="end@Idle"]');
    expect(parseFloat(endRect.getAttribute('width'))).toBe(28);
  });
});
