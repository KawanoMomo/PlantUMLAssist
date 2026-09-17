'use strict';
// BLK-migrator-20260918-0049: struct / annotation、package・namespace 配下、文字入り区切り線のある class 図で選択枠が要素とずれる。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
[
  '../src/core/dsl-utils.js', '../src/core/regex-parts.js',
  '../src/core/line-resolver.js', '../src/core/text-updater.js',
  '../src/core/dsl-updater.js', '../src/core/parser-utils.js',
  '../src/core/props-renderer.js', '../src/core/overlay-builder.js',
  '../src/core/relation-options.js', '../src/modules/class.js',
].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var clMod = global.window.MA.modules.plantumlClass;

function overlay(dsl, svgInner) {
  document.body.innerHTML = '<svg id="src" xmlns="http://www.w3.org/2000/svg">' + svgInner +
    '</svg><svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';
  clMod.buildOverlay(document.getElementById('src'), clMod.parse(dsl), document.getElementById('ov'));
  return Array.prototype.map.call(document.querySelectorAll('#ov rect[data-type]'), function(r) {
    return r.getAttribute('data-type') + ':' + r.getAttribute('data-id') + '@' + r.getAttribute('data-line') +
      (r.getAttribute('data-type') === 'member' ? '/y' + Math.round(parseFloat(r.getAttribute('y'))) : '');
  });
}

describe('BLK-migrator-20260918-0049 class nested / special notation frames', function() {
  test('struct and annotation are read as elements with members', function() {
    var p = clMod.parse('@startuml\nannotation "@Safety(ASIL_D)" as SafetyTag\nstruct CanFrame {\n  id: uint32\n  dlc: uint8\n}\n@enduml');
    expect(p.elements.map(function(e) { return [e.kind, e.id, e.label, e.members.length]; })).toEqual([
      ['annotation', 'SafetyTag', '@Safety(ASIL_D)', 0], ['struct', 'CanFrame', 'CanFrame', 2],
    ]);
  });

  test('classes inside package / namespace find their qualified svg entity', function() {
    var dsl = '@startuml\npackage "BSW層" {\n  class GpioDriver\n}\nnamespace App {\n  class MainTask\n}\n@enduml';
    var ids = overlay(dsl,
      '<g class="entity" data-qualified-name="BSW..GpioDriver"><rect x="10" y="10" width="80" height="40"/><text x="20" y="30" textLength="60">GpioDriver</text></g>' +
      '<g class="entity" data-qualified-name="App.MainTask"><rect x="110" y="10" width="80" height="40"/><text x="120" y="30" textLength="60">MainTask</text></g>');
    expect(ids.filter(function(x) { return x.indexOf('class:') === 0; })).toEqual(['class:GpioDriver@3', 'class:MainTask@6']);
  });

  test('labelled separators take a line, even when svg writes the label after the next member', function() {
    var dsl = '@startuml\nclass TaskA {\n  + Run()\n  --\n  - id : int\n  ..private..\n  - secret : int\n  ==公開定数==\n  {static} MAX : int\n}\n@enduml';
    var ids = overlay(dsl,
      '<g class="entity" data-qualified-name="TaskA"><rect x="7" y="7" width="100" height="160"/>' +
      '<text x="20" y="28" textLength="40">TaskA</text>' +
      '<text x="20" y="57" textLength="40">Run()</text>' +
      '<text x="20" y="83" textLength="40">id : int</text>' +
      '<text x="20" y="122" textLength="40">secret : int</text>' +
      '<text x="20" y="104" textLength="40">private</text>' +
      '<text x="20" y="161" textLength="40">MAX : int</text>' +
      '<text x="20" y="143" textLength="40">公開定数</text></g>');
    expect(ids.filter(function(s) { return s.indexOf('member:') === 0; })).toEqual([
      'member:TaskA::__m_0@3/y57', 'member:TaskA::__m_1@5/y83', 'member:TaskA::__m_2@7/y122', 'member:TaskA::__m_3@9/y161',
    ]);
  });

  test('unlabelled separators and plain members are unchanged', function() {
    var el = clMod.parse('@startuml\nclass A {\n  - a : int\n  --\n  + b()\n}\n@enduml').elements[0];
    expect(el.members.map(function(m) { return m.name; })).toEqual(['a', 'b']);
    expect(el.labelledSeparators === undefined).toBe(true);
  });
});

global.window = prevWindow;
global.document = prevDocument;
