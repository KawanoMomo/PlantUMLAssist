'use strict';
// BLK-migrator-20260926-1116: note の当たり判定は、中の Creole (表の罫線・箇条書きの点・リンク) からではなく
// note の紙の外形 (外形の path + 右上の折り返しの path) から全図種共通の 1 か所 (overlay-builder) で取る。
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
var OB = global.window.MA.overlayBuilder;
var stMod = global.window.MA.modules.plantumlState;
var SVG_NS = 'http://www.w3.org/2000/svg';

function makeSvg(html) {
  document.body.innerHTML = '';
  var div = document.createElement('div');
  div.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">' + html + '</svg>';
  document.body.appendChild(div);
  return div.querySelector('svg');
}

// PlantUML 1.2026.8 が `note right of Review` (表 + 箇条書き + リンク) に出す形 (座標は実物から)。
var NOTE_G =
  '<g class="entity" data-qualified-name="GMN2" data-source-line="3">' +
    '<path d="M108.5,6 L108.5,95 L73.17,99 L108.5,103 L108.5,191.516 A0,0 0 0 0 108.5,191.516 L277.623,191.516 ' +
      'A0,0 0 0 0 277.623,191.516 L277.623,16 L267.623,6 L108.5,6 A0,0 0 0 0 108.5,6" fill="#FEFFDD"/>' +
    '<path d="M267.623,6 L267.623,16 L277.623,16 L267.623,6" fill="#FEFFDD"/>' +
    '<text x="118.112" y="26.495" font-size="13" textLength="26.73">Item</text>' +
    '<line x1="114.5" y1="13" x2="262.623" y2="13"/>' +
    '<ellipse cx="120" cy="89.258" rx="2.5" ry="2.5" fill="#000"/>' +
    '<text x="126.5" y="93.901" font-size="13" textLength="52.736">Checklist</text>' +
    '<rect x="123.5" y="103.109" width="3.5" height="3.5" fill="#000"/>' +
    '<text x="130.5" y="110.253" font-size="13" textLength="63.584">Sub item A</text>' +
  '</g>';

describe('BLK-migrator-20260926-1116 note の紙の外形', function() {
  test('notePapers: 外形の path と折り返しの組を紙として拾い、外形は尖りを含み、紙は尖りを除く', function() {
    var svg = makeSvg(NOTE_G);
    var ps = OB.notePapers(svg);
    expect(ps.length).toBe(1);
    expect(Math.round(ps[0].box.x)).toBe(73);
    expect(Math.round(ps[0].box.x + ps[0].box.width)).toBe(278);
    expect(Math.round(ps[0].box.y)).toBe(6);
    expect(Math.round(ps[0].box.y + ps[0].box.height)).toBe(192);
    expect(Math.round(ps[0].body.x)).toBe(109);
    expect(Math.round(ps[0].body.width)).toBe(169);
  });

  test('notePaperBox: 中の箇条書きの点 (rect) ではなく紙の外形を返す', function() {
    var svg = makeSvg(NOTE_G);
    var bb = OB.notePaperBox(svg.querySelector('g'));
    expect(bb).not.toBeNull();
    expect(bb.width).toBeGreaterThan(150);
    expect(bb.height).toBeGreaterThan(150);
  });

  test('折り返しの無い形 (状態の角丸の箱・矢じり) は紙にしない', function() {
    var svg = makeSvg(
      '<g class="entity"><rect x="0" y="0" width="50" height="40" fill="#F1F1F1"/></g>' +
      '<path d="M0,0 L10,0 L10,10 L0,10 Z" fill="#000"/>' +
      '<polygon points="1,1,9,5,1,9,4,5" fill="#000"/>');
    expect(OB.notePapers(svg).length).toBe(0);
  });

  test('notePaperAt: 点を含む紙を返し、外なら null', function() {
    var svg = makeSvg(NOTE_G);
    expect(OB.notePaperAt(svg, 200, 150)).not.toBeNull();
    expect(OB.notePaperAt(svg, 400, 150)).toBeNull();
  });

  test('noteLineKey: 表の区切り・箇条書きの印・リンクの URL を落とし、描かれる文字にそろえる', function() {
    expect(OB.noteLineKey('  |= Item |= Status |')).toBe('Item Status');
    expect(OB.noteLineKey('  | WDT reset | ok |')).toBe('WDT reset ok');
    expect(OB.noteLineKey('  ** Sub item A')).toBe('Sub item A');
    expect(OB.noteLineKey('  # Step 1')).toBe('Step 1');
    expect(OB.noteLineKey('  See [[https://example.com/spec spec doc]]')).toBe('See spec doc');
    expect(OB.noteLineKey('  <b>bold</b> text')).toBe('bold text');
  });

  test('addUnclaimed: 複数行の note は PlantUML が本文の 1 行目を指すので、見出しの行 (note right of …) に直す', function() {
    // data-source-line="3" (0 始まり) = 4 行目 = 本文の 1 行目。note の行は 3 行目。
    var svg = makeSvg(NOTE_G);
    var overlay = document.createElementNS(SVG_NS, 'svg');
    var dsl = ['@startuml', 'state Review', 'note right of Review', '  |= Item |= Status |', 'end note', '@enduml'].join('\n');
    OB.addUnclaimed(svg, overlay, [], null, dsl);
    var r = overlay.querySelector('rect[data-type="source-line"]');
    expect(r.getAttribute('data-line')).toBe('3');
    expect(parseFloat(r.getAttribute('width'))).toBeGreaterThan(150);
  });

  test('addUnclaimed: 1 行の note (`note right of X : 本文`) は書いた行のまま', function() {
    var svg = makeSvg(NOTE_G.replace('data-source-line="3"', 'data-source-line="2"'));
    var overlay = document.createElementNS(SVG_NS, 'svg');
    var dsl = ['@startuml', 'state Review', 'note right of Review : hello', '@enduml'].join('\n');
    OB.addUnclaimed(svg, overlay, [], null, dsl);
    expect(overlay.querySelector('rect[data-type="source-line"]').getAttribute('data-line')).toBe('3');
  });

  test('state buildOverlay: Creole の表・箇条書きのある note の枠は紙全体 (箇条書きの点の 4px 角にしない)', function() {
    var svg = makeSvg(
      '<g class="entity" data-qualified-name="Review" data-source-line="2">' +
        '<rect x="7" y="72" width="58" height="50" rx="12.5" fill="#F1F1F1"/>' +
        '<text x="14" y="90" font-size="14">Review</text>' +
      '</g>' + NOTE_G);
    var overlay = document.createElementNS(SVG_NS, 'svg');
    var parsed = {
      meta: {}, transitions: [],
      states: [{ kind: 'state', id: 'Review', label: 'Review', stereotype: null, parentId: null, line: 2, endLine: 2 }],
      notes: [{ id: '__note_0', line: 3, endLine: 16, targetId: 'Review', position: 'right', text: '|= Item |= Status |' }],
    };
    stMod.buildOverlay(svg, parsed, overlay);
    var r = overlay.querySelector('rect[data-type="note"]');
    expect(r).not.toBeNull();
    expect(r.getAttribute('data-line')).toBe('3');
    expect(parseFloat(r.getAttribute('width'))).toBeGreaterThan(150);
    expect(parseFloat(r.getAttribute('height'))).toBeGreaterThan(150);
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
