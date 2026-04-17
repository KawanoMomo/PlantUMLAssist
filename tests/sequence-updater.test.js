'use strict';
var seq = (typeof window !== 'undefined' && window.MA && window.MA.modules && window.MA.modules.plantumlSequence)
  || (global.window && global.window.MA && global.window.MA.modules && global.window.MA.modules.plantumlSequence);

describe('addParticipant', function() {
  test('adds actor before @enduml', function() {
    var out = seq.addParticipant('@startuml\n@enduml', 'actor', 'Alice');
    expect(out).toContain('actor Alice');
    expect(out.indexOf('actor Alice')).toBeLessThan(out.indexOf('@enduml'));
  });

  test('adds with label + as', function() {
    var out = seq.addParticipant('@startuml\n@enduml', 'participant', 'LS', 'Login Server');
    expect(out).toContain('participant "Login Server" as LS');
  });
});

describe('addMessage', function() {
  test('adds message with label', function() {
    var out = seq.addMessage('@startuml\nactor A\nactor B\n@enduml', 'A', 'B', '->', 'hi');
    expect(out).toContain('A -> B : hi');
  });

  test('adds message without label', function() {
    var out = seq.addMessage('@startuml\n@enduml', 'A', 'B', '-->');
    expect(out).toContain('A --> B');
    expect(out).not.toContain(' : ');
  });
});

describe('updateMessage', function() {
  test('updates label', function() {
    var t = '@startuml\nA -> B : old\n@enduml';
    var p = seq.parseSequence(t);
    var out = seq.updateMessage(t, p.relations[0].line, 'label', 'new');
    expect(out).toContain('A -> B : new');
  });

  test('updates arrow', function() {
    var t = '@startuml\nA -> B\n@enduml';
    var p = seq.parseSequence(t);
    var out = seq.updateMessage(t, p.relations[0].line, 'arrow', '-->');
    expect(out).toContain('A --> B');
  });
});

describe('updateParticipant', function() {
  test('updates alias', function() {
    var t = '@startuml\nactor A\n@enduml';
    var p = seq.parseSequence(t);
    var out = seq.updateParticipant(t, p.elements[0].line, 'alias', 'Alice');
    expect(out).toContain('actor Alice');
  });

  test('updates label adding as syntax', function() {
    var t = '@startuml\nactor A\n@enduml';
    var p = seq.parseSequence(t);
    var out = seq.updateParticipant(t, p.elements[0].line, 'label', 'Alice Wonder');
    expect(out).toContain('actor "Alice Wonder" as A');
  });
});

describe('setTitle', function() {
  test('inserts title after @startuml', function() {
    var out = seq.setTitle('@startuml\n@enduml', 'My Title');
    expect(out).toContain('title My Title');
  });

  test('replaces existing title', function() {
    var out = seq.setTitle('@startuml\ntitle Old\n@enduml', 'New');
    expect(out).toContain('title New');
    expect(out).not.toContain('title Old');
  });
});
