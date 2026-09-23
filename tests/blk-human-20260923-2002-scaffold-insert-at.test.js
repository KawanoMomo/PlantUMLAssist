'use strict';
// BLK-human-20260923-2002: 「シーケンス構成をまとめて追加」を末尾だけでなく、選んだ位置
// (メッセージの前後・帯の内外・alt の中) に入れる。宣言は参加者の欄、本文だけが挿入位置に入る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
require('../src/core/sequence-activation-insert.js');
require('../src/core/sequence-participant-zone.js');
try { delete require.cache[require.resolve('../src/core/sequence-scaffold.js')]; } catch (e) {}
require('../src/core/sequence-scaffold.js');
var SS = global.window.MA.sequenceScaffold;

var NL = '\n';
// 4 本のメッセージ。2 本目 (B --> A : res) は B の帯の最後の要素。
var BAND = [
  '@startuml',          // 1
  'participant A',      // 2
  'participant B',      // 3
  'participant C',      // 4
  'A -> B : req',       // 5
  'activate B',         // 6
  'B --> A : res',      // 7
  'deactivate B',       // 8
  'A -> C : send',      // 9
  'C --> A : ack',      // 10
  '@enduml',            // 11
].join(NL);

function spec3alt() {
  return {
    participants: [],
    messages: [
      { from: 'A', to: 'C', arrow: 'sync', text: 'check' },
      { from: 'C', to: 'A', arrow: 'reply', text: 'ok', inBlock: 'main' },
      { from: 'C', to: 'A', arrow: 'reply', text: 'ng', inBlock: 'else' },
    ],
    block: { kind: 'alt', label: '成功', elseLabel: '失敗' },
  };
}

describe('まとめて追加の挿入位置 (BLK-human-20260923-2002)', function() {
  test('2 本目を選ぶと既定は帯の外: 帯の末尾なので bandEnd が立ち、hint 無しは帯の内側を指す', function() {
    var w = SS.resolveWhere(BAND, { line: 7, position: 'after' });
    expect(w.bandEnd).toBe(true);
    expect(w.zone).toBe('inside');
  });

  test('帯の外を選ぶと deactivate の後ろ、2 本目と 3 本目の間に 3 本と alt が入り、帯は伸びない', function() {
    var base = SS.resolveWhere(BAND, { line: 7, position: 'after' });
    var w = SS.resolveWhere(BAND, { line: 7, position: 'after', hint: { zone: 'outside', bandLine: base.band.activateLine } });
    var res = SS.applyAt(BAND, spec3alt(), w);
    var lines = res.text.split(NL);
    expect(lines.slice(7, 16)).toEqual([
      'deactivate B',
      'A -> C : check',
      'alt 成功',
      '  C --> A : ok',
      'else 失敗',
      '  C --> A : ng',
      'end',
      'A -> C : send',
      'C --> A : ack',
    ]);
    // 帯 (activate B 〜 deactivate B) は元の 2 行のまま
    expect(lines.indexOf('deactivate B')).toBe(7);
    expect(res.bodyStart).toBe(9);
    expect(res.bodyEnd).toBe(14);
  });

  test('挿入先はフォームに文字で出る (`B --> A : res` の後、帯の外側)', function() {
    var base = SS.resolveWhere(BAND, { line: 7, position: 'after' });
    var w = SS.resolveWhere(BAND, { line: 7, position: 'after', hint: { zone: 'outside', bandLine: base.band.activateLine } });
    expect(SS.describeWhere(BAND, w)).toBe('`B --> A : res` の後、帯の外側 (B)');
    var inside = SS.resolveWhere(BAND, { line: 7, position: 'after', hint: { zone: 'inside', bandLine: 6 } });
    expect(SS.describeWhere(BAND, inside)).toBe('`B --> A : res` の後、帯の内側 (B)');
    expect(SS.describeWhere(BAND, null)).toBe('図の末尾 (@enduml の前)');
  });

  test('帯の中を選べば deactivate の手前に入る (帯が伸びる)', function() {
    var w = SS.resolveWhere(BAND, { line: 7, position: 'after', hint: { zone: 'inside', bandLine: 6 } });
    var out = SS.apply(BAND, { participants: [], messages: [{ from: 'B', to: 'C', text: 'x' }] }, w).split(NL);
    expect(out.slice(6, 9)).toEqual(['B --> A : res', 'B -> C : x', 'deactivate B']);
  });

  test('新しい参加者の宣言は参加者の欄に入り、本文だけが挿入位置に入る', function() {
    var w = SS.resolveWhere(BAND, { line: 9, position: 'after' });
    var res = SS.applyAt(BAND, {
      participants: [{ name: 'Log', type: 'database' }],
      messages: [{ from: 'C', to: 'Log', text: 'write' }],
    }, w);
    var lines = res.text.split(NL);
    expect(lines.indexOf('database Log')).toBe(4);   // participant C の直後
    expect(lines[res.bodyStart - 1]).toBe('C -> Log : write');
    expect(lines[res.bodyStart - 2]).toBe('A -> C : send');
  });

  test('alt の中のメッセージを選べば alt の中に入り、字下げも揃う', function() {
    var dsl = ['@startuml', 'A -> B : a', 'alt ok', '  B --> A : r1', 'end', '@enduml'].join(NL);
    var w = SS.resolveWhere(dsl, { line: 4, position: 'after' });
    expect(SS.describeWhere(dsl, w)).toBe('`B --> A : r1` の後、「alt ok」の中');
    var out = SS.apply(dsl, { participants: [], messages: [{ from: 'A', to: 'B', text: 'again' }] }, w).split(NL);
    expect(out.slice(3, 6)).toEqual(['  B --> A : r1', '  A -> B : again', 'end']);
  });

  test('続けて入れる: 前回の最後の行 (end) の後ろを起点にすると、その続きに入る', function() {
    var w = SS.resolveWhere(BAND, { line: 7, position: 'after', hint: { zone: 'outside', bandLine: 6 } });
    var first = SS.applyAt(BAND, spec3alt(), w);
    var w2 = SS.resolveWhere(first.text, { line: first.bodyEnd, position: 'after' });
    var second = SS.applyAt(first.text, { participants: [], messages: [{ from: 'A', to: 'C', text: 'next' }] }, w2);
    var lines = second.text.split(NL);
    expect(lines[first.bodyEnd - 1]).toBe('end');
    expect(lines[first.bodyEnd]).toBe('A -> C : next');
    expect(lines[first.bodyEnd + 1]).toBe('A -> C : send');
  });

  test('閉じ忘れの帯の外に入れるときは deactivate を足して帯を閉じる', function() {
    var dsl = ['@startuml', 'A -> B : a', 'activate B', 'B --> A : r', '@enduml'].join(NL);
    var w = SS.resolveWhere(dsl, { line: 4, position: 'after', hint: { zone: 'outside', bandLine: 3 } });
    var out = SS.apply(dsl, { participants: [], messages: [{ from: 'A', to: 'B', text: 'x' }] }, w).split(NL);
    expect(out.slice(3, 6)).toEqual(['B --> A : r', 'deactivate B', 'A -> B : x']);
  });

  test('位置を渡さなければ従来どおり末尾に入り、宣言は参加者の欄に揃う', function() {
    var out = SS.apply(BAND, { participants: [], messages: [{ from: 'A', to: 'Z', text: 'tail' }] }).split(NL);
    expect(out[out.length - 2]).toBe('A -> Z : tail');
    expect(out.indexOf('participant Z')).toBe(4);
  });
});

describe('まとめて追加の枠 (alt / loop …)', function() {
  test('枠の中の行を alt 〜 end で囲み、else の後の行の前に else を置く', function() {
    expect(SS.plan(BAND, spec3alt()).body).toEqual([
      'A -> C : check', 'alt 成功', '  C --> A : ok', 'else 失敗', '  C --> A : ng', 'end',
    ]);
  });

  test('else の行が枠の中の行より前なら止める', function() {
    var s = spec3alt();
    s.messages[1].inBlock = 'else';
    s.messages[2].inBlock = 'main';
    var v = SS.validate(s, BAND);
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toContain('else の行は');
  });

  test('loop には else を置けない', function() {
    var s = spec3alt();
    s.block.kind = 'loop';
    expect(SS.validate(s, BAND).ok).toBe(false);
  });

  test('枠の行に挟まれた枠外の行は、枠に入る旨を警告する (追加は止めない)', function() {
    var s = { participants: [], messages: [
      { from: 'A', to: 'B', text: '1', inBlock: 'main' },
      { from: 'A', to: 'B', text: '2' },
      { from: 'A', to: 'B', text: '3', inBlock: 'main' },
    ], block: { kind: 'loop', label: '3 回' } };
    var v = SS.validate(s, BAND);
    expect(v.ok).toBe(true);
    expect(v.warnings.join()).toContain('メッセージ 2');
    expect(SS.plan(BAND, s).body).toEqual(['loop 3 回', '  A -> B : 1', '  A -> B : 2', '  A -> B : 3', 'end']);
  });
});
