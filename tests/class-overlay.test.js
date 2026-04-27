'use strict';
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
var depPaths = [
  '../src/core/dsl-utils.js', '../src/core/regex-parts.js',
  '../src/core/line-resolver.js', '../src/core/text-updater.js',
  '../src/core/dsl-updater.js', '../src/core/parser-utils.js',
  '../src/core/props-renderer.js', '../src/core/overlay-builder.js',
  '../src/modules/class.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var clMod = global.window.MA.modules.plantumlClass;

describe('class.buildOverlay', function() {
  beforeEach(function() {
    document.body.innerHTML =
      '<svg id="src" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">' +
        '<g class="entity" data-qualified-name="Foo" data-source-line="2"><rect x="10" y="10" width="100" height="60"/><text x="20" y="30">Foo</text></g>' +
        '<g class="entity" data-qualified-name="IAuth" data-source-line="6"><rect x="150" y="10" width="100" height="40"/><text x="160" y="30">IAuth</text></g>' +
      '</svg>' +
      '<svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
  });
  test('creates rect for class element', function() {
    clMod.buildOverlay(
      document.getElementById('src'),
      { meta: { startUmlLine: 1 }, elements: [{ kind: 'class', id: 'Foo', line: 2 }], relations: [], groups: [] },
      document.getElementById('ov')
    );
    expect(document.querySelectorAll('#ov rect[data-type="class"]').length).toBe(1);
  });
  test('creates rect for interface element', function() {
    clMod.buildOverlay(
      document.getElementById('src'),
      { meta: { startUmlLine: 1 }, elements: [{ kind: 'interface', id: 'IAuth', line: 6 }], relations: [], groups: [] },
      document.getElementById('ov')
    );
    expect(document.querySelectorAll('#ov rect[data-type="interface"]').length).toBe(1);
  });
  test('relation rect with data-relation-kind', function() {
    document.body.innerHTML =
      '<svg id="src" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="link"><line x1="0" y1="0" x2="50" y2="0"/></g>' +
      '</svg>' +
      '<svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
    clMod.buildOverlay(
      document.getElementById('src'),
      { meta: { startUmlLine: 1 }, elements: [], relations: [{ id: '__r_0', kind: 'inheritance', from: 'Animal', to: 'Dog', line: 5 }], groups: [] },
      document.getElementById('ov')
    );
    var r = document.querySelector('#ov rect[data-type="relation"]');
    expect(r.getAttribute('data-relation-kind')).toBe('inheritance');
  });

  test('creates rect for note when polygon matches', function() {
    document.body.innerHTML =
      '<svg id="src" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="entity" data-qualified-name="Foo" data-source-line="2">' +
          '<rect x="10" y="10" width="100" height="40"/>' +
          '<text x="20" y="30">Foo</text>' +
        '</g>' +
        '<polygon points="200,10 290,10 300,20 300,50 200,50"/>' +
      '</svg>' +
      '<svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
    clMod.buildOverlay(
      document.getElementById('src'),
      {
        meta: { startUmlLine: 1 },
        elements: [{ kind: 'class', id: 'Foo', label: 'Foo', members: [], line: 2, endLine: 2 }],
        relations: [],
        groups: [],
        notes: [{ id: '__n_0', targetId: 'Foo', position: 'right', line: 3, endLine: 3, text: 'tip' }],
      },
      document.getElementById('ov')
    );
    var noteRects = document.querySelectorAll('#ov rect[data-type="note"]');
    expect(noteRects.length).toBe(1);
    expect(noteRects[0].getAttribute('data-id')).toBe('__n_0');
  });

  test('creates member rect per class member', function() {
    document.body.innerHTML =
      '<svg id="src" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="entity" data-qualified-name="Foo" data-source-line="2">' +
          '<rect x="10" y="10" width="120" height="60"/>' +
          '<text x="20" y="22" textLength="40">Foo</text>' +
          '<text x="20" y="36" textLength="80">+ name : String</text>' +
          '<text x="20" y="50" textLength="80">+ login() : void</text>' +
        '</g>' +
      '</svg>' +
      '<svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
    clMod.buildOverlay(
      document.getElementById('src'),
      {
        meta: { startUmlLine: 1 },
        elements: [{
          kind: 'class', id: 'Foo', label: 'Foo', stereotype: null, generics: null,
          line: 2, endLine: 4,
          members: [
            { kind: 'attribute', visibility: '+', name: 'name', type: 'String', static: false, abstract: false, line: 3 },
            { kind: 'method', visibility: '+', name: 'login', params: '', type: 'void', static: false, abstract: false, line: 4 },
          ],
        }],
        relations: [], groups: [], notes: [],
      },
      document.getElementById('ov')
    );
    var memberRects = document.querySelectorAll('#ov rect[data-type="member"]');
    expect(memberRects.length).toBe(2);
    expect(memberRects[0].getAttribute('data-parent-id')).toBe('Foo');
    expect(memberRects[0].getAttribute('data-member-index')).toBe('0');
    expect(memberRects[1].getAttribute('data-member-index')).toBe('1');
  });

  test('member rect data-id encodes parent::index', function() {
    document.body.innerHTML =
      '<svg id="src" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="entity" data-qualified-name="Foo" data-source-line="2">' +
          '<rect x="10" y="10" width="120" height="40"/>' +
          '<text x="20" y="22" textLength="40">Foo</text>' +
          '<text x="20" y="36" textLength="60">+ x : int</text>' +
        '</g>' +
      '</svg>' +
      '<svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
    clMod.buildOverlay(
      document.getElementById('src'),
      {
        meta: { startUmlLine: 1 },
        elements: [{
          kind: 'class', id: 'Foo', label: 'Foo', stereotype: null, generics: null,
          line: 2, endLine: 3,
          members: [{ kind: 'attribute', visibility: '+', name: 'x', type: 'int', static: false, abstract: false, line: 3 }],
        }],
        relations: [], groups: [], notes: [],
      },
      document.getElementById('ov')
    );
    var r = document.querySelectorAll('#ov rect[data-type="member"]')[0];
    expect(r.getAttribute('data-id')).toBe('Foo::__m_0');
  });

  test('omits note rect when polygon count mismatches notes count', function() {
    document.body.innerHTML =
      '<svg id="src" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="entity" data-qualified-name="Foo" data-source-line="2">' +
          '<rect x="10" y="10" width="100" height="40"/>' +
          '<text x="20" y="30">Foo</text>' +
        '</g>' +
      '</svg>' +
      '<svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
    clMod.buildOverlay(
      document.getElementById('src'),
      {
        meta: { startUmlLine: 1 },
        elements: [{ kind: 'class', id: 'Foo', label: 'Foo', members: [], line: 2, endLine: 2 }],
        relations: [],
        groups: [],
        notes: [{ id: '__n_0', targetId: 'Foo', position: 'right', line: 3, endLine: 3, text: 'tip' }],
      },
      document.getElementById('ov')
    );
    var noteRects = document.querySelectorAll('#ov rect[data-type="note"]');
    expect(noteRects.length).toBe(0);
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
