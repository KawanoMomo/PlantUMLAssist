'use strict';
// Earlier sibling tests (e.g. sequence-overlay.test.js) reassign global.window
// to a fresh jsdom window, which wipes the sandbox window prepared by
// run-tests.js. Eagerly require usecase.js so its IIFE registers
// window.MA.modules.plantumlUsecase on whatever global.window is current.
try {
  require('../src/core/dsl-utils.js');
  require('../src/core/regex-parts.js');
  require('../src/core/parser-utils.js');
  require('../src/core/text-updater.js');
  require('../src/modules/usecase.js');
} catch (e) { /* sandbox path: run-tests.js already loaded everything */ }
var uc = (typeof window !== 'undefined' && window.MA && window.MA.modules && window.MA.modules.plantumlUsecase)
  || (global.window && global.window.MA && global.window.MA.modules && global.window.MA.modules.plantumlUsecase);

describe('usecase formatters', function() {
  test('fmtActor with label==id emits bare keyword form', function() {
    expect(uc.fmtActor('User', 'User')).toBe('actor User');
  });
  test('fmtActor with label!=id emits quoted-label as alias', function() {
    expect(uc.fmtActor('PU', 'Power User')).toBe('actor "Power User" as PU');
  });
  test('fmtUsecase with label==id', function() {
    expect(uc.fmtUsecase('Login', 'Login')).toBe('usecase Login');
  });
  test('fmtUsecase with label!=id', function() {
    expect(uc.fmtUsecase('L1', 'Login Flow')).toBe('usecase "Login Flow" as L1');
  });
  test('fmtPackage always quotes label', function() {
    expect(uc.fmtPackage('Auth')).toBe('package "Auth" {');
    expect(uc.fmtPackage('Auth Module')).toBe('package "Auth Module" {');
  });
  test('fmtRelation association no label', function() {
    expect(uc.fmtRelation('association', 'A', 'B')).toBe('A --> B');
  });
  test('fmtRelation association with label', function() {
    expect(uc.fmtRelation('association', 'A', 'B', 'initiates')).toBe('A --> B : initiates');
  });
  test('fmtRelation generalization', function() {
    expect(uc.fmtRelation('generalization', 'Person', 'Admin')).toBe('Person <|-- Admin');
  });
  test('fmtRelation include', function() {
    expect(uc.fmtRelation('include', 'Login', 'Validate')).toBe('Login ..> Validate : <<include>>');
  });
  test('fmtRelation extend', function() {
    expect(uc.fmtRelation('extend', 'Login', 'CancelLogin')).toBe('Login ..> CancelLogin : <<extend>>');
  });
});

describe('usecase add operations', function() {
  var TEMPLATE = '@startuml\ntitle Sample\nactor U\nusecase L1\nU --> L1\n@enduml';

  test('addActor appends before @enduml', function() {
    var out = uc.addActor(TEMPLATE, 'Admin', 'Admin');
    expect(out).toContain('actor Admin');
    expect(out.split('\n').slice(-1)[0]).toBe('@enduml');
  });
  test('addUsecase appends with quoted label', function() {
    var out = uc.addUsecase(TEMPLATE, 'L2', 'Logout Flow');
    expect(out).toContain('usecase "Logout Flow" as L2');
  });
  test('addPackage appends open + empty body + close', function() {
    var out = uc.addPackage(TEMPLATE, 'Auth');
    expect(out).toContain('package "Auth" {');
    expect(out).toContain('}');
  });
  test('addRelation appends association', function() {
    var out = uc.addRelation(TEMPLATE, 'association', 'U', 'L1', 'navigates');
    expect(out).toContain('U --> L1 : navigates');
  });
  test('addRelation appends include', function() {
    var out = uc.addRelation(TEMPLATE, 'include', 'L1', 'Validate');
    expect(out).toContain('L1 ..> Validate : <<include>>');
  });
});

describe('usecase update operations', function() {
  test('updateActor changes label', function() {
    var t = '@startuml\nactor User\n@enduml';
    var out = uc.updateActor(t, 2, 'label', 'End User');
    expect(out).toContain('actor "End User" as User');
  });
  test('updateActor changes id (keeps line position)', function() {
    var t = '@startuml\nactor "End User" as User\n@enduml';
    var out = uc.updateActor(t, 2, 'id', 'EU');
    expect(out).toContain('actor "End User" as EU');
  });
  test('updateUsecase changes label', function() {
    var t = '@startuml\nusecase L1\n@enduml';
    var out = uc.updateUsecase(t, 2, 'label', 'Login Flow');
    expect(out).toContain('usecase "Login Flow" as L1');
  });
  test('updateRelation changes kind from association to include', function() {
    var t = '@startuml\nA --> B\n@enduml';
    var out = uc.updateRelation(t, 2, 'kind', 'include');
    expect(out).toContain('A ..> B : <<include>>');
  });
  test('updateRelation changes kind from include to extend', function() {
    var t = '@startuml\nA ..> B : <<include>>\n@enduml';
    var out = uc.updateRelation(t, 2, 'kind', 'extend');
    expect(out).toContain('A ..> B : <<extend>>');
  });
  test('updateRelation changes association label', function() {
    var t = '@startuml\nA --> B : old\n@enduml';
    var out = uc.updateRelation(t, 2, 'label', 'new label');
    expect(out).toContain('A --> B : new label');
  });
});

describe('usecase line operations', function() {
  test('deleteLine removes a line', function() {
    var t = '@startuml\nactor A\nactor B\n@enduml';
    var out = uc.deleteLine(t, 3);
    expect(out).not.toContain('actor B');
    expect(out).toContain('actor A');
  });
  test('moveLineUp swaps two lines', function() {
    var t = '@startuml\nactor A\nactor B\n@enduml';
    var out = uc.moveLineUp(t, 3);
    var lines = out.split('\n');
    expect(lines[1]).toBe('actor B');
    expect(lines[2]).toBe('actor A');
  });
  test('moveLineDown swaps two lines', function() {
    var t = '@startuml\nactor A\nactor B\n@enduml';
    var out = uc.moveLineDown(t, 2);
    var lines = out.split('\n');
    expect(lines[1]).toBe('actor B');
    expect(lines[2]).toBe('actor A');
  });
  test('setTitle inserts after @startuml', function() {
    var t = '@startuml\nactor A\n@enduml';
    var out = uc.setTitle(t, 'My UseCase');
    expect(out.split('\n')[1]).toBe('title My UseCase');
  });
  test('setTitle replaces existing title', function() {
    var t = '@startuml\ntitle Old\nactor A\n@enduml';
    var out = uc.setTitle(t, 'New');
    expect(out).toContain('title New');
    expect(out).not.toContain('title Old');
  });
});

describe('usecase renameWithRefs', function() {
  test('renames actor and updates relation references', function() {
    var t = '@startuml\nactor User\nusecase L1\nUser --> L1\n@enduml';
    // newId chosen so it does not contain oldId as a substring,
    // letting `not.toContain('User --> L1')` actually verify removal.
    var out = uc.renameWithRefs(t, 'User', 'Admin');
    expect(out).toContain('actor Admin');
    expect(out).toContain('Admin --> L1');
    expect(out).not.toContain('User --> L1');
  });
  test('renames usecase and updates relations', function() {
    var t = '@startuml\nactor U\nusecase L1\nU --> L1\nL1 ..> Validate : <<include>>\n@enduml';
    var out = uc.renameWithRefs(t, 'L1', 'Login');
    expect(out).toContain('usecase Login');
    expect(out).toContain('U --> Login');
    expect(out).toContain('Login ..> Validate');
  });
  test('does not replace inside quoted labels', function() {
    var t = '@startuml\nactor "User Admin" as U\n@enduml';
    var out = uc.renameWithRefs(t, 'User', 'EndUser');
    expect(out).toContain('"User Admin"');
  });
  test('skips comment lines', function() {
    var t = "@startuml\n' rename User to EndUser\nactor User\n@enduml";
    var out = uc.renameWithRefs(t, 'User', 'EndUser');
    expect(out).toContain("' rename User to EndUser");
    expect(out).toContain('actor EndUser');
  });
});
