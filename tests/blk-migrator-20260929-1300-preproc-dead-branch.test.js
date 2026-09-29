'use strict';
// BLK-migrator-20260929-1300: `!ifdef U … !else … !endif` の両枝に `A -> B` があると、描かれるのは片方だけなのに
// 当て方と下端の件数は両方を数え、正しい図に「図の要素 1 個に選択枠を当てられませんでした」が出ていた。
// seq-23 の `hide unlinked` (メッセージの無い参加者は描かれない) も同じ誤警告だった。
// 直し方: プリプロセッサの条件を本文の上で解き (src/core/preproc-live.js)、描かれない枝の行と
// hide unlinked で隠れる参加者を当て方と件数から外す。解けない条件は今までどおり描かれる側に置く。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

if (!global.window || !global.window.document) {
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
  var prevMA = global.window && global.window.MA;
  global.window = dom.window;
  if (prevMA) global.window.MA = prevMA;
  global.DOMParser = dom.window.DOMParser;
}
if (!global.document) global.document = global.window.document;
var document = global.window.document;

[
  'html-utils', 'dsl-utils', 'preproc-live', 'note-edit', 'regex-parts', 'id-normalizer',
  'dsl-updater', 'text-updater', 'parser-utils', 'line-resolver',
  'overlay-builder', 'selection-router', 'sequence-participant-zone',
  'sequence-autonumber', 'sequence-activation-insert', 'outline',
].forEach(function(m) {
  try { delete require.cache[require.resolve('../src/core/' + m + '.js')]; } catch (e) {}
  try { require('../src/core/' + m + '.js'); } catch (e) {}
});
try { delete require.cache[require.resolve('../src/modules/sequence.js')]; } catch (e) {}
require('../src/modules/sequence.js');
try { delete require.cache[require.resolve('../src/ui/sequence-overlay.js')]; } catch (e) {}
require('../src/ui/sequence-overlay.js');

var window = global.window;
var PL = window.MA.preprocLive;
var seq = window.MA.modules.plantumlSequence;
var overlay = window.MA.sequenceOverlay;
var outline = window.MA.outline;

function load(name) {
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/' + name + '.svg'), 'utf8');
  var dslText = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/' + name + '.puml'), 'utf8').replace(/\r\n/g, '\n');
  var div = document.createElement('div');
  div.innerHTML = svgText;
  return { svgEl: div.querySelector('svg'), parsed: seq.parseSequence(dslText), dsl: dslText };
}
function build(f) {
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  var res = overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl, f.dsl);
  return { overlayEl: overlayEl, res: res };
}
function totalUnmatched(res) {
  var u = (res && res.unmatched) || {};
  // app.js が帯を出すときの足し方と同じ
  return (u.participant || 0) + (u.message || 0) + (u.note || 0) + (u.activation || 0);
}
function deadList(text) { return Object.keys(PL.deadLines(text)).map(Number).sort(function(a, b) { return a - b; }); }

describe('BLK-migrator-20260929-1300 描かれない枝を当て損ねに数えない', function() {
  test('preproc-live: !define した名前の !ifdef は then 側が描かれ、!else 側の行が描かれない', function() {
    var t = '@startuml\nparticipant A\nparticipant B\n!define U\n!ifdef U\nA -> B : a\n!else\nA -> B : b\n!endif\n@enduml';
    expect(deadList(t)).toEqual([8]);
  });

  test('preproc-live: !undef の後の !ifndef は描かれる、!ifdef は描かれない', function() {
    var t = '!define X\n!undef X\n!ifdef X\nA -> B : no\n!endif\n!ifndef X\nA -> B : yes\n!endif';
    expect(deadList(t)).toEqual([4]);
  });

  test('preproc-live: !if / !elseif / !else を変数と比較で解く。入れ子の外が描かれなければ中も描かれない', function() {
    var t = [
      '!$mode = "b"',
      '!if $mode == "a"',
      'A -> B : a',          // 3 描かれない
      '!elseif $mode == "b"',
      'A -> B : b',          // 5
      '!if %false()',
      'A -> B : inner',      // 7 描かれない
      '!endif',
      '!else',
      'A -> B : c',          // 10 描かれない
      '!ifdef Y',
      'A -> B : deep',       // 12 描かれない
      '!endif',
      '!endif',
    ].join('\n');
    expect(deadList(t)).toEqual([3, 7, 10, 12]);
  });

  test('preproc-live: 解けない条件 (!include の後の名前・知らない関数) の枝は描かれる側に置く', function() {
    expect(deadList('!include common.iuml\n!ifdef FROM_INCLUDE\nA -> B : x\n!else\nA -> B : y\n!endif')).toEqual([]);
    expect(deadList('!if %some_fn("x")\nA -> B : x\n!else\nA -> B : y\n!endif')).toEqual([]);
    // 分からない枝の後でも、真と言い切れる枝の後ろは描かれない
    expect(deadList('!if %some_fn()\nA -> B : x\n!elseif %true()\nA -> B : y\n!else\nA -> B : z\n!endif')).toEqual([6]);
  });

  test('preproc-live: 手続きの本体の中の条件は呼ぶまで解かない', function() {
    var t = '!procedure $p()\n!ifdef NOPE\nA -> B : x\n!endif\n!endprocedure\n$p()';
    expect(deadList(t)).toEqual([]);
  });

  test('最小再現: 帯を出さず (当て損ね 0)、描かれた 1 本を a の行に当てる', function() {
    var f = load('preproc-ifdef-else-seq');
    var b = build(f);
    expect(totalUnmatched(b.res)).toBe(0);
    var msgs = b.overlayEl.querySelectorAll('rect[data-type="message"]');
    expect(msgs.length).toBe(1);
    expect(msgs[0].getAttribute('data-line')).toBe('6');
  });

  test('最小再現: 下端の件数は参加者 2・メッセージ 1', function() {
    var dsl = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/preproc-ifdef-else-seq.puml'), 'utf8');
    var counts = outline.build(dsl).counts;
    expect(counts.elements).toBe(2);
    expect(counts.relations).toBe(1);
  });

  test('描かれない枝が先にあっても、描かれた矢印は描かれた側の行に当たる (順番でずれない)', function() {
    var f = load('preproc-ifndef-first-dead-seq');
    var b = build(f);
    expect(totalUnmatched(b.res)).toBe(0);
    var lines = Array.prototype.map.call(b.overlayEl.querySelectorAll('rect[data-type="message"]'),
      function(r) { return r.getAttribute('data-line'); }).sort();
    expect(lines).toEqual(['10', '8']);
  });

  test('common-20 (!define / !undef / !ifdef / !ifndef): 帯を出さない', function() {
    var b = build(load('common-20-preproc-include-local-undef'));
    expect(totalUnmatched(b.res)).toBe(0);
  });

  test('seq-23 (hide unlinked): 描かれない参加者を当て損ねに数えない', function() {
    var f = load('seq-23-hide-unlinked-note-across');
    expect(f.parsed.meta.hideUnlinked).toBe(true);
    var b = build(f);
    expect(totalUnmatched(b.res)).toBe(0);
    // 描かれた参加者 3 人の枠はそのまま出る
    ['Client', 'Server', 'Cache'].forEach(function(id) {
      expect(b.overlayEl.querySelectorAll('rect[data-type="participant"][data-id="' + id + '"]').length).toBeGreaterThan(0);
    });
  });

  test('一覧 (パース結果) には描かれない枝の要素も残る (本文から直せるように)', function() {
    var f = load('preproc-ifdef-else-seq');
    expect(f.parsed.relations.length).toBe(2);
    expect(f.parsed.meta.deadLines[8]).toBe(true);
  });
});
