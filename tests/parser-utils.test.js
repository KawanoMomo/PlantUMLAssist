'use strict';
var parserUtils = (typeof window !== 'undefined' && window.MA && window.MA.parserUtils)
  || (global.window && global.window.MA && global.window.MA.parserUtils);

describe('detectDiagramType — PlantUML', function() {
  test('detects sequence from participant', function() {
    expect(parserUtils.detectDiagramType('@startuml\nparticipant Alice\n@enduml')).toBe('plantuml-sequence');
  });
  test('detects sequence from message', function() {
    expect(parserUtils.detectDiagramType('@startuml\nAlice -> Bob: hi\n@enduml')).toBe('plantuml-sequence');
  });
  test('detects class from class keyword', function() {
    expect(parserUtils.detectDiagramType('@startuml\nclass Foo\n@enduml')).toBe('plantuml-class');
  });
  test('detects state', function() {
    expect(parserUtils.detectDiagramType('@startuml\nstate Idle\n@enduml')).toBe('plantuml-state');
  });
  test('detects usecase', function() {
    expect(parserUtils.detectDiagramType('@startuml\nusecase Login\n@enduml')).toBe('plantuml-usecase');
  });
  test('detects component', function() {
    expect(parserUtils.detectDiagramType('@startuml\n[A] --> [B]\n@enduml')).toBe('plantuml-component');
  });
  test('skips comments', function() {
    expect(parserUtils.detectDiagramType("@startuml\n' comment\nparticipant Alice\n@enduml")).toBe('plantuml-sequence');
  });
  test('returns null for empty', function() {
    expect(parserUtils.detectDiagramType('')).toBeNull();
  });
  test('detects usecase from actor + (Login) short form', function() {
    expect(parserUtils.detectDiagramType('@startuml\nactor User\n(Login)\n@enduml')).toBe('plantuml-usecase');
  });
  test('detects usecase from package + actor combo', function() {
    expect(parserUtils.detectDiagramType('@startuml\npackage Auth {\nactor U\n}\n@enduml')).toBe('plantuml-usecase');
  });
  test('detects component from component keyword', function() {
    expect(parserUtils.detectDiagramType('@startuml\ncomponent WebApp\n@enduml')).toBe('plantuml-component');
  });
  test('detects component from [X] short form (with non-* first char)', function() {
    expect(parserUtils.detectDiagramType('@startuml\n[A] -- [B]\n@enduml')).toBe('plantuml-component');
  });
  test('does not confuse [*] with [X] (state vs component priority)', function() {
    expect(parserUtils.detectDiagramType('@startuml\n[*] --> Idle\nstate Idle\n@enduml')).toBe('plantuml-state');
  });
  test('detects class diagram by class keyword', function() {
    expect(parserUtils.detectDiagramType('@startuml\nclass Foo\n@enduml')).toBe('plantuml-class');
  });
  test('detects class diagram by abstract keyword', function() {
    expect(parserUtils.detectDiagramType('@startuml\nabstract class Shape\n@enduml')).toBe('plantuml-class');
  });
  test('detects class diagram by enum keyword', function() {
    expect(parserUtils.detectDiagramType('@startuml\nenum Color { RED }\n@enduml')).toBe('plantuml-class');
  });
  test('detects class diagram by inheritance arrow', function() {
    expect(parserUtils.detectDiagramType('@startuml\nFoo --|> Bar\n@enduml')).toBe('plantuml-class');
  });
  test('detects plantuml-activity from start + action', function() {
    var t = '@startuml\nstart\n:Hello;\nstop\n@enduml';
    expect(parserUtils.detectDiagramType(t)).toBe('plantuml-activity');
  });
  test('detects plantuml-activity from while loop', function() {
    var t = '@startuml\nwhile (a)\n:body;\nendwhile\n@enduml';
    expect(parserUtils.detectDiagramType(t)).toBe('plantuml-activity');
  });
  test('does NOT detect activity for class diagram with action-like text', function() {
    var t = '@startuml\nclass Foo\nclass Bar\nFoo --|> Bar\n@enduml';
    expect(parserUtils.detectDiagramType(t)).toBe('plantuml-class');
  });
  test('detects plantuml-state from state + transition', function() {
    var t = '@startuml\nstate A\nstate B\nA --> B\n@enduml';
    expect(parserUtils.detectDiagramType(t)).toBe('plantuml-state');
  });
  test('detects plantuml-state from [*] pseudo-state', function() {
    var t = '@startuml\n[*] --> A\n@enduml';
    expect(parserUtils.detectDiagramType(t)).toBe('plantuml-state');
  });
  test('does NOT misdetect class diagram as state', function() {
    var t = '@startuml\nclass Foo\n@enduml';
    expect(parserUtils.detectDiagramType(t)).toBe('plantuml-class');
  });
});

// BLK-builder-20260908-0743-4-red: 空のシーケンス図に actor を 1 人足しただけで
// 図種が UseCase へ載せ替わり、「末尾に追加」ペインが消えて 2 人目を足せなかった。
// actor しか無い間は「決められない」と答えさせ、選んである図種を保たせる。
describe('isAmbiguousType — actor だけの図は図種を決めない', function() {
  test('actor 宣言だけなら ambiguous', function() {
    expect(parserUtils.isAmbiguousType('@startuml\nactor User\n@enduml')).toBe(true);
  });
  test('actor が複数でも ambiguous', function() {
    expect(parserUtils.isAmbiguousType('@startuml\nactor User\nactor Admin\n@enduml')).toBe(true);
  });
  test('空文字は ambiguous', function() {
    expect(parserUtils.isAmbiguousType('')).toBe(true);
    expect(parserUtils.isAmbiguousType('@startuml\n@enduml')).toBe(true);
  });
  test('skinparam / title は図種を決めないので ambiguous のまま', function() {
    expect(parserUtils.isAmbiguousType('@startuml\ntitle 認証\nactor User\n@enduml')).toBe(true);
  });
  test('participant が来たら決まる', function() {
    expect(parserUtils.isAmbiguousType('@startuml\nactor User\nparticipant System\n@enduml')).toBe(false);
  });
  test('メッセージが来たら決まる', function() {
    expect(parserUtils.isAmbiguousType('@startuml\nactor User\nUser -> System : login\n@enduml')).toBe(false);
  });
  test('usecase が来たら決まる', function() {
    expect(parserUtils.isAmbiguousType('@startuml\nactor User\nusecase Login\n@enduml')).toBe(false);
  });
  test('コメント行は図種を決めない', function() {
    expect(parserUtils.isAmbiguousType("@startuml\n' メモ\nactor User\n@enduml")).toBe(true);
  });
});

// BLK-owner-20260924-2232-2: コンポーネント図・ユースケース図で境界を先に置くと、本文は
// `package "Mcal" {` / `}` だけになる。PlantUML はこれをクラス図として描き、右パネルが
// クラスの追加フォームに替わって、コンポーネント・ユースケースを 1 つも足せなくなっていた。
// 境界の開き行と閉じ括弧しか無い間は「決められない」と答え、選んである図種を保たせる。
describe('isAmbiguousType — 境界だけの本文は図種を決めない', function() {
  [
    'package "Mcal" {',
    'rectangle "ECU" {',
    'node Server {',
    'folder "src" {',
    'frame "F1" {',
    'cloud "AWS" {',
    'package "Mcal" <<Layer>> {',
    'rectangle "ECU" #lightblue {',
    'package "Mcal" as M {',
  ].forEach(function(open) {
    test(open + ' と } だけなら ambiguous', function() {
      expect(parserUtils.isAmbiguousType('@startuml\n' + open + '\n}\n@enduml')).toBe(true);
    });
  });
  test('入れ子の境界だけでも ambiguous', function() {
    expect(parserUtils.isAmbiguousType('@startuml\npackage "Mcal" {\n  rectangle "Dio" {\n  }\n}\n@enduml')).toBe(true);
  });
  test('境界と actor だけでも ambiguous (シーケンス・ユースケースのどちらもあり得る)', function() {
    expect(parserUtils.isAmbiguousType('@startuml\nactor User\npackage "ECU" {\n}\n@enduml')).toBe(true);
  });
  test('境界の中に component が来たら決まる', function() {
    var t = '@startuml\npackage "Mcal" {\n  component Dio\n}\n@enduml';
    expect(parserUtils.isAmbiguousType(t)).toBe(false);
    expect(parserUtils.detectDiagramType(t)).toBe('plantuml-component');
  });
  test('境界の中に usecase が来たら決まる', function() {
    var t = '@startuml\nrectangle "ECU" {\n  usecase Init\n}\n@enduml';
    expect(parserUtils.isAmbiguousType(t)).toBe(false);
    expect(parserUtils.detectDiagramType(t)).toBe('plantuml-usecase');
  });
  test('境界の中に class が来たら決まる', function() {
    var t = '@startuml\npackage "Mcal" {\n  class Dio\n}\n@enduml';
    expect(parserUtils.isAmbiguousType(t)).toBe(false);
    expect(parserUtils.detectDiagramType(t)).toBe('plantuml-class');
  });
  test('namespace (クラス図だけの語) や波括弧の無い node (部品) は境界だけの本文として扱わない', function() {
    expect(parserUtils.isAmbiguousType('@startuml\nnamespace N {\n}\n@enduml')).toBe(false);
    expect(parserUtils.isAmbiguousType('@startuml\nnode Server\n@enduml')).toBe(false);
  });
});

// BLK-migrator-20260923-1409: `agent` と矢印だけの component 図が、矢印を根拠に
// sequence と読まれていた。図種を外すと選択枠のモジュールごと外れ、枠が 1 つも出ない。
describe('detectDiagramType 波括弧の無い component 要素', function() {
  test('agent 宣言 + 矢印だけの図は component', function() {
    var t = ['@startuml', 'left to right direction', 'agent "Published Event" as event',
             'node iotRule', 'event --> iotRule : JSON message', '@enduml'].join('\n');
    expect(parserUtils.detectDiagramType(t)).toBe('plantuml-component');
  });
  test('参加者の宣言がある図は今までどおり sequence', function() {
    var t = ['@startuml', 'participant A', 'database B', 'A -> B : read', '@enduml'].join('\n');
    expect(parserUtils.detectDiagramType(t)).toBe('plantuml-sequence');
  });
  test('actor のある図は component に倒さない', function() {
    var t = ['@startuml', 'actor User', 'node Server', 'User --> Server : use', '@enduml'].join('\n');
    expect(parserUtils.detectDiagramType(t)).toBe('plantuml-sequence');
  });
});
