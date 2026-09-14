'use strict';
// BLK-builder-20260907-1358-1 (design 5d): UseCase の「その他パレット」の ノート。
// 書式は図種で変わらないので src/core/note-block.js に純関数として置き、
// usecase.js はそれを使う。注釈の本文行が要素として誤読されないことも固定する。
// run-tests.js が sandbox に読み込んだものをそのまま使う。ここで require し直すと、
// require のキャッシュのせいで後続の usecase-parser.test.js が同じモジュールを
// 別の window に登録し直せなくなる (先行テストが global.window を差し替えるため)。
var W = (typeof window !== 'undefined' && window.MA) ? window : global.window;
var NB = W.MA.noteBlock;
var usecase = W.MA.modules.plantumlUsecase;

describe('noteBlock.format', function() {
  test('1 行の本文は 1 行形で書く', function() {
    expect(NB.format('left', 'User', '要確認')).toEqual(['note left of User : 要確認']);
  });
  test('改行を含む本文はブロック形にする', function() {
    expect(NB.format('right', 'L1', '1 行目\n2 行目'))
      .toEqual(['note right of L1', '1 行目', '2 行目', 'end note']);
  });
  test('未知の位置は left に寄せる (壊れた DSL を書かない)', function() {
    expect(NB.format('sideways', 'X', 'a')).toEqual(['note left of X : a']);
  });
  test('本文が空でも 1 行形で書ける', function() {
    expect(NB.format('top', 'X', '')).toEqual(['note top of X : ']);
  });
});

describe('noteBlock.collect', function() {
  var DSL = [
    '@startuml', 'actor User', '(ログイン) as L1', 'User --> L1',
    'note left of User : 社内の利用者だけ',
    'note right of L1',
    '2 要素認証を含む',
    '失敗は 3 回まで',
    'end note',
    '@enduml',
  ].join('\n');

  test('1 行形とブロック形の両方を拾う', function() {
    var notes = NB.collect(DSL);
    expect(notes.length).toBe(2);
    expect(notes[0].targetId).toBe('User');
    expect(notes[0].position).toBe('left');
    expect(notes[0].text).toBe('社内の利用者だけ');
    expect(notes[1].targetId).toBe('L1');
    expect(notes[1].text).toBe('2 要素認証を含む\n失敗は 3 回まで');
  });
  test('ブロック形は開始行と end note の行を持つ', function() {
    var n = NB.collect(DSL)[1];
    expect(n.line).toBe(6);
    expect(n.endLine).toBe(9);
  });
  test('id は出現順', function() {
    expect(NB.collect(DSL).map(function(n) { return n.id; })).toEqual(['__n_0', '__n_1']);
  });
  test('CRLF の図でも拾える', function() {
    expect(NB.collect(DSL.replace(/\n/g, '\r\n')).length).toBe(2);
  });
  test('閉じていないブロックも 1 件として拾う (書きかけで一覧から消えない)', function() {
    var notes = NB.collect('@startuml\nactor User\nnote left of User\n途中まで\n');
    expect(notes.length).toBe(1);
    expect(notes[0].text).toBe('途中まで');
  });
  test('注釈が無ければ空配列', function() {
    expect(NB.collect('@startuml\nactor User\n@enduml')).toEqual([]);
  });
});

describe('noteBlock.update / remove', function() {
  var DSL = '@startuml\nactor User\nnote left of User : 旧\n@enduml';
  test('本文だけ差し替える', function() {
    expect(NB.update(DSL, 3, 3, { text: '新' }))
      .toBe('@startuml\nactor User\nnote left of User : 新\n@enduml');
  });
  test('位置だけ差し替える (本文は残る)', function() {
    expect(NB.update(DSL, 3, 3, { position: 'bottom' }))
      .toBe('@startuml\nactor User\nnote bottom of User : 旧\n@enduml');
  });
  test('本文に改行を入れると 1 行形からブロック形に変わる', function() {
    expect(NB.update(DSL, 3, 3, { text: 'a\nb' }))
      .toBe('@startuml\nactor User\nnote left of User\na\nb\nend note\n@enduml');
  });
  test('ブロック形を 1 行に縮めると end note ごと消える', function() {
    var block = '@startuml\nactor User\nnote left of User\na\nb\nend note\n@enduml';
    expect(NB.update(block, 3, 6, { text: 'c' }))
      .toBe('@startuml\nactor User\nnote left of User : c\n@enduml');
  });
  test('Target は書き換えない (付け替えは別操作)', function() {
    expect(NB.update(DSL, 3, 3, { text: 'x', targetId: 'Other' })).toContain('of User');
  });
  test('注釈でない行を指しても DSL は変わらない', function() {
    expect(NB.update(DSL, 2, 2, { text: 'x' })).toBe(DSL);
  });
  test('remove は 1 行形を 1 行だけ消す', function() {
    expect(NB.remove(DSL, 3, 3)).toBe('@startuml\nactor User\n@enduml');
  });
  test('remove はブロック形を end note ごと消す', function() {
    var block = '@startuml\nactor User\nnote left of User\na\nend note\n@enduml';
    expect(NB.remove(block, 3, 5)).toBe('@startuml\nactor User\n@enduml');
  });
});

describe('usecase の parse — 注釈', function() {
  test('parse が notes を返す', function() {
    var p = usecase.parse('@startuml\nactor User\nnote left of User : メモ\n@enduml');
    expect(p.notes.length).toBe(1);
    expect(p.notes[0].targetId).toBe('User');
  });
  test('注釈の本文行が actor / relation として誤読されない', function() {
    var p = usecase.parse([
      '@startuml', 'actor User', '(ログイン) as L1',
      'note right of L1', 'User --> L1 は関係の説明', ':これはアクターではない:', 'end note',
      '@enduml',
    ].join('\n'));
    expect(p.elements.length).toBe(2);
    expect(p.relations.length).toBe(0);
    expect(p.notes.length).toBe(1);
  });
  test('注釈のある図でも要素と関係はこれまでどおり読める', function() {
    var p = usecase.parse([
      '@startuml', 'actor User', '(ログイン) as L1', 'User --> L1',
      'note left of User : メモ', '@enduml',
    ].join('\n'));
    expect(p.elements.length).toBe(2);
    expect(p.relations.length).toBe(1);
    expect(p.relations[0].from).toBe('User');
  });
  test('注釈が 1 つも無い図では notes は空 (既存の図の読みを変えない)', function() {
    expect(usecase.parse('@startuml\nactor User\n@enduml').notes).toEqual([]);
  });
});

describe('usecase の addNote', function() {
  var BASE = '@startuml\nactor User\n@enduml';

  test('@enduml の前に注釈を足す', function() {
    expect(usecase.addNote(BASE, 'User', 'left', 'メモ'))
      .toBe('@startuml\nactor User\nnote left of User : メモ\n@enduml');
  });
  test('改行を含む本文はブロック形で足す', function() {
    expect(usecase.addNote(BASE, 'User', 'right', 'a\nb'))
      .toBe('@startuml\nactor User\nnote right of User\na\nb\nend note\n@enduml');
  });
  test('足した注釈をそのまま parse で読み戻せる', function() {
    var out = usecase.addNote(BASE, 'User', 'top', 'a\nb');
    var n = usecase.parse(out).notes[0];
    expect(n.position).toBe('top');
    expect(n.text).toBe('a\nb');
  });
  test('updateNote / deleteNote が module から使える', function() {
    var out = usecase.addNote(BASE, 'User', 'left', '旧');
    expect(usecase.updateNote(out, 3, 3, { text: '新' })).toContain('新');
    expect(usecase.deleteNote(out, 3, 3)).toBe(BASE);
  });
});
