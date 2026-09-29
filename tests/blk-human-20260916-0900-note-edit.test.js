'use strict';
// BLK-human-20260916-0900: 置いた注釈の位置・対象・上下の順を GUI から変える。
// 行の読み書きと上下移動は src/core/note-edit.js の純関数で守る。
var W = (typeof window !== 'undefined' && window.MA) ? window : global.window;
var NE = W.MA.noteEdit;
var seq = W.MA.modules.plantumlSequence;

function L(arr) { return arr.join('\n'); }

describe('noteEdit.readSeqNote', function() {
  test('1 行形の over A, B を複数対象で読む', function() {
    var n = NE.readSeqNote(['note over A, B : hi'], 0);
    expect(n.position).toBe('over');
    expect(n.targets).toEqual(['A', 'B']);
    expect(n.text).toBe('hi');
    expect(n.endIdx).toBe(0);
  });
  test('ブロック形は end note までを本文にする', function() {
    var n = NE.readSeqNote(['note right of B', '  l1', '  l2', 'end note', 'A -> B'], 0);
    expect(n.text).toBe('l1\nl2');
    expect(n.endIdx).toBe(3);
  });
  test('hnote / rnote と色付きも拾う', function() {
    var h = NE.readSeqNote(['hnote over A #pink : c'], 0);
    expect(h.shape).toBe('hnote');
    expect(h.color).toBe('#pink');
    expect(h.text).toBe('c');
    var r = NE.readSeqNote(['rnote left of A', 'x', 'endrnote'], 0);
    expect(r.shape).toBe('rnote');
    expect(r.endIdx).toBe(2);
  });
  test('閉じていないブロックは後続の行を本文に飲み込まない', function() {
    var n = NE.readSeqNote(['note over A', 'A -> B : m'], 0);
    expect(n.endIdx).toBe(0);
  });
});

describe('noteEdit.updateSeqNote', function() {
  var DSL = L(['@startuml', 'participant A', 'participant B', 'note over A : memo', 'A -> B : m', '@enduml']);
  test('over A → right of B', function() {
    var t = NE.updateSeqNote(DSL, 4, 'position', 'right of');
    t = NE.updateSeqNote(t, 4, 'targets', ['B']);
    expect(t.split('\n')[3]).toBe('note right of B : memo');
  });
  test('over A,B にする', function() {
    expect(NE.updateSeqNote(DSL, 4, 'targets', ['A', 'B']).split('\n')[3]).toBe('note over A, B : memo');
  });
  test('left of にすると対象は 1 つに寄る', function() {
    var t = NE.updateSeqNote(NE.updateSeqNote(DSL, 4, 'targets', ['A', 'B']), 4, 'position', 'left of');
    expect(t.split('\n')[3]).toBe('note left of A : memo');
  });
  test('ブロック形の対象を変えても本文と end note を保つ', function() {
    var d = L(['note over A', '  l1', '  l2', 'end note', 'A -> B']);
    expect(NE.updateSeqNote(d, 1, 'targets', 'A, B')).toBe(L(['note over A, B', '  l1', '  l2', 'end note', 'A -> B']));
  });
  test('hnote の形と色を保つ', function() {
    expect(NE.updateSeqNote('hnote over A #pink : c', 1, 'position', 'right of')).toBe('hnote right of A #pink : c');
  });
  test('対象を空にはしない', function() {
    expect(NE.updateSeqNote(DSL, 4, 'targets', [])).toBe(DSL);
  });
});

describe('noteEdit.moveBlock', function() {
  var D = L(['@startuml', 'A -> B : 1', 'note over A : n', 'A -> B : 2', '@enduml']);
  test('上へ: 前のメッセージと入れ替わる', function() {
    var r = NE.moveBlock(D, 3, 3, -1);
    expect(r.text).toBe(L(['@startuml', 'note over A : n', 'A -> B : 1', 'A -> B : 2', '@enduml']));
    expect(r.line).toBe(2);
  });
  test('下へ: 次のメッセージと入れ替わる', function() {
    var r = NE.moveBlock(D, 3, 3, 1);
    expect(r.text).toBe(L(['@startuml', 'A -> B : 1', 'A -> B : 2', 'note over A : n', '@enduml']));
    expect(r.line).toBe(4);
  });
  test('@startuml / @enduml は越えない', function() {
    expect(NE.moveBlock(L(['@startuml', 'note over A : n', '@enduml']), 2, 2, -1)).toBe(null);
    expect(NE.moveBlock(L(['@startuml', 'note over A : n', '@enduml']), 2, 2, 1)).toBe(null);
  });
  test('ブロック形は塊ごと動き、隣のブロック注釈も塊で越える', function() {
    var d = L(['@startuml', 'note over A', 'x', 'end note', 'note over B', 'y', 'end note', '@enduml']);
    var r = NE.moveBlock(d, 5, 7, -1);
    expect(r.text).toBe(L(['@startuml', 'note over B', 'y', 'end note', 'note over A', 'x', 'end note', '@enduml']));
    expect(r.line).toBe(2);
  });
});

describe('sequence: 複数行 note を 1 件として読む', function() {
  test('本文行をメッセージや参加者として誤読しない', function() {
    var r = seq.parseSequence(L(['@startuml', 'participant A', 'note over A', 'B -> C : not a message', 'end note', 'A -> A : real', '@enduml']));
    var notes = r.elements.filter(function(e) { return e.kind === 'note'; });
    expect(notes.length).toBe(1);
    expect(notes[0].endLine).toBe(5);
    expect(r.relations.length).toBe(1);
  });
  test('deleteLineOrNote はブロックを丸ごと消す', function() {
    expect(seq.deleteLineOrNote(L(['a', 'note over A', 'x', 'end note', 'b']), 2)).toBe(L(['a', 'b']));
  });
  test('moveNote はシーケンス図の注釈を上へ動かす', function() {
    var r = seq.moveNote(L(['@startuml', 'A -> B : 1', 'note over A', 'x', 'end note', '@enduml']), 3, -1);
    expect(r.text).toBe(L(['@startuml', 'note over A', 'x', 'end note', 'A -> B : 1', '@enduml']));
  });
});

// BLK-migrator-20260923-1409: 直前のメッセージに付ける注釈 (`note right` / `note left : x`)。
describe('noteEdit メッセージに付ける注釈', function() {
  test('対象を書かない note right をブロック形で読む', function() {
    var n = NE.readSeqNote(['note right', '  a', 'end note'], 0);
    expect(n.attached).toBe(true);
    expect(n.position).toBe('right');
    expect(n.targets).toEqual([]);
    expect(n.text).toBe('a');
    expect(n.endIdx).toBe(2);
  });
  test('1 行形 note left : x を読み、`left of X` とは混ぜない', function() {
    expect(NE.readSeqNote(['note left : x'], 0).text).toBe('x');
    expect(NE.readSeqNote(['note left of A : x'], 0).attached).toBe(undefined);
  });
  test('本文を直しても `note right` の形のまま書く', function() {
    var out = NE.updateSeqNote('note right\n  a\nend note', 1, 'text', 'b');
    expect(out).toBe('note right : b');
    var out2 = NE.updateSeqNote('note right\n  a\nend note', 1, 'text', 'b\nc');
    expect(out2).toBe('note right\n  b\n  c\nend note');
  });
  test('対象を決めると参加者の横の注釈になる。対象の無いまま over には変えない', function() {
    expect(NE.updateSeqNote('note right : a', 1, 'targets', ['B'])).toBe('note right of B : a');
    expect(NE.updateSeqNote('note right : a', 1, 'position', 'over')).toBe('note right : a');
  });
});
