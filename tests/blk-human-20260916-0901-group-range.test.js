'use strict';
// BLK-human-20260916-0901: alt/loop/opt/par を「どこからどこまで」で囲み、囲んだ後に範囲を伸縮する。
var jsdom = require('jsdom');

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
var prevWindow = global.window;
var prevDocument = global.document;
global.window = dom.window;
global.document = dom.window.document;

var SRC = [
  '../src/core/html-utils.js',
  '../src/core/dsl-utils.js',
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
  '../src/core/sequence-group-range.js',
  '../src/modules/sequence.js',
];
SRC.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} require(p); });

var GR = window.MA.sequenceGroupRange;
var seq = window.MA.modules.plantumlSequence;

// 1 @startuml / 2 m1 / 3 m2 / 4 m3 / 5 m4 / 6 @enduml
var FOUR = ['@startuml', 'A -> B : m1', 'B -> C : m2', 'C --> B : m3', 'B --> A : m4', '@enduml'].join('\n');

describe('範囲を囲める形に丸める (wrapRange)', function() {
  test('2 本目〜3 本目はそのまま囲める', function() {
    var r = GR.wrapRange(FOUR, 3, 4);
    expect(r.ok).toBe(true);
    expect(r.start).toBe(3);
    expect(r.end).toBe(4);
    expect(r.rounded).toBe(false);
  });

  test('逆順に渡しても同じ範囲', function() {
    var r = GR.wrapRange(FOUR, 4, 3);
    expect(r.start).toBe(3);
    expect(r.end).toBe(4);
  });

  test('帯の途中で切れる範囲は帯の端まで広げ、その旨を返す', function() {
    var t = ['@startuml', 'A -> B : m1', 'activate B', 'B -> C : m2', 'deactivate B', 'B --> A : m3', '@enduml'].join('\n');
    var r = GR.wrapRange(t, 2, 4);
    expect(r.ok).toBe(true);
    expect(r.end).toBe(5);
    expect(r.rounded).toBe(true);
    expect(r.note).toContain('B の帯');
    // 囲んだ結果の DSL で activate と deactivate が同じ枠の中にある。
    var out = seq.wrapWith(t, r.start, r.end, 'alt', 'ok').split('\n');
    expect(out.indexOf('end')).toBeGreaterThan(out.indexOf('deactivate B'));
  });

  test('既存の alt を半分だけ跨ぐ範囲は、その alt を丸ごと含める', function() {
    var t = ['@startuml', 'A -> B : m1', 'alt x', 'B -> C : m2', 'end', 'B --> A : m3', '@enduml'].join('\n');
    var r = GR.wrapRange(t, 2, 4);
    expect(r.ok).toBe(true);
    expect(r.start).toBe(2);
    expect(r.end).toBe(5);
    expect(r.note).toContain('既にある枠');
  });

  test('else を跨いで分岐の外へ出る範囲は囲めない', function() {
    var t = ['@startuml', 'alt x', 'A -> B : m1', 'else y', 'B -> A : m2', 'end', '@enduml'].join('\n');
    var r = GR.wrapRange(t, 3, 5);
    // else を含むと alt 全体に丸まり、alt 全体を囲む形になる (枠を壊さない)。
    expect(r.ok).toBe(true);
    expect(r.start).toBe(2);
    expect(r.end).toBe(6);
  });
});

describe('範囲の文 (describe)', function() {
  test('N 本のメッセージ (A→B … C→D)', function() {
    expect(GR.describe(FOUR, 3, 4)).toBe('2 本のメッセージ (B→C … C→B)');
    expect(GR.describe(FOUR, 2, 2)).toBe('1 本のメッセージ (A→B)');
  });
  test('間のメッセージ行を全部返す', function() {
    expect(GR.messageLinesBetween(FOUR, 5, 3)).toEqual([3, 4, 5]);
  });
});

describe('囲んだ後の範囲を 1 本ずつ伸縮する (moveEdge)', function() {
  var W = ['@startuml', 'A -> B : m1', 'alt ok', 'B -> C : m2', 'C --> B : m3', 'end', 'B --> A : m4', '@enduml'].join('\n');

  test('終了を 1 本伸ばすと end が次のメッセージの後ろへ動く', function() {
    var r = GR.moveEdge(W, 3, 6, 'end', 1);
    expect(r.ok).toBe(true);
    expect(r.text.split('\n')).toEqual(['@startuml', 'A -> B : m1', 'alt ok', 'B -> C : m2', 'C --> B : m3', 'B --> A : m4', 'end', '@enduml']);
    expect(r.openLine).toBe(3);
    expect(r.endLine).toBe(7);
  });

  test('開始を 1 本広げると alt 行が前のメッセージの前へ動く', function() {
    var r = GR.moveEdge(W, 3, 6, 'start', -1);
    expect(r.ok).toBe(true);
    expect(r.text.split('\n').slice(1, 3)).toEqual(['alt ok', 'A -> B : m1']);
    expect(r.openLine).toBe(2);
  });

  test('終了を 1 本縮める / 開始を 1 本縮める', function() {
    expect(GR.moveEdge(W, 3, 6, 'end', -1).text.split('\n').slice(2, 5)).toEqual(['alt ok', 'B -> C : m2', 'end']);
    expect(GR.moveEdge(W, 3, 6, 'start', 1).text.split('\n').slice(3, 6)).toEqual(['alt ok', 'C --> B : m3', 'end']);
  });

  test('中身が 1 本なら縮められない・後ろが無ければ伸ばせない', function() {
    var one = ['@startuml', 'alt ok', 'A -> B : m1', 'end', '@enduml'].join('\n');
    expect(GR.moveEdge(one, 2, 4, 'end', -1).ok).toBe(false);
    expect(GR.moveEdge(one, 2, 4, 'end', 1).ok).toBe(false);
    expect(GR.moveEdge(one, 2, 4, 'start', -1).ok).toBe(false);
  });

  test('帯の片側だけを外す縮め方は断る', function() {
    var t = ['@startuml', 'alt ok', 'A -> B : m1', 'activate B', 'B -> C : m2', 'deactivate B', 'end', '@enduml'].join('\n');
    var r = GR.moveEdge(t, 2, 7, 'end', -1);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('縮められません');
  });

  test('帯の途中まで伸ばすと帯の端まで丸めて note を返す', function() {
    var t = ['@startuml', 'alt ok', 'A -> B : m1', 'end', 'B -> C : m2', 'activate C', 'C --> B : m3', 'deactivate C', '@enduml'].join('\n');
    var r = GR.moveEdge(t, 2, 4, 'end', 1);
    expect(r.ok).toBe(true);
    expect(r.note).toBe('');
    var r2 = GR.moveEdge(r.text, r.openLine, r.endLine, 'end', 1);
    expect(r2.ok).toBe(true);
    var lines = r2.text.split('\n');
    expect(lines.indexOf('end')).toBeGreaterThan(lines.indexOf('deactivate C'));
    expect(r2.note).toContain('C の帯');
  });

  test('入れ子のブロックは 1 本として丸ごと動く', function() {
    var t = ['@startuml', 'alt ok', 'A -> B : m1', 'end', 'loop 3', 'B -> C : m2', 'end', '@enduml'].join('\n');
    var r = GR.moveEdge(t, 2, 4, 'end', 1);
    expect(r.ok).toBe(true);
    expect(r.text.split('\n')).toEqual(['@startuml', 'alt ok', 'A -> B : m1', 'loop 3', 'B -> C : m2', 'end', 'end', '@enduml']);
    // 伸ばした後の parse で alt と loop が正しく入れ子になる。
    var p = seq.parseSequence(r.text);
    expect(p.groups[0].endLine).toBe(7);
    expect(p.groups[1].parentId).toBe(p.groups[0].id);
  });

  test('外側の alt の end を越えては伸ばせない', function() {
    var t = ['@startuml', 'alt x', 'loop 2', 'A -> B : m1', 'end', 'end', 'B -> A : m2', '@enduml'].join('\n');
    expect(GR.moveEdge(t, 3, 5, 'end', 1).ok).toBe(false);
  });
});

describe('フォームと Shift+クリック', function() {
  test('フォームに範囲の文と丸めの注記が出る', function() {
    var html = seq.wrapFormHtml('alt', { start: 3, end: 4, text: '2 本のメッセージ (B→C … C→B)', note: '丸めました' });
    expect(html).toContain('id="seq-wrap-range"');
    expect(html).toContain('2 本のメッセージ (B→C … C→B)');
    expect(html).toContain('丸めました');
  });

  test('一括の break などもフォームの種類に出る (4 択以外を渡したときだけ足す)', function() {
    expect((seq.wrapFormHtml('alt').match(/<option /g) || []).length).toBe(4);
    expect(seq.wrapFormHtml('break')).toContain('value="break" selected');
  });

  test('1 本目を選んで Shift+クリックで 3 本目 → 間の 2 本目も選ばれる', function() {
    var p = seq.parseSequence(FOUR);
    var m = p.relations.filter(function(r) { return r.kind === 'message'; });
    var out = seq.expandShiftSelection(FOUR, [{ type: 'message', id: m[0].id, line: m[0].line }],
      { type: 'message', id: m[2].id, line: m[2].line });
    expect(out.map(function(s) { return s.line; })).toEqual([2, 3, 4]);
    expect(out[0].line).toBe(2);
  });

  test('メッセージ以外が混じる選択は従来の Shift (足し引き) に任せる', function() {
    expect(seq.expandShiftSelection(FOUR, [{ type: 'participant', id: 'A', line: 1 }], { type: 'message', id: 'x', line: 3 })).toBe(null);
  });
});

// 後始末 (blk-human-20260915-1204 と同じ)。後のテストが自分の window に登録し直せるようにする。
SRC.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
global.window = prevWindow;
global.document = prevDocument;
