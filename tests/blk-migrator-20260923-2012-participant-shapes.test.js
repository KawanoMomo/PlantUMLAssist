'use strict';
// BLK-migrator-20260923-2012: participant 以外の宣言キーワード (actor / boundary / control /
// entity / database / collections / queue) の図で、参加者の見出し・ライフラインに選択枠が出なかった。
//   - 名前が図形の外 (棒人間・円の下) に出る形では、塗りのある図形だけを囲むと名前に枠が出ない
//     → 図形と名前の和集合で囲む (キーワードごとの分岐は持たない)
//   - 遅延 (`...`) があるとライフラインは区間ごとの <line> に分かれる → 全区間で囲む
//   - `ref over` も群と同じ「塗りなし・枠線あり」の rect → 並びに入れて、群の枠をずらさない
var jsdom = require('jsdom');
if (!global.window) {
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;
}
[
  'html-utils', 'dsl-utils', 'note-edit', 'regex-parts', 'id-normalizer',
  'dsl-updater', 'text-updater', 'parser-utils', 'line-resolver',
  'overlay-builder', 'selection-router', 'sequence-participant-zone',
].forEach(function(m) {
  try { delete require.cache[require.resolve('../src/core/' + m + '.js')]; } catch (e) {}
  require('../src/core/' + m + '.js');
});
try { delete require.cache[require.resolve('../src/modules/sequence.js')]; } catch (e) {}
require('../src/modules/sequence.js');
try { delete require.cache[require.resolve('../src/ui/sequence-overlay.js')]; } catch (e) {}
require('../src/ui/sequence-overlay.js');

var W = global.window;
var doc = global.document || W.document || new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>').window.document;
// overlay-builder の addRect は document を使う。単独で走らせたときだけ補う。
var _ownDoc = !global.document;
if (_ownDoc) global.document = doc;
var OB = W.MA.overlayBuilder;
var seq = W.MA.modules.plantumlSequence;
var overlay = W.MA.sequenceOverlay;

function svgOf(inner) {
  var div = doc.createElement('div');
  div.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
  return div.querySelector('svg');
}

function rectOf(el) {
  return {
    x: parseFloat(el.getAttribute('x')), y: parseFloat(el.getAttribute('y')),
    w: parseFloat(el.getAttribute('width')), h: parseFloat(el.getAttribute('height')),
  };
}

// PlantUML 1.2026 が actor / participant を描く形 (座標は実物から取った値に近い)。
var ACTOR_HEAD = '<g class="participant participant-head" data-qualified-name="User">' +
  '<text x="10" y="70" font-size="14" textLength="40">整備士</text>' +
  '<ellipse cx="30" cy="12" rx="8" ry="8" fill="#E2E2F0"/>' +
  '<path d="M30,20 L30,47 M17,28 L43,28" fill="none"/></g>';
var PART_HEAD = '<g class="participant participant-head" data-qualified-name="Sys">' +
  '<rect x="100" y="30" width="60" height="30" fill="#E2E2F0"/>' +
  '<text x="110" y="50" font-size="14" textLength="30">Sys</text></g>';

describe('参加者の形によらず、見出しの名前にも枠が出る', function() {
  test('actor: 棒人間の下に出る名前まで囲む', function() {
    var g = svgOf(ACTOR_HEAD).querySelector('g');
    var bb = OB.extractFigureBBox(g);
    expect(bb.y).toBeLessThanOrEqual(4);          // 頭の円の上端
    expect(bb.y + bb.height).toBeGreaterThanOrEqual(70);   // 名前の下端 (baseline 70)
    expect(bb.x).toBeLessThanOrEqual(10);
    expect(bb.x + bb.width).toBeGreaterThanOrEqual(50);
  });

  test('participant: 名前は箱の内側なので、囲む範囲は描いた箱のまま', function() {
    var g = svgOf(PART_HEAD).querySelector('g');
    expect(OB.extractFigureBBox(g)).toEqual(OB.extractDrawnBBox(g));
  });

  test('overlay の参加者枠が actor の名前を覆う', function() {
    var dsl = ['@startuml', 'actor "整備士" as User', 'participant Sys', 'User -> Sys : go', '@enduml'].join('\n');
    var svg = svgOf(ACTOR_HEAD + PART_HEAD);
    var out = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(svg, seq.parseSequence(dsl), out, dsl);
    var r = out.querySelector('rect[data-type="participant"][data-id="User"]');
    expect(r).not.toBeNull();
    var b = rectOf(r);
    expect(b.y + b.h).toBeGreaterThanOrEqual(70);
    expect(r.getAttribute('data-line')).toBe('2');
  });
});

describe('遅延で区切られたライフライン', function() {
  test('全区間の上端から下端までを 1 つの枠で囲む', function() {
    var dsl = ['@startuml', 'participant A', 'participant B', 'A -> B : x', '...', 'A -> B : y', '@enduml'].join('\n');
    var svg = svgOf(
      '<g class="participant-lifeline" data-qualified-name="A">' +
        '<g><rect x="25" y="40" width="8" height="60" fill="#000" fill-opacity="0"/>' +
        '<line x1="29" x2="29" y1="40" y2="100"/></g>' +
        '<line x1="29" x2="29" y1="100" y2="130"/>' +
        '<g><line x1="29" x2="29" y1="130" y2="260"/></g></g>' +
      '<g class="participant participant-head" data-qualified-name="A"><rect x="10" y="10" width="40" height="30" fill="#E2E2F0"/><text x="20" y="30">A</text></g>' +
      '<g class="participant participant-head" data-qualified-name="B"><rect x="90" y="10" width="40" height="30" fill="#E2E2F0"/><text x="100" y="30">B</text></g>');
    var out = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(svg, seq.parseSequence(dsl), out, dsl);
    var r = out.querySelector('rect[data-type="lifeline"][data-id="A"]');
    expect(r).not.toBeNull();
    var b = rectOf(r);
    expect(b.y).toBe(40);
    expect(b.y + b.h).toBe(260);
  });
});

describe('ref over の枠は群の並びをずらさない', function() {
  test('ref の後の alt / loop が、それぞれ自分の枠に当たる', function() {
    var dsl = [
      '@startuml',            // 1
      'participant A',        // 2
      'participant B',        // 3
      'ref over A, B : init', // 4
      'alt ok',               // 5
      'A -> B : x',           // 6
      'loop 3',               // 7
      'A -> B : y',           // 8
      'end',                  // 9
      'end',                  // 10
      '@enduml',
    ].join('\n');
    var frame = function(x, y, w, h) {
      return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="none" style="stroke:#181818;stroke-width:1.5;"/>';
    };
    var svg = svgOf(frame(10, 50, 100, 30) + frame(5, 100, 120, 100) + frame(8, 140, 110, 40));
    var out = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(svg, seq.parseSequence(dsl), out, dsl);
    var gs = Array.prototype.map.call(out.querySelectorAll('rect[data-type="group"]'), function(r) {
      return r.getAttribute('data-line') + '@' + (parseFloat(r.getAttribute('y')) + 2);
    });
    expect(gs).toEqual(['5@100', '7@140']);
  });
});

// 0549 と同じく、使い終わったら require キャッシュを落とす (後から自前の window を作る
// sequence-overlay.test.js が window.MA.* を登録し直せるように)。
[
  'core/html-utils', 'core/dsl-utils', 'core/note-edit', 'core/regex-parts',
  'core/id-normalizer', 'core/dsl-updater', 'core/text-updater', 'core/parser-utils',
  'core/line-resolver', 'core/overlay-builder', 'core/selection-router',
  'core/sequence-participant-zone', 'modules/sequence', 'ui/sequence-overlay',
].forEach(function(m) {
  try { delete require.cache[require.resolve('../src/' + m + '.js')]; } catch (e) {}
});
if (_ownDoc) delete global.document;
