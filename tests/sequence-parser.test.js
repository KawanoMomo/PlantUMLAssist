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

  test('parses bare autonumber as true', function() {
    var r = seq.parseSequence('@startuml\nautonumber\nA -> B\n@enduml');
    expect(r.meta.autonumber).toBe(true);
  });

  test('parses autonumber with start value', function() {
    var r = seq.parseSequence('@startuml\nautonumber 10\nA -> B\n@enduml');
    expect(r.meta.autonumber).toEqual({ start: 10, step: 1 });
  });

  test('parses autonumber with start and step', function() {
    var r = seq.parseSequence('@startuml\nautonumber 10 5\nA -> B\n@enduml');
    expect(r.meta.autonumber).toEqual({ start: 10, step: 5 });
  });

  test('null autonumber when absent', function() {
    var r = seq.parseSequence('@startuml\nA -> B\n@enduml');
    expect(r.meta.autonumber).toBe(null);
  });

  test('parses alt group', function() {
    var r = seq.parseSequence('@startuml\nalt x > 0\nA -> B\nelse\nA -> C\nend\n@enduml');
    expect(r.groups.length).toBe(1);
    expect(r.groups[0].gtype).toBe('alt');
    expect(r.groups[0].label).toBe('x > 0');
    expect(r.groups[0].endLine).toBeGreaterThan(r.groups[0].line);
  });

  test('parses nested loop', function() {
    var r = seq.parseSequence('@startuml\nloop 3 times\nalt ok\nA -> B\nend\nend\n@enduml');
    expect(r.groups.length).toBe(2);
    expect(r.groups[0].gtype).toBe('loop');
    expect(r.groups[1].gtype).toBe('alt');
    expect(r.groups[1].parentId).toBe(r.groups[0].id);
  });

  test('parses note over', function() {
    var r = seq.parseSequence('@startuml\nparticipant A\nnote over A : hello\n@enduml');
    var notes = r.elements.filter(function(e) { return e.kind === 'note'; });
    expect(notes.length).toBe(1);
    expect(notes[0].position).toBe('over');
    expect(notes[0].targets).toEqual(['A']);
    expect(notes[0].text).toBe('hello');
  });

  test('parses note right of', function() {
    var r = seq.parseSequence('@startuml\nnote right of Bob : side\n@enduml');
    var notes = r.elements.filter(function(e) { return e.kind === 'note'; });
    expect(notes[0].position).toBe('right of');
    expect(notes[0].targets).toEqual(['Bob']);
  });
});
