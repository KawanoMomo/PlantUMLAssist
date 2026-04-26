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
});
