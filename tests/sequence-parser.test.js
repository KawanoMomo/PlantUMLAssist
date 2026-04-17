'use strict';
var seq = (typeof window !== 'undefined' && window.MA && window.MA.modules && window.MA.modules.plantumlSequence)
  || (global.window && global.window.MA && global.window.MA.modules && global.window.MA.modules.plantumlSequence);

describe('parseSequence', function() {
  test('parses title', function() {
    var r = seq.parseSequence('@startuml\ntitle My Flow\n@enduml');
    expect(r.meta.title).toBe('My Flow');
  });

  test('parses actor participant', function() {
    var r = seq.parseSequence('@startuml\nactor User\n@enduml');
    expect(r.elements.length).toBe(1);
    expect(r.elements[0].ptype).toBe('actor');
    expect(r.elements[0].id).toBe('User');
  });

  test('parses participant with as alias', function() {
    var r = seq.parseSequence('@startuml\nparticipant "Login Server" as LS\n@enduml');
    expect(r.elements[0].id).toBe('LS');
    expect(r.elements[0].label).toBe('Login Server');
  });

  test('parses message with label', function() {
    var r = seq.parseSequence('@startuml\nparticipant A\nparticipant B\nA -> B : hello\n@enduml');
    expect(r.relations.length).toBe(1);
    expect(r.relations[0].from).toBe('A');
    expect(r.relations[0].to).toBe('B');
    expect(r.relations[0].arrow).toBe('->');
    expect(r.relations[0].label).toBe('hello');
  });

  test('parses message without explicit participant', function() {
    var r = seq.parseSequence('@startuml\nA -> B : hi\n@enduml');
    expect(r.elements.length).toBe(2);
    expect(r.relations.length).toBe(1);
  });

  test('parses multiple arrow types', function() {
    var r = seq.parseSequence('@startuml\nA -> B\nA --> B\nA ->> B\nA <- B\n@enduml');
    expect(r.relations.length).toBe(4);
    expect(r.relations[0].arrow).toBe('->');
    expect(r.relations[1].arrow).toBe('-->');
    expect(r.relations[2].arrow).toBe('->>');
    expect(r.relations[3].arrow).toBe('<-');
  });

  test('ignores comments and @startuml/@enduml', function() {
    var r = seq.parseSequence("@startuml\n' this is comment\nactor A\n@enduml");
    expect(r.elements.length).toBe(1);
  });
});
