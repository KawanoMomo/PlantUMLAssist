'use strict';
// BLK-migrator-20260917-2349-b: 可視性 -/#/~ 付きの C 風メンバー (`- uint8 pinState`) に選択枠が出ない。
// 原因は `名前 : 型` 以外の属性が member として読まれず、SVG 行との対応がずれていたこと。
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

var DSL = [
  '@startuml',
  'class GpioDriver {',
  '  - uint8 pinState',
  '  # uint32 baseAddr',
  '  ~ bool initialized',
  '  + Init() : void',
  '}',
  '@enduml',
].join('\n');

// plantuml 1.2026.2 の実出力 (パスとアイコンは省略)
var SVG =
  '<svg id="src" xmlns="http://www.w3.org/2000/svg">' +
  '<g class="entity" data-qualified-name="GpioDriver" data-source-line="1">' +
  '<rect height="118" width="128" x="7" y="7"/>' +
  '<text textLength="66.9" x="51.98" y="28.72">GpioDriver</text>' +
  '<g data-visibility-modifier="PRIVATE_FIELD"><rect height="6" width="6" x="15" y="50.3"/></g>' +
  '<text textLength="85.6" x="27" y="57.53">uint8 pinState</text>' +
  '<g data-visibility-modifier="PROTECTED_FIELD"></g>' +
  '<text textLength="101.9" x="27" y="75.14">uint32 baseAddr</text>' +
  '<g data-visibility-modifier="PACKAGE_PRIVATE_FIELD"></g>' +
  '<text textLength="87.9" x="27" y="92.75">bool initialized</text>' +
  '<text textLength="65.3" x="27" y="118.36">Init() : void</text>' +
  '</g></svg><svg id="ov" xmlns="http://www.w3.org/2000/svg"></svg>';

describe('BLK-migrator-20260917-2349-b type-first members', function() {
  test('parser reads `vis Type name` attributes with their visibility', function() {
    var el = clMod.parse(DSL).elements[0];
    expect(el.members.map(function(m) { return [m.kind, m.visibility, m.name, m.type]; })).toEqual([
      ['attribute', '-', 'pinState', 'uint8'],
      ['attribute', '#', 'baseAddr', 'uint32'],
      ['attribute', '~', 'initialized', 'bool'],
      ['method', '+', 'Init', 'void'],
    ]);
  });

  test('overlay gives every member its own rect on its own svg line', function() {
    document.body.innerHTML = SVG;
    clMod.buildOverlay(document.getElementById('src'), clMod.parse(DSL), document.getElementById('ov'));
    var rects = document.querySelectorAll('#ov rect[data-type="member"]');
    expect(rects.length).toBe(4);
    var byIdx = {};
    Array.prototype.forEach.call(rects, function(r) {
      byIdx[r.getAttribute('data-member-index')] = [Math.round(parseFloat(r.getAttribute('y'))), r.getAttribute('data-line')];
    });
    expect(byIdx).toEqual({ 0: [58, '3'], 1: [75, '4'], 2: [93, '5'], 3: [118, '6'] });
  });

  test('editing a type-first attribute keeps the author\'s `Type name` style', function() {
    var t = clMod.updateAttribute(DSL, 3, 'name', 'pinLevel');
    t = clMod.updateAttribute(t, 3, 'visibility', '#');
    t = clMod.updateAttribute(t, 3, 'type', 'uint16');
    expect(t.split('\n')[2]).toBe('  # uint16 pinLevel');
    expect(t.split('\n').slice(3).join('\n')).toBe(DSL.split('\n').slice(3).join('\n'));
  });

  test('type-first method `Type name(params)` is read and edited in place', function() {
    var d = DSL.replace('  + Init() : void', '  + void Init(uint8 pin)');
    var m = clMod.parse(d).elements[0].members[3];
    expect([m.kind, m.name, m.params, m.type]).toEqual(['method', 'Init', 'uint8 pin', 'void']);
    expect(clMod.updateMethod(d, 6, 'name', 'Setup').split('\n')[5]).toBe('  + void Setup(uint8 pin)');
  });

  test('existing `name : type` style is unchanged', function() {
    var el = clMod.parse('@startuml\nclass A {\n  - count : int\n  + run(x) : void\n}\n@enduml').elements[0];
    expect(el.members.map(function(m) { return [m.name, m.type]; })).toEqual([['count', 'int'], ['run', 'void']]);
  });
});

global.window = prevWindow;
global.document = prevDocument;
