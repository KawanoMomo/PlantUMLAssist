'use strict';
// BLK-human-20260928-2255-1: ＋ で開いた白紙のシーケンス (`@startuml` / `@enduml` だけ) で図を押すと、挿入のガイド線は
// 出るのに挿入先が決まらず何も開かなかった。メッセージがまだ無い図は図の末尾 (@enduml の前) に入れる。
var W = (typeof window !== 'undefined' && window.MA) ? window : global.window;
var seq = W.MA.modules.plantumlSequence;

describe('BLK-human-20260928-2255-1 白紙の図の挿入先 (resolveTailInsert)', function() {
  test('白紙は @enduml の行の前 (DSL 2 行目)', function() {
    var t = '@startuml\n@enduml';
    var r = seq.resolveTailInsert(t);
    expect(r.line).toBe(2);
    expect(r.position).toBe('before');
    expect(seq.insertTargetLine(r.line, r.position, t)).toBe(2);
  });

  test('参加者だけの図も @enduml の前 (宣言の後ろ)', function() {
    var t = '@startuml\nparticipant A\nparticipant B\n\n@enduml\n';
    var r = seq.resolveTailInsert(t);
    expect(r.line).toBe(5);
    expect(r.position).toBe('before');
  });

  test('@startuml より前の行・CRLF でも @enduml の行を指す', function() {
    var t = "' 見出し\r\n@startuml\r\ntitle T\r\n@enduml\r\n";
    var r = seq.resolveTailInsert(t);
    expect(r.line).toBe(4);
    expect(r.position).toBe('before');
  });

  test('@enduml が無ければ最後の中身の行の後ろ。@startuml が無ければ決めない', function() {
    var r = seq.resolveTailInsert('@startuml\nparticipant A\n');
    expect(r.line).toBe(2);
    expect(r.position).toBe('after');
    expect(seq.resolveTailInsert('A -> B')).toBeNull();
    expect(seq.resolveTailInsert(null)).toBeNull();
  });
});
