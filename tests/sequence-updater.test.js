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

describe('addGroup', function() {
  test('inserts alt block before @enduml', function() {
    var out = seq.addGroup('@startuml\nA -> B\n@enduml', 'alt', 'x > 0');
    expect(out).toContain('alt x > 0');
    expect(out).toContain('end');
    expect(out.indexOf('alt x > 0')).toBeLessThan(out.indexOf('@enduml'));
  });

  test('inserts loop without label', function() {
    var out = seq.addGroup('@startuml\n@enduml', 'loop', '');
    expect(out).toContain('loop');
    expect(out).toContain('end');
    expect(out.indexOf('loop')).toBeLessThan(out.indexOf('end'));
  });
});

describe('deleteGroup', function() {
  test('removes opening and matching end but keeps inner messages', function() {
    var text = '@startuml\nalt x\nA -> B\nend\n@enduml';
    // alt is line 2, end is line 4
    var out = seq.deleteGroup(text, 2, 4);
    expect(out).not.toContain('alt x');
    // The stand-alone 'end' line is gone (@enduml stays because it contains
    // 'end' as prefix but not as a full line).
    var lines = out.split('\n').map(function(s) { return s.trim(); });
    expect(lines.indexOf('end')).toBe(-1);
    expect(out).toContain('A -> B');
  });
});

describe('insertElseIntoGroup (Feature #8)', function() {
  test('inserts else line before the end line', function() {
    var t = '@startuml\nalt c1\nA -> B\nend\n@enduml';
    // alt line=2, end line=4
    var out = seq.insertElseIntoGroup(t, 2, 4, 'c2');
    expect(out).toContain('alt c1');
    expect(out).toContain('else c2');
    expect(out).toContain('end');
    expect(out.indexOf('else c2')).toBeLessThan(out.indexOf('end'));
    expect(out.indexOf('A -> B')).toBeLessThan(out.indexOf('else c2'));
  });

  test('inserts bare else when condition is empty', function() {
    var t = '@startuml\nalt c1\nA -> B\nend\n@enduml';
    var out = seq.insertElseIntoGroup(t, 2, 4, '');
    var lines = out.split('\n').map(function(s) { return s.trim(); });
    expect(lines.indexOf('else')).toBeGreaterThan(-1);
  });

  test('preserves indent of the opening alt line', function() {
    var t = '@startuml\n  alt c1\n    A -> B\n  end\n@enduml';
    var out = seq.insertElseIntoGroup(t, 2, 4, 'c2');
    var lines = out.split('\n');
    var elseLine = null;
    for (var i = 0; i < lines.length; i++) {
      if (/else\s+c2/.test(lines[i])) { elseLine = lines[i]; break; }
    }
    expect(elseLine).not.toBe(null);
    expect(/^\s\s[^ ]/.test(elseLine)).toBe(true);
  });

  test('no-op for invalid range', function() {
    var t = '@startuml\nalt c1\nend\n@enduml';
    expect(seq.insertElseIntoGroup(t, 0, 3, 'c2')).toBe(t);
    expect(seq.insertElseIntoGroup(t, 2, 1, 'c2')).toBe(t);
  });
});

describe('updateGroup (Feature #8)', function() {
  test('updates gtype', function() {
    var t = '@startuml\nalt c1\nA -> B\nend\n@enduml';
    var out = seq.updateGroup(t, 2, 'gtype', 'loop');
    expect(out).toContain('loop c1');
    expect(out).not.toContain('alt c1');
  });

  test('updates label', function() {
    var t = '@startuml\nalt old\nA -> B\nend\n@enduml';
    var out = seq.updateGroup(t, 2, 'label', 'new');
    expect(out).toContain('alt new');
  });

  test('clears label when value empty', function() {
    var t = '@startuml\nalt old\nA -> B\nend\n@enduml';
    var out = seq.updateGroup(t, 2, 'label', '');
    var lines = out.split('\n');
    expect(lines[1]).toBe('alt');
  });
});

describe('addNote', function() {
  test('adds note over single participant', function() {
    var out = seq.addNote('@startuml\nA -> B\n@enduml', 'over', ['A'], 'remark');
    expect(out).toContain('note over A : remark');
  });

  test('adds note with multiple targets', function() {
    var out = seq.addNote('@startuml\nA -> B\n@enduml', 'over', ['A', 'B'], 'span');
    expect(out).toContain('note over A, B : span');
  });

  test('adds note without text', function() {
    var out = seq.addNote('@startuml\n@enduml', 'left of', ['X'], '');
    expect(out).toContain('note left of X');
    expect(out).not.toContain(' : ');
  });
});

describe('updateNote', function() {
  test('changes position', function() {
    var text = '@startuml\nnote over A : hi\n@enduml';
    var out = seq.updateNote(text, 2, 'position', 'right of');
    expect(out).toContain('note right of A : hi');
  });

  test('changes text', function() {
    var out = seq.updateNote('@startuml\nnote over A : hi\n@enduml', 2, 'text', 'bye');
    expect(out).toContain('note over A : bye');
    expect(out).not.toContain(' : hi');
  });
});

describe('moveMessage', function() {
  test('moves message up past sibling', function() {
    var text = '@startuml\nA -> B : first\nA -> C : second\n@enduml';
    // 'A -> C : second' is line 3; move up swaps with line 2
    var out = seq.moveMessage(text, 3, -1);
    expect(out.indexOf('second')).toBeLessThan(out.indexOf('first'));
  });

  test('moves message down', function() {
    var text = '@startuml\nA -> B : first\nA -> C : second\n@enduml';
    var out = seq.moveMessage(text, 2, 1);
    expect(out.indexOf('second')).toBeLessThan(out.indexOf('first'));
  });

  test('refuses to move past @startuml boundary', function() {
    var text = '@startuml\nA -> B\n@enduml';
    var out = seq.moveMessage(text, 2, -1);
    expect(out).toBe(text);
  });

  test('no-op when previous non-blank line is a Note', function() {
    var text = '@startuml\nA -> B : first\nnote over A : remark\nA -> C : second\n@enduml';
    expect(seq.moveMessage(text, 4, -1)).toBe(text);
  });

  test('no-op when next non-blank line is an alt opener', function() {
    var text = '@startuml\nA -> B : first\nalt ok\nA -> C\nend\n@enduml';
    expect(seq.moveMessage(text, 2, 1)).toBe(text);
  });

  test('no-op when next non-blank line is an end keyword', function() {
    var text = '@startuml\nalt ok\nA -> B : first\nend\nA -> C\n@enduml';
    expect(seq.moveMessage(text, 3, 1)).toBe(text);
  });

  test('no-op when adjacent is participant declaration', function() {
    var text = '@startuml\nparticipant A\nparticipant B\nA -> B : first\n@enduml';
    expect(seq.moveMessage(text, 4, -1)).toBe(text);
  });

  test('skips blank lines between messages', function() {
    var text = '@startuml\nA -> B : first\n\nA -> C : second\n@enduml';
    var out = seq.moveMessage(text, 4, -1);
    expect(out.indexOf('second')).toBeLessThan(out.indexOf('first'));
  });
});

describe('toggleAutonumber', function() {
  test('adds autonumber after @startuml', function() {
    var out = seq.toggleAutonumber('@startuml\nA -> B\n@enduml');
    expect(out).toContain('autonumber');
    expect(out.indexOf('autonumber')).toBeLessThan(out.indexOf('A -> B'));
  });

  test('removes existing autonumber', function() {
    var out = seq.toggleAutonumber('@startuml\nautonumber\nA -> B\n@enduml');
    expect(out).not.toContain('autonumber');
    expect(out).toContain('A -> B');
  });

  test('inserts after title if present', function() {
    var out = seq.toggleAutonumber('@startuml\ntitle T\nA -> B\n@enduml');
    expect(out.indexOf('title T')).toBeLessThan(out.indexOf('autonumber'));
    expect(out.indexOf('autonumber')).toBeLessThan(out.indexOf('A -> B'));
  });
});

describe('insertBefore', function() {
  test('inserts a message before the given line', function() {
    var text = '@startuml\nA -> B : first\nA -> C : second\n@enduml';
    var out = seq.insertBefore(text, 3, 'message', { from: 'A', to: 'B', arrow: '->', label: 'mid' });
    var lines = out.split('\n');
    expect(lines[2]).toBe('A -> B : mid');
    expect(lines[3]).toBe('A -> C : second');
  });

  test('inserts a note before the given line', function() {
    var text = '@startuml\nA -> B\n@enduml';
    var out = seq.insertBefore(text, 2, 'note', { position: 'over', targets: ['A'], text: 'hi' });
    expect(out).toContain('note over A : hi');
    expect(out.indexOf('note over')).toBeLessThan(out.indexOf('A -> B'));
  });
});

describe('insertAfter', function() {
  test('inserts a message after the given line', function() {
    var text = '@startuml\nA -> B : first\nA -> C : second\n@enduml';
    var out = seq.insertAfter(text, 2, 'message', { from: 'A', to: 'B', arrow: '->', label: 'mid' });
    var lines = out.split('\n');
    expect(lines[2]).toBe('A -> B : mid');
    expect(lines[3]).toBe('A -> C : second');
  });

  test('inserts an activation after the given line', function() {
    var text = '@startuml\nA -> B\n@enduml';
    var out = seq.insertAfter(text, 2, 'activation', { action: 'activate', target: 'B' });
    expect(out).toContain('activate B');
    expect(out.indexOf('A -> B')).toBeLessThan(out.indexOf('activate B'));
  });

  test('inserts a participant after the given line', function() {
    var out = seq.insertAfter('@startuml\n@enduml', 1, 'participant',
      { ptype: 'actor', alias: 'A', label: 'Alice' });
    expect(out).toContain('actor "Alice" as A');
  });

  test('inserts a block before the given line', function() {
    var out = seq.insertBefore('@startuml\nA -> B\n@enduml', 2, 'block',
      { kind: 'alt', label: 'x > 0' });
    expect(out).toContain('alt x > 0');
    expect(out).toContain('end');
    expect(out.indexOf('alt x > 0')).toBeLessThan(out.indexOf('A -> B'));
  });

  test('insertBefore with missing required props returns text unchanged', function() {
    var text = '@startuml\nA -> B\n@enduml';
    // missing from
    expect(seq.insertBefore(text, 2, 'message', { to: 'B' })).toBe(text);
    // missing alias
    expect(seq.insertBefore(text, 2, 'participant', { ptype: 'actor' })).toBe(text);
  });
});

describe('unwrap', function() {
  test('removes block boundaries but keeps inner messages by default', function() {
    var text = '@startuml\nalt cond\nA -> B\nB -> C\nend\n@enduml';
    var out = seq.unwrap(text, 2, 5, true);
    expect(out).not.toContain('alt cond');
    var lines = out.split('\n').map(function(s) { return s.trim(); });
    expect(lines.indexOf('end')).toBe(-1);
    expect(out).toContain('A -> B');
    expect(out).toContain('B -> C');
  });

  test('removes block including inner content when keepInner=false', function() {
    var text = '@startuml\nalt cond\nA -> B\nend\n@enduml';
    var out = seq.unwrap(text, 2, 4, false);
    expect(out).not.toContain('A -> B');
    expect(out).not.toContain('alt cond');
  });
});

describe('wrapWith', function() {
  test('wraps a single line with alt block', function() {
    var text = '@startuml\nA -> B : msg\n@enduml';
    var out = seq.wrapWith(text, 2, 2, 'alt', 'condition');
    var lines = out.split('\n');
    expect(lines[1]).toBe('alt condition');
    expect(lines[2]).toBe('A -> B : msg');
    expect(lines[3]).toBe('end');
  });

  test('wraps a multi-line range with loop block', function() {
    var text = '@startuml\nA -> B : a\nB -> C : b\nC -> D : c\n@enduml';
    var out = seq.wrapWith(text, 2, 4, 'loop', '3 times');
    var lines = out.split('\n');
    expect(lines[1]).toBe('loop 3 times');
    expect(lines[2]).toBe('A -> B : a');
    expect(lines[3]).toBe('B -> C : b');
    expect(lines[4]).toBe('C -> D : c');
    expect(lines[5]).toBe('end');
  });

  test('wraps without label', function() {
    var text = '@startuml\nA -> B\n@enduml';
    var out = seq.wrapWith(text, 2, 2, 'opt', '');
    expect(out).toContain('opt\n');
  });
});

describe('renameWithRefs', function() {
  test('renames participant and updates message from/to', function() {
    var text = [
      '@startuml',
      'participant Database',
      'A -> Database : query',
      'Database --> A : result',
      '@enduml',
    ].join('\n');
    var out = seq.renameWithRefs(text, 'Database', 'Redis');
    expect(out).toContain('participant Redis');
    expect(out).toContain('A -> Redis : query');
    expect(out).toContain('Redis --> A : result');
    expect(out).not.toContain('Database');
  });

  test('handles quoted alias', function() {
    var text = '@startuml\nparticipant "DB Server" as DB\nA -> DB : q\n@enduml';
    var out = seq.renameWithRefs(text, 'DB', 'Cache');
    expect(out).toContain('"DB Server" as Cache');
    expect(out).toContain('A -> Cache : q');
  });

  test('does not rename substring matches inside other identifiers', function() {
    var text = '@startuml\nparticipant DB\nparticipant DBClient\nDBClient -> DB : q\n@enduml';
    var out = seq.renameWithRefs(text, 'DB', 'Cache');
    expect(out).toContain('participant Cache');
    expect(out).toContain('participant DBClient');
    expect(out).toContain('DBClient -> Cache : q');
  });

  test('updates activate/deactivate references', function() {
    var text = '@startuml\nparticipant DB\nA -> DB\nactivate DB\ndeactivate DB\n@enduml';
    var out = seq.renameWithRefs(text, 'DB', 'Cache');
    expect(out).toContain('activate Cache');
    expect(out).toContain('deactivate Cache');
  });

  test('updates note targets', function() {
    var text = '@startuml\nparticipant DB\nnote over DB : info\n@enduml';
    var out = seq.renameWithRefs(text, 'DB', 'Cache');
    expect(out).toContain('note over Cache : info');
  });
});

describe('duplicateRange', function() {
  test('duplicates a range and inserts after the given line', function() {
    var text = '@startuml\nA -> B : a\nB -> C : b\n@enduml';
    var out = seq.duplicateRange(text, 2, 3, 3);
    var lines = out.split('\n');
    expect(lines[1]).toBe('A -> B : a');
    expect(lines[2]).toBe('B -> C : b');
    expect(lines[3]).toBe('A -> B : a');
    expect(lines[4]).toBe('B -> C : b');
  });

  test('duplicates single line', function() {
    var text = '@startuml\nA -> B\nB -> C\n@enduml';
    var out = seq.duplicateRange(text, 2, 2, 3);
    var lines = out.split('\n');
    expect(lines[1]).toBe('A -> B');
    expect(lines[2]).toBe('B -> C');
    expect(lines[3]).toBe('A -> B');
  });
});

describe('inferActivations', function() {
  test('adds activate after sync message and deactivate after reply', function() {
    var text = [
      '@startuml',
      'A -> B : req',
      'B --> A : reply',
      '@enduml',
    ].join('\n');
    var out = seq.inferActivations(text, 2);
    expect(out).toContain('activate B');
    expect(out).toContain('deactivate B');
    expect(out.indexOf('A -> B : req')).toBeLessThan(out.indexOf('activate B'));
    expect(out.indexOf('activate B')).toBeLessThan(out.indexOf('B --> A : reply'));
    expect(out.indexOf('B --> A : reply')).toBeLessThan(out.indexOf('deactivate B'));
  });

  test('only adds activate if no matching reply exists', function() {
    var text = '@startuml\nA -> B : fire-and-forget\n@enduml';
    var out = seq.inferActivations(text, 2);
    expect(out).toContain('activate B');
    expect(out).not.toContain('deactivate');
  });
});

describe('moveParticipant', function() {
  // newIndex is a gap index 0..N (N = # of participants), matching
  // drawDropIndicator / computeDropIndex in app.js. Gap k is between
  // participants k-1 and k in the pre-move array; gap 0 = before all,
  // gap N = after all.

  test('gap 0 moves C (last) to the head', function() {
    var text = '@startuml\nparticipant A\nparticipant B\nparticipant C\n@enduml';
    var out = seq.moveParticipant(text, 'C', 0);
    var lines = out.split('\n').filter(function(l) { return l.indexOf('participant') === 0; });
    expect(lines[0]).toContain('participant C');
    expect(lines[1]).toContain('participant A');
    expect(lines[2]).toContain('participant B');
  });

  test('gap 2 moves A two positions forward to the B-C boundary', function() {
    // Regression: previously `newIndex = 2` on [A,B,C] was clamped to 1 and
    // then interpreted as a post-remove index, producing [B,C,A] instead of
    // [B,A,C]. User report: "2+ ブロック移動しようとしても 1 ブロックしか動かない".
    var text = '@startuml\nparticipant A\nparticipant B\nparticipant C\n@enduml';
    var out = seq.moveParticipant(text, 'A', 2);
    var lines = out.split('\n').filter(function(l) { return l.indexOf('participant') === 0; });
    expect(lines[0]).toContain('participant B');
    expect(lines[1]).toContain('participant A');
    expect(lines[2]).toContain('participant C');
  });

  test('gap N (= length) drops at the end', function() {
    // Regression: newIndex=3 on 3-participant array was clamped to 2 → the
    // "end" gap collapsed onto "between B and C", so moves to the far right
    // stopped one slot short of the rightSentinel.
    var text = '@startuml\nparticipant A\nparticipant B\nparticipant C\n@enduml';
    var out = seq.moveParticipant(text, 'A', 3);
    var lines = out.split('\n').filter(function(l) { return l.indexOf('participant') === 0; });
    expect(lines[0]).toContain('participant B');
    expect(lines[1]).toContain('participant C');
    expect(lines[2]).toContain('participant A');
  });

  test('gap adjacent to self is a no-op (drop at own slot)', function() {
    var text = '@startuml\nparticipant A\nparticipant B\nparticipant C\n@enduml';
    // A is at from=0, so gaps 0 and 1 are both "A's own slot".
    expect(seq.moveParticipant(text, 'A', 0)).toBe(text);
    expect(seq.moveParticipant(text, 'A', 1)).toBe(text);
  });

  test('preserves other lines in order', function() {
    var text = '@startuml\nparticipant A\nparticipant B\nA -> B : msg\n@enduml';
    var out = seq.moveParticipant(text, 'B', 0);
    expect(out).toContain('participant B');
    expect(out).toContain('A -> B : msg');
  });
});

describe('setParticipantColor', function() {
  test('appends #HEX to participant line', function() {
    var text = '@startuml\nparticipant System\n@enduml';
    var out = seq.setParticipantColor(text, 'System', '#FFAAAA');
    expect(out).toContain('participant System #FFAAAA');
  });

  test('replaces existing #HEX', function() {
    var text = '@startuml\nparticipant System #FFAAAA\n@enduml';
    var out = seq.setParticipantColor(text, 'System', '#AAEEAA');
    expect(out).toContain('participant System #AAEEAA');
    expect(out).not.toContain('#FFAAAA');
  });

  test('removes color when hex is null', function() {
    var text = '@startuml\nparticipant System #FFAAAA\n@enduml';
    var out = seq.setParticipantColor(text, 'System', null);
    expect(out).toContain('participant System');
    expect(out).not.toContain('#FFAAAA');
  });

  test('handles quoted alias', function() {
    var text = '@startuml\nparticipant "My Server" as MS\n@enduml';
    var out = seq.setParticipantColor(text, 'MS', '#FFAAAA');
    expect(out).toContain('participant "My Server" as MS #FFAAAA');
  });
});
