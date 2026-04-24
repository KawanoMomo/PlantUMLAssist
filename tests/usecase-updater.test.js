'use strict';
// Earlier sibling tests (e.g. sequence-overlay.test.js) reassign global.window
// to a fresh jsdom window, which wipes the sandbox window prepared by
// run-tests.js. Eagerly require usecase.js so its IIFE registers
// window.MA.modules.plantumlUsecase on whatever global.window is current.
try {
  require('../src/core/dsl-utils.js');
  require('../src/core/regex-parts.js');
  require('../src/core/parser-utils.js');
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
