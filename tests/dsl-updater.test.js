'use strict';
var DUR = (typeof window !== 'undefined' && window.MA && window.MA.dslUpdater)
  || (global.window && global.window.MA && global.window.MA.dslUpdater);

describe('dslUpdater.insertBeforeEnd', function() {
  test('inserts before @enduml', function() {
    var t = '@startuml\nactor A\n@enduml';
    expect(DUR.insertBeforeEnd(t, 'actor B')).toBe('@startuml\nactor A\nactor B\n@enduml');
  });
  test('appends if no @enduml', function() {
    var t = '@startuml\nactor A';
    expect(DUR.insertBeforeEnd(t, 'actor B')).toBe('@startuml\nactor A\nactor B');
  });
});

describe('dslUpdater.moveLineUp', function() {
  test('swaps adjacent lines', function() {
    var t = '@startuml\nA\nB\n@enduml';
    expect(DUR.moveLineUp(t, 3)).toBe('@startuml\nB\nA\n@enduml');
  });
  test('no-op at line 1', function() {
    var t = '@startuml\nA\n@enduml';
    expect(DUR.moveLineUp(t, 1)).toBe(t);
  });
});

describe('dslUpdater.moveLineDown', function() {
  test('swaps adjacent lines', function() {
    var t = '@startuml\nA\nB\n@enduml';
    expect(DUR.moveLineDown(t, 2)).toBe('@startuml\nB\nA\n@enduml');
  });
  test('no-op at last line', function() {
    var t = '@startuml\nA';
    expect(DUR.moveLineDown(t, 2)).toBe(t);
  });
});

describe('dslUpdater.renameWithRefs', function() {
  test('renames identifier with word boundary', function() {
    var t = '@startuml\nactor User\nUser --> Login\n@enduml';
    var out = DUR.renameWithRefs(t, 'User', 'Admin');
    expect(out).toContain('actor Admin');
    expect(out).toContain('Admin --> Login');
  });
  test('does not match inside other identifiers', function() {
    var t = '@startuml\nUser User2\n@enduml';
    var out = DUR.renameWithRefs(t, 'User', 'Admin');
    expect(out).toContain('Admin User2');
    expect(out).not.toContain('AdminUser2');
  });
  test('preserves quoted labels', function() {
    var t = '@startuml\nactor "User Name" as U\n@enduml';
    var out = DUR.renameWithRefs(t, 'U', 'Admin');
    expect(out).toContain('"User Name"');
    expect(out).toContain('as Admin');
  });
  test('skips comment lines', function() {
    var t = "@startuml\n' rename User\nactor User\n@enduml";
    var out = DUR.renameWithRefs(t, 'User', 'Admin');
    expect(out).toContain("' rename User");
    expect(out).toContain('actor Admin');
  });
});
