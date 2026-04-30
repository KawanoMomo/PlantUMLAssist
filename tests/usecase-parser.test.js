'use strict';
// Earlier sibling tests (e.g. sequence-overlay.test.js) reassign global.window
// to a fresh jsdom window, which wipes the sandbox window prepared by
// run-tests.js. Eagerly require usecase.js so its IIFE registers
// window.MA.modules.plantumlUsecase on whatever global.window is current.
// Ensure usecase.js (and its core deps) is registered on whatever global.window
// is current. Earlier sibling tests (sequence-overlay/line-resolver/etc.) may
// have replaced global.window with a fresh jsdom window — in that case the
// IIFE in usecase.js needs dsl-utils + regex-parts + parser-utils to be
// re-required against the same window before it.
try {
  require('../src/core/dsl-utils.js');
  require('../src/core/regex-parts.js');
  require('../src/core/id-normalizer.js');
  require('../src/core/parser-utils.js');
  require('../src/modules/usecase.js');
} catch (e) { /* sandbox path: run-tests.js already loaded everything */ }
var uc = (typeof window !== 'undefined' && window.MA && window.MA.modules && window.MA.modules.plantumlUsecase)
  || (global.window && global.window.MA && global.window.MA.modules && global.window.MA.modules.plantumlUsecase);

describe('parseUsecase actor', function() {
  test('parses bare actor', function() {
    var r = uc.parse('@startuml\nactor User\n@enduml');
    expect(r.elements.length).toBe(1);
    expect(r.elements[0].kind).toBe('actor');
    expect(r.elements[0].id).toBe('User');
    expect(r.elements[0].label).toBe('User');
  });

  test('parses actor with quoted label and as alias', function() {
    var r = uc.parse('@startuml\nactor "Power User" as PU\n@enduml');
    expect(r.elements[0].id).toBe('PU');
    expect(r.elements[0].label).toBe('Power User');
  });

  test('parses :X: short form for actor', function() {
    var r = uc.parse('@startuml\n:Visitor:\n@enduml');
    expect(r.elements[0].kind).toBe('actor');
    expect(r.elements[0].id).toBe('Visitor');
    expect(r.elements[0].label).toBe('Visitor');
  });

  test('parses :Label: as Alias short form', function() {
    var r = uc.parse('@startuml\n:Power User: as PU\n@enduml');
    expect(r.elements[0].id).toBe('PU');
    expect(r.elements[0].label).toBe('Power User');
  });
});

describe('parseUsecase usecase element', function() {
  test('parses bare usecase keyword', function() {
    var r = uc.parse('@startuml\nusecase Login\n@enduml');
    expect(r.elements[0].kind).toBe('usecase');
    expect(r.elements[0].id).toBe('Login');
    expect(r.elements[0].label).toBe('Login');
  });

  test('parses usecase with quoted label and as alias', function() {
    var r = uc.parse('@startuml\nusecase "Login Flow" as L1\n@enduml');
    expect(r.elements[0].id).toBe('L1');
    expect(r.elements[0].label).toBe('Login Flow');
  });

  test('parses (Label) short form', function() {
    var r = uc.parse('@startuml\n(Login)\n@enduml');
    expect(r.elements[0].kind).toBe('usecase');
    expect(r.elements[0].id).toBe('Login');
    expect(r.elements[0].label).toBe('Login');
  });

  test('parses (Label) as Alias short form', function() {
    var r = uc.parse('@startuml\n(Login Flow) as L1\n@enduml');
    expect(r.elements[0].id).toBe('L1');
    expect(r.elements[0].label).toBe('Login Flow');
  });
});

describe('parseUsecase package', function() {
  test('parses single package with quoted label', function() {
    var r = uc.parse('@startuml\npackage "Auth" {\nactor User\nusecase Login\n}\n@enduml');
    expect(r.groups.length).toBe(1);
    expect(r.groups[0].kind).toBe('package');
    expect(r.groups[0].label).toBe('Auth');
    expect(r.groups[0].startLine).toBe(2);
    expect(r.groups[0].endLine).toBe(5);
    expect(r.groups[0].parentId).toBe(null);
  });

  test('assigns parentPackageId to elements inside package', function() {
    var r = uc.parse('@startuml\npackage "Auth" {\nactor User\n}\n@enduml');
    var actor = r.elements.find(function(e) { return e.kind === 'actor'; });
    expect(actor.parentPackageId).toBe(r.groups[0].id);
  });

  test('parses nested packages with parentId chain', function() {
    var r = uc.parse([
      '@startuml',
      'package "Outer" {',
      'package "Inner" {',
      'actor U',
      '}',
      '}',
      '@enduml',
    ].join('\n'));
    expect(r.groups.length).toBe(2);
    var outer = r.groups.find(function(g) { return g.label === 'Outer'; });
    var inner = r.groups.find(function(g) { return g.label === 'Inner'; });
    expect(inner.parentId).toBe(outer.id);
    var actor = r.elements[0];
    expect(actor.parentPackageId).toBe(inner.id);
  });

  test('rectangle keyword treated as package alias', function() {
    var r = uc.parse('@startuml\nrectangle "Box" {\nactor U\n}\n@enduml');
    expect(r.groups.length).toBe(1);
    expect(r.groups[0].kind).toBe('package');
    expect(r.groups[0].label).toBe('Box');
  });
});

describe('parseUsecase relations', function() {
  test('parses association --> with no label', function() {
    var r = uc.parse('@startuml\nactor U\nusecase L\nU --> L\n@enduml');
    expect(r.relations.length).toBe(1);
    expect(r.relations[0].kind).toBe('association');
    expect(r.relations[0].from).toBe('U');
    expect(r.relations[0].to).toBe('L');
    expect(r.relations[0].arrow).toBe('-->');
    expect(r.relations[0].label).toBe('');
  });

  test('parses association with label after colon', function() {
    var r = uc.parse('@startuml\nU --> L : initiates\n@enduml');
    expect(r.relations[0].label).toBe('initiates');
  });

  test('parses generalization <|--', function() {
    var r = uc.parse('@startuml\nPerson <|-- Admin\n@enduml');
    expect(r.relations[0].kind).toBe('generalization');
    expect(r.relations[0].from).toBe('Person');
    expect(r.relations[0].to).toBe('Admin');
    expect(r.relations[0].arrow).toBe('<|--');
  });

  test('parses include via stereotype', function() {
    var r = uc.parse('@startuml\nLogin ..> Validate : <<include>>\n@enduml');
    expect(r.relations[0].kind).toBe('include');
    expect(r.relations[0].label).toBe('<<include>>');
  });

  test('parses extend via stereotype', function() {
    var r = uc.parse('@startuml\nLogin ..> CancelLogin : <<extend>>\n@enduml');
    expect(r.relations[0].kind).toBe('extend');
    expect(r.relations[0].label).toBe('<<extend>>');
  });

  test('parses dotted ..> without stereotype as association', function() {
    var r = uc.parse('@startuml\nA ..> B\n@enduml');
    expect(r.relations[0].kind).toBe('association');
    expect(r.relations[0].arrow).toBe('..>');
  });

  test('parses comments and skips them', function() {
    var r = uc.parse("@startuml\n' this is comment\nactor U\n@enduml");
    expect(r.elements.length).toBe(1);
  });
});
