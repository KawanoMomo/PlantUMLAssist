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
