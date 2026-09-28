'use strict';
// BLK-human-20260928-2255-2: 図の末尾に区切り線・注釈・遅延・ref・枠 (alt など) がある図で、その下を押して足すと
// 最後のメッセージの後ろ (末尾の部品より前) に入っていた。挿入の当たりはメッセージの枠だけを見ていた。
// 注釈・区切り線・遅延・ref・枠も目印にし、箱の下を押したらその終わりの行の後ろに入れる。
var jsdom = require('jsdom');

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
var prevWindow = global.window;
var prevDocument = global.document;
global.window = dom.window;
global.document = dom.window.document;

var SRC = [
  '../src/core/html-utils.js',
  '../src/core/dsl-utils.js', '../src/core/note-edit.js',
  '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js',
  '../src/core/dsl-updater.js',
  '../src/core/text-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/line-resolver.js',
  '../src/core/overlay-builder.js',
  '../src/ui/properties.js',
  '../src/core/sequence-marks.js',
  '../src/core/sequence-activation-insert.js',
  '../src/modules/sequence.js',
  '../src/ui/sequence-overlay.js',
];
SRC.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} require(p); });

var seq = window.MA.modules.plantumlSequence;
var overlay = window.MA.sequenceOverlay;

function makeOverlay(rectAttrs) {
  var ov = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  rectAttrs.forEach(function(attrs) {
    var r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    Object.keys(attrs).forEach(function(k) { r.setAttribute(k, attrs[k]); });
    ov.appendChild(r);
  });
  return ov;
}

// 1 @startuml / 2-3 participant / 4 App -> Drv / 5 Drv -> App / 6 (末尾の部品) / … / @enduml
var MSGS = [
  { 'data-type': 'message', 'data-line': '4', x: '20', y: '60', width: '80', height: '30' },
  { 'data-type': 'message', 'data-line': '5', x: '20', y: '90', width: '80', height: '30' },
];
function withTail(rect) { return MSGS.concat([rect]); }

describe('BLK-human-20260928-2255-2 末尾の部品の下を押すと、その後ろに入る', function() {
  test('区切り線の下を押すと区切り線の行の後ろ。区切り線より上ならこれまでどおり最後のメッセージの後ろ', function() {
    var ov = makeOverlay(withTail({ 'data-type': 'source-line', 'data-src-kind': 'divider', 'data-line': '6',
      x: '10', y: '126', width: '120', height: '30' }));
    var below = overlay.resolveInsertLine(ov, 60, 170);
    expect(below.line).toBe(6);
    expect(below.position).toBe('after');
    var between = overlay.resolveInsertLine(ov, 60, 122);
    expect(between.line).toBe(5);
    expect(between.position).toBe('after');
  });

  test('複数行の注釈の下は end note の後ろ (注釈の中に入れない)', function() {
    var ov = makeOverlay(withTail({ 'data-type': 'note', 'data-line': '6', 'data-line-end': '8',
      x: '10', y: '124', width: '60', height: '30' }));
    var res = overlay.resolveInsertLine(ov, 60, 170);
    expect(res.line).toBe(8);
    expect(res.position).toBe('after');
    var t = ['@startuml', 'participant App', 'participant Drv', 'App -> Drv : init()', 'Drv -> App : ok',
      'note over App', 'おわり', 'end note', '@enduml'].join('\n');
    expect(seq.insertTargetLine(res.line, res.position, t)).toBe(9);
  });

  test('枠 (alt) の下は end の後ろ。枠の中で最後のメッセージの下なら枠の中', function() {
    var ov = makeOverlay(MSGS.concat([
      { 'data-type': 'group', 'data-line': '6', 'data-line-end': '10', x: '5', y: '122', width: '140', height: '110' },
      // 枠の縁の当たり (同じ枠の別の rect) は 1 つの箱にまとめる
      { 'data-type': 'group', 'data-line': '6', 'data-line-end': '10', x: '5', y: '226', width: '140', height: '12' },
      { 'data-type': 'message', 'data-line': '7', x: '20', y: '150', width: '80', height: '30' },
      { 'data-type': 'message', 'data-line': '9', x: '20', y: '190', width: '80', height: '30' },
    ]));
    var below = overlay.resolveInsertLine(ov, 60, 260);
    expect(below.line).toBe(10);
    expect(below.position).toBe('after');
    var inside = overlay.resolveInsertLine(ov, 60, 215);
    expect(inside.line).toBe(9);
    expect(inside.position).toBe('after');
  });

  test('遅延・ref も同じ。位置の分からない注釈の 1×1 は目印にしない', function() {
    var delay = makeOverlay(withTail({ 'data-type': 'source-line', 'data-src-kind': 'delay', 'data-line': '6',
      x: '10', y: '128', width: '120', height: '20' }));
    expect(overlay.resolveInsertLine(delay, 60, 170).line).toBe(6);
    var ref = makeOverlay(withTail({ 'data-type': 'source-line', 'data-src-kind': 'ref', 'data-line': '6',
      'data-line-end': '8', x: '10', y: '124', width: '120', height: '40' }));
    expect(overlay.resolveInsertLine(ref, 60, 180).line).toBe(8);
    var ph = makeOverlay(withTail({ 'data-type': 'note', 'data-line': '6', x: '0', y: '0', width: '1', height: '1' }));
    var r = overlay.resolveInsertLine(ph, 60, 170);
    expect(r.line).toBe(5);
    expect(r.position).toBe('after');
  });

  test('先頭の区切り線より上を押すと区切り線の前 (最初のメッセージの前ではない)', function() {
    var ov = makeOverlay([
      { 'data-type': 'source-line', 'data-src-kind': 'divider', 'data-line': '4', x: '10', y: '40', width: '120', height: '20' },
      { 'data-type': 'message', 'data-line': '5', x: '20', y: '70', width: '80', height: '30' },
    ]);
    var res = overlay.resolveInsertLine(ov, 60, 30);
    expect(res.line).toBe(4);
    expect(res.position).toBe('before');
  });

  test('markStatementEnds: 注釈・枠・複数行の ref に終わりの行を付け、1 行のものには付けない', function() {
    var t = ['@startuml', 'participant App', 'participant Drv', 'App -> Drv : init()',
      'note over App', 'おわり', 'end note',
      'alt ok', 'App -> Drv : x', 'end',
      'ref over App, Drv', '後片付け', 'end ref',
      'ref over App : 1 行',
      'note over Drv : 1 行',
      '== 終了 ==',
      '@enduml'].join('\n');
    var ov = makeOverlay([
      { 'data-type': 'note', 'data-line': '5' },
      { 'data-type': 'group', 'data-line': '8' },
      { 'data-type': 'source-line', 'data-line': '11' },
      { 'data-type': 'source-line', 'data-line': '14' },
      { 'data-type': 'note', 'data-line': '15' },
      { 'data-type': 'source-line', 'data-line': '16' },
    ]);
    overlay.markStatementEnds(ov, seq.parseSequence(t), t);
    function endOf(type, line) {
      return ov.querySelector('rect[data-type="' + type + '"][data-line="' + line + '"]').getAttribute('data-line-end');
    }
    expect(endOf('note', 5)).toBe('7');
    expect(endOf('group', 8)).toBe('10');
    expect(endOf('source-line', 11)).toBe('13');
    expect(endOf('source-line', 14)).toBeNull();
    expect(endOf('note', 15)).toBeNull();
    expect(endOf('source-line', 16)).toBeNull();
  });
});

global.window = prevWindow;
global.document = prevDocument;
