'use strict';
// BLK-migrator-20260930-0323: 手続き (!procedure) が描いた遷移は、SVG の線の行 (data-source-line) が手続きの本文の行を指し、
// パーサが読んだ遷移の行 (呼んだ行) と組にならず、線・矢じり・ラベルに枠が出なかった。行で組にならない線は両端の名前で
// まだ組になっていない遷移に当て、それでも組にならない線は描いた行の枠にする (黙って捨てない)。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

[
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
].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var SM = global.window.MA.stateSvgMap;
var stMod = global.window.MA.modules.plantumlState;

function makeSvg(html) {
  document.body.innerHTML = '';
  var div = document.createElement('div');
  div.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">' + html + '</svg>';
  document.body.appendChild(div);
  return div.querySelector('svg');
}

// PlantUML 1.2026.8 が最小再現に出す形 (座標は略、要素と属性は実物から)。線の行は手続きの本文 (3 行目 = 2)。
var SVG =
  '<g class="entity" data-qualified-name="V" id="ent0001" data-source-line="4"><rect x="7" y="7" width="40" height="40" rx="12.5" fill="#F1F1F1"/><text x="10" y="20">V</text></g>' +
  '<g class="entity" data-qualified-name="C" id="ent0002" data-source-line="5"><rect x="7" y="107" width="40" height="40" rx="12.5" fill="#F1F1F1"/><text x="10" y="120">C</text></g>' +
  '<!--link V to C-->' +
  '<g class="link" data-entity-1="ent0001" data-entity-2="ent0002" id="lnk3" data-source-line="2" data-link-type="dependency">' +
    '<path d="M27,47 L27,102" fill="none"/><polygon points="27,107,31,98,27,102,23,98,27,107"/><text x="30" y="80">成功</text></g>';

describe('BLK-migrator-20260930-0323 行で組にならない遷移の線は両端で当て、残りは描いた行の枠', function() {
  test('手続きが描いた線は、両端 (V → C) が同じ遷移 (呼んだ行 7) に当たる', function() {
    // パーサは展開した行を呼んだ行で読む (preproc-expand)。ここではその結果の形を直接渡す。
    var parsed = stMod.parse('@startuml\nstate V\nstate C\n@enduml');
    parsed.transitions = [{ id: '__t_0', from: 'V', to: 'C', label: '成功', line: 7 }];
    var got = SM.collect(makeSvg(SVG), parsed);
    var trs = got.frames.filter(function(f) { return f.type === 'transition'; });
    expect(trs.map(function(f) { return f.id + '@' + f.line; })).toEqual(['__t_0@7']);
  });

  test('両端でも組にならない線は、描いた行 (data-source-line) の枠にする', function() {
    var parsed = stMod.parse('@startuml\nstate V\nstate C\n@enduml');
    var got = SM.collect(makeSvg(SVG), parsed);
    var src = got.frames.filter(function(f) { return f.type === 'source-line'; });
    expect(src.map(function(f) { return f.line; })).toEqual([3]);
    var overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    stMod.buildOverlay(makeSvg(SVG), parsed, overlay);
    expect(overlay.querySelectorAll('[data-type="source-line"][data-src-kind="link"][data-line="3"]').length).toBeGreaterThan(0);
  });

  test('note と結ぶ点線は遷移にも行の枠にもしない (注記の当て方に任せる)', function() {
    var svg = makeSvg(
      '<g class="entity" data-qualified-name="S" id="ent0001" data-source-line="1"><rect x="7" y="7" width="40" height="40" rx="12.5" fill="#F1F1F1"/></g>' +
      '<g class="entity" data-qualified-name="GMN3" id="ent0003" data-source-line="2">' +
        '<path d="M100,6 L100,32 L173,32 L173,16 L163,6 L100,6" fill="#FEFFDD"/><path d="M163,6 L163,16 L173,16 L163,6" fill="#FEFFDD"/></g>' +
      '<g class="link" data-entity-1="ent0003" data-entity-2="ent0001" id="lnk4" data-source-line="2" data-link-type="association">' +
        '<path d="M100,20 L47,20" fill="none"/></g>');
    var got = SM.collect(svg, stMod.parse('@startuml\nstate S\nnote top of S : x\n@enduml'));
    expect(got.frames.filter(function(f) { return f.link; })).toEqual([]);
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
