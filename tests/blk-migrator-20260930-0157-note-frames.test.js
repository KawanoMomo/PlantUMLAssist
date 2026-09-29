'use strict';
// BLK-migrator-20260930-0157: 複合状態に付けた note (`note top of 運転`) に枠が出ず、同じ図の別の note の枠まで消えた。
// state は宣言の並び順で SVG の note と組にしていて、パーサが読めない note が 1 つあると全部を諦めていた。
// note の枠は PlantUML が SVG に残した note 自身の情報 (紙を包む <g> の data-source-line・紙の外形・接続線) で、
// 全図種共通の 1 か所 (overlay-builder の addNoteFrames) で当てる。
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
var OB = global.window.MA.overlayBuilder;
var SM = global.window.MA.stateSvgMap;
var stMod = global.window.MA.modules.plantumlState;
var SVG_NS = 'http://www.w3.org/2000/svg';

function makeSvg(html) {
  document.body.innerHTML = '';
  var div = document.createElement('div');
  div.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">' + html + '</svg>';
  document.body.appendChild(div);
  return div.querySelector('svg');
}

// migrator の最小再現を PlantUML 1.2026.8 が描いた SVG (座標は実物から、要素は必要な分だけ)。
var DSL = ['@startuml', 'state 運転 {', '  [*] --> 通常', '  通常 --> 警戒', '}',
  'note top of 運転 : 複合の上', 'note right of 警戒 : 内側', '@enduml'].join('\n');
var SVG =
  '<g class="cluster" data-qualified-name=".." id="ent0001" data-source-line="1">' +
    '<path d="M47,56 L128,56 A12.5,12.5 0 0 1 140.5,68.5 L140.5,78.609 L34.5,78.609 L34.5,68.5 A12.5,12.5 0 0 1 47,56" fill="#F1F1F1"/>' +
    '<rect x="34.5" y="56" width="106" height="308" fill="none" rx="12.5" ry="12.5"/>' +
    '<text x="73.5" y="74.533" font-size="14" textLength="28">運転</text>' +
  '</g>' +
  '<g class="entity" data-qualified-name="....." id="ent0005" data-source-line="3">' +
    '<rect x="66.5" y="290" width="50" height="50" fill="#F1F1F1" rx="12.5" ry="12.5"/>' +
    '<text x="77.5" y="309.533" font-size="14" textLength="28">警戒</text>' +
  '</g>' +
  '<g class="entity" data-qualified-name="GMN7" id="ent0008" data-source-line="5">' +
    '<path d="M6,6 L6,32.352 L79,32.352 L79,16 L69,6 L6,6" fill="#FEFFDD"/>' +
    '<path d="M69,6 L69,16 L79,16 L69,6" fill="#FEFFDD"/>' +
    '<text x="12" y="24.495" font-size="13" textLength="52">複合の上</text>' +
  '</g>' +
  '<g class="entity" data-qualified-name="GMN10" id="ent0011" data-source-line="6">' +
    '<path d="M165,302 L165,311 L116.51,315 L165,319 L165,328.352 A0,0 0 0 0 165,328.352 L212,328.352 A0,0 0 0 0 212,328.352 ' +
      'L212,312 L202,302 L165,302 A0,0 0 0 0 165,302" fill="#FEFFDD"/>' +
    '<path d="M202,302 L202,312 L212,312 L202,302" fill="#FEFFDD"/>' +
    '<text x="171" y="320.495" font-size="13" textLength="26">内側</text>' +
  '</g>' +
  '<g class="link" data-entity-1="ent0008" data-entity-2="ent0001" id="lnk9" data-source-line="5" data-link-type="association">' +
    '<path d="M42.5,32 C42.5,37.885 42.5,45.436 42.5,53.5 C42.5,54.004 42.5,54.51 42.5,55.018" fill="none"/>' +
  '</g>';

function framesOf(overlay, sel) {
  return Array.prototype.map.call(overlay.querySelectorAll(sel), function(r) {
    return r.getAttribute('data-type') + ':' + r.getAttribute('data-line');
  });
}

describe('BLK-migrator-20260930-0157 note の枠は note 自身の行・紙・接続線で当てる', function() {
  test('state parser: note top / bottom of 複合状態も note として読む (1 行・ブロック)', function() {
    var r = stMod.parse(DSL + '\nnote bottom of 運転\n  下\nend note');
    expect(r.notes.map(function(n) { return n.position + '@' + n.line + '-' + n.endLine + ':' + n.targetId; }))
      .toEqual(['top@6-6:運転', 'right@7-7:警戒', 'bottom@9-11:運転']);
  });

  test('state buildOverlay: 複合状態の上の note と中の状態の note の両方に本人の行の枠、点線の接続線にも note の枠', function() {
    var svg = makeSvg(SVG);
    var overlay = document.createElementNS(SVG_NS, 'svg');
    stMod.buildOverlay(svg, stMod.parse(DSL), overlay, DSL);
    expect(framesOf(overlay, 'rect.selectable[data-type="note"]:not([data-hit-kind])').sort()).toEqual(['note:6', 'note:7']);
    var ids = Array.prototype.map.call(overlay.querySelectorAll('rect[data-type="note"]:not([data-hit-kind])'), function(r) {
      return r.getAttribute('data-id');
    });
    expect(ids.sort()).toEqual(['__n_0', '__n_1']);
    // 接続線 (GMN7 → 運転) は線の当たり (linkline) を持ち、note top の行を指す。
    expect(framesOf(overlay, 'path.link-hit[data-hit-kind="linkline"]')).toContain('note:6');
  });

  test('読めない note が 1 つあっても、ほかの note の枠は落ちない (並び順で組にしない)', function() {
    var svg = makeSvg(SVG);
    var overlay = document.createElementNS(SVG_NS, 'svg');
    var parsed = stMod.parse(DSL);
    parsed.notes = parsed.notes.filter(function(n) { return n.position === 'right'; });   // top を読めなかったパーサ
    stMod.buildOverlay(svg, parsed, overlay, DSL);
    expect(framesOf(overlay, 'rect.selectable[data-type="note"]:not([data-hit-kind])')).toEqual(['note:7']);
    // 読めなかった note も、行を指す枠は出る (押すと note の行が選ばれる)。
    expect(framesOf(overlay, 'rect.selectable[data-src-kind="note"]:not([data-hit-kind])')).toEqual(['source-line:6']);
  });

  test('addNoteFrames: 既に枠のある紙・線には二重に置かない (図種のモジュールの後に何度呼んでも同じ)', function() {
    var svg = makeSvg(SVG);
    var overlay = document.createElementNS(SVG_NS, 'svg');
    var parsed = stMod.parse(DSL);
    stMod.buildOverlay(svg, parsed, overlay, DSL);
    var before = overlay.childNodes.length;
    expect(OB.addNoteFrames(svg, overlay, DSL, parsed.notes)).toBe(0);
    expect(overlay.childNodes.length).toBe(before);
  });

  test('addNoteFrames: 複数行の note は PlantUML が本文の 1 行目を指すので、見出しの行 (note … of X) の note に当てる', function() {
    var dsl = ['@startuml', 'state A', 'note left of A', '  本文', 'end note', '@enduml'].join('\n');
    var svg = makeSvg(
      '<g class="entity" data-qualified-name="GMN3" id="ent0003" data-source-line="3">' +
        '<path d="M6,6 L6,32 L79,32 L79,16 L69,6 L6,6" fill="#FEFFDD"/>' +
        '<path d="M69,6 L69,16 L79,16 L69,6" fill="#FEFFDD"/>' +
      '</g>');
    var overlay = document.createElementNS(SVG_NS, 'svg');
    expect(OB.addNoteFrames(svg, overlay, dsl, [{ id: 'n0', line: 3, endLine: 5 }])).toBe(1);
    var r = overlay.querySelector('rect[data-type="note"]');
    expect(r.getAttribute('data-id')).toBe('n0');
    expect(r.getAttribute('data-line')).toBe('3');
  });

  test('stateSvgMap: 浮いた note (`note "…" as N1`) の紙を状態として当てない', function() {
    var svg = makeSvg(
      '<g class="entity" data-qualified-name="N1" id="ent0003" data-source-line="1">' +
        '<path d="M6,6 L6,32 L79,32 L79,16 L69,6 L6,6" fill="#FEFFDD"/>' +
        '<path d="M69,6 L69,16 L79,16 L69,6" fill="#FEFFDD"/>' +
        '<text x="12" y="24" font-size="13">浮いた</text>' +
      '</g>');
    var got = SM.collect(svg, stMod.parse('@startuml\nnote "浮いた" as N1\n@enduml'));
    expect(got.frames.filter(function(f) { return f.type === 'state'; })).toEqual([]);
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
