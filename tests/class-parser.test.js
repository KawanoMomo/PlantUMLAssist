'use strict';
var jsdom = require('jsdom');

var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/modules/class.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});

var clMod = global.window.MA.modules.plantumlClass;

describe('class.parse — bare class', function() {
  test('parses minimal class declaration', function() {
    var t = '@startuml\nclass Foo\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements.length).toBe(1);
    expect(r.elements[0].kind).toBe('class');
    expect(r.elements[0].id).toBe('Foo');
    expect(r.elements[0].label).toBe('Foo');
    expect(r.elements[0].line).toBe(2);
    expect(r.elements[0].members.length).toBe(0);
  });

  test('parses class with quoted label', function() {
    var t = '@startuml\nclass "User Profile" as UP\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].id).toBe('UP');
    expect(r.elements[0].label).toBe('User Profile');
  });
});

describe('class.parse — block form', function() {
  test('parses class with empty body { }', function() {
    var t = '@startuml\nclass Foo {\n}\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements.length).toBe(1);
    expect(r.elements[0].id).toBe('Foo');
    expect(r.elements[0].endLine).toBe(3);
  });
  test('endLine matches closing brace for nested empty class', function() {
    var t = '@startuml\nclass Foo {\n}\nclass Bar\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].endLine).toBe(3);
    expect(r.elements[1].endLine).toBe(4);
  });
});

describe('class.parse — attributes', function() {
  test('parses public attribute with type', function() {
    var t = '@startuml\nclass Foo {\n  + name : String\n}\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].members.length).toBe(1);
    var m = r.elements[0].members[0];
    expect(m.kind).toBe('attribute');
    expect(m.visibility).toBe('+');
    expect(m.name).toBe('name');
    expect(m.type).toBe('String');
    expect(m.static).toBe(false);
  });
  test('parses 4 visibility markers', function() {
    var t = '@startuml\nclass Foo {\n  + a : int\n  - b : int\n  # c : int\n  ~ d : int\n}\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].members.map(function(m) { return m.visibility; })).toEqual(['+', '-', '#', '~']);
  });
  test('parses {static} attribute', function() {
    var t = '@startuml\nclass Foo {\n  + {static} count : int\n}\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].members[0].static).toBe(true);
    expect(r.elements[0].members[0].name).toBe('count');
  });
  test('parses attribute without visibility (default null)', function() {
    var t = '@startuml\nclass Foo {\n  name : String\n}\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].members[0].visibility).toBeNull();
  });
});

describe('class.parse — methods', function() {
  test('parses public method with no params + return type', function() {
    var t = '@startuml\nclass Foo {\n  + login() : void\n}\n@enduml';
    var r = clMod.parse(t);
    var m = r.elements[0].members[0];
    expect(m.kind).toBe('method');
    expect(m.visibility).toBe('+');
    expect(m.name).toBe('login');
    expect(m.params).toBe('');
    expect(m.type).toBe('void');
  });
  test('parses method with params', function() {
    var t = '@startuml\nclass Foo {\n  + add(a : int, b : int) : int\n}\n@enduml';
    var r = clMod.parse(t);
    var m = r.elements[0].members[0];
    expect(m.params).toBe('a : int, b : int');
    expect(m.type).toBe('int');
  });
  test('parses {static} method', function() {
    var t = '@startuml\nclass Foo {\n  + {static} create() : Foo\n}\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].members[0].static).toBe(true);
  });
  test('parses {abstract} method', function() {
    var t = '@startuml\nclass Foo {\n  + {abstract} validate() : bool\n}\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].members[0].abstract).toBe(true);
  });
});

describe('class.parse — interface', function() {
  test('parses interface keyword', function() {
    var t = '@startuml\ninterface IAuth {\n  + verify() : bool\n}\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements.length).toBe(1);
    expect(r.elements[0].kind).toBe('interface');
    expect(r.elements[0].id).toBe('IAuth');
    expect(r.elements[0].members.length).toBe(1);
  });
  test('parses interface with quoted label', function() {
    var t = '@startuml\ninterface "Auth Service" as IAuth\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].id).toBe('IAuth');
    expect(r.elements[0].label).toBe('Auth Service');
  });
});

describe('class.parse — abstract', function() {
  test('parses abstract class with 2 tokens', function() {
    var t = '@startuml\nabstract class Shape\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].kind).toBe('abstract');
    expect(r.elements[0].id).toBe('Shape');
  });
  test('parses abstract class with body', function() {
    var t = '@startuml\nabstract class Shape {\n  + {abstract} area() : double\n}\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].kind).toBe('abstract');
    expect(r.elements[0].members.length).toBe(1);
    expect(r.elements[0].members[0].abstract).toBe(true);
  });
});

describe('class.parse — enum', function() {
  test('parses enum with values (newline separated)', function() {
    var t = '@startuml\nenum Color {\n  RED\n  GREEN\n  BLUE\n}\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].kind).toBe('enum');
    expect(r.elements[0].id).toBe('Color');
    expect(r.elements[0].members.length).toBe(3);
    expect(r.elements[0].members[0].kind).toBe('enum-value');
    expect(r.elements[0].members[0].name).toBe('RED');
  });
  test('parses enum value with trailing semicolon', function() {
    var t = '@startuml\nenum Status {\n  ACTIVE;\n  DISABLED;\n}\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].members[0].name).toBe('ACTIVE');
    expect(r.elements[0].members[1].name).toBe('DISABLED');
  });
});

describe('class.parse — relations', function() {
  test('parses association --', function() {
    var t = '@startuml\nFoo -- Bar\n@enduml';
    var r = clMod.parse(t);
    expect(r.relations[0].kind).toBe('association');
    expect(r.relations[0].from).toBe('Foo');
    expect(r.relations[0].to).toBe('Bar');
  });
  test('parses inheritance <|-- (parent <|-- child)', function() {
    var t = '@startuml\nAnimal <|-- Dog\n@enduml';
    var r = clMod.parse(t);
    expect(r.relations[0].kind).toBe('inheritance');
    expect(r.relations[0].from).toBe('Animal');
    expect(r.relations[0].to).toBe('Dog');
  });
  test('parses inheritance reverse --|> (child --|> parent canonicalized)', function() {
    var t = '@startuml\nDog --|> Animal\n@enduml';
    var r = clMod.parse(t);
    expect(r.relations[0].kind).toBe('inheritance');
    expect(r.relations[0].from).toBe('Animal');
    expect(r.relations[0].to).toBe('Dog');
  });
  test('parses implementation <|.. and ..|>', function() {
    var t = '@startuml\nIAuth <|.. UserAuth\nMockAuth ..|> IAuth\n@enduml';
    var r = clMod.parse(t);
    expect(r.relations[0].kind).toBe('implementation');
    expect(r.relations[0].from).toBe('IAuth');
    expect(r.relations[1].kind).toBe('implementation');
    expect(r.relations[1].from).toBe('IAuth');
  });
  test('parses composition *-- and aggregation o--', function() {
    var t = '@startuml\nCar *-- Engine\nLibrary o-- Book\n@enduml';
    var r = clMod.parse(t);
    expect(r.relations[0].kind).toBe('composition');
    expect(r.relations[1].kind).toBe('aggregation');
  });
  test('parses dependency ..>', function() {
    var t = '@startuml\nFoo ..> Bar\n@enduml';
    var r = clMod.parse(t);
    expect(r.relations[0].kind).toBe('dependency');
  });
  test('parses relation with label', function() {
    var t = '@startuml\nFoo -- Bar : uses\n@enduml';
    var r = clMod.parse(t);
    expect(r.relations[0].label).toBe('uses');
  });
});

describe('class.parse — stereotype', function() {
  test('parses class with <<Entity>> stereotype', function() {
    var t = '@startuml\nclass User <<Entity>>\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].stereotype).toBe('Entity');
  });
  test('parses interface with <<Repository>> stereotype', function() {
    var t = '@startuml\ninterface UserRepo <<Repository>>\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].stereotype).toBe('Repository');
  });
  test('handles stereotype before block opening brace', function() {
    var t = '@startuml\nclass User <<Entity>> {\n}\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].stereotype).toBe('Entity');
    expect(r.elements[0].endLine).toBe(3);
  });
});

describe('class.parse — generics', function() {
  test('parses class with single generic Foo<T>', function() {
    var t = '@startuml\nclass Container<T>\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].id).toBe('Container');
    expect(r.elements[0].generics).toEqual(['T']);
  });
  test('parses class with multiple generics Map<K, V>', function() {
    var t = '@startuml\nclass Map<K, V>\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].generics).toEqual(['K', 'V']);
  });
  test('parses generics + stereotype', function() {
    var t = '@startuml\nclass Container<T> <<Generic>>\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].generics).toEqual(['T']);
    expect(r.elements[0].stereotype).toBe('Generic');
  });
  test('does not confuse <|-- inheritance with generics', function() {
    var t = '@startuml\nclass Foo<T>\nFoo<T> <|-- Bar\n@enduml';
    var r = clMod.parse(t);
    expect(r.elements[0].generics).toEqual(['T']);
    expect(r.relations[0].kind).toBe('inheritance');
    expect(r.relations[0].from).toBe('Foo<T>');
    expect(r.relations[0].to).toBe('Bar');
  });
});

describe('class.parse — package nesting', function() {
  test('assigns parentPackageId to class inside package', function() {
    var t = '@startuml\npackage "Domain" {\n  class User\n}\n@enduml';
    var r = clMod.parse(t);
    expect(r.groups.length).toBe(1);
    expect(r.groups[0].kind).toBe('package');
    expect(r.elements[0].parentPackageId).toBe(r.groups[0].id);
  });
});

describe('class.parse — namespace nesting', function() {
  test('parses namespace + nested class with parentPackageId', function() {
    var t = '@startuml\nnamespace foo {\n  class Bar\n}\n@enduml';
    var r = clMod.parse(t);
    expect(r.groups.length).toBe(1);
    expect(r.groups[0].kind).toBe('namespace');
    expect(r.elements[0].parentPackageId).toBe(r.groups[0].id);
  });
});

describe('class.parse — note (1-line)', function() {
  test('parses 1-line note left of class', function() {
    var t = '@startuml\nclass Foo\nnote left of Foo : implementation tip\n@enduml';
    var r = clMod.parse(t);
    expect(r.notes.length).toBe(1);
    expect(r.notes[0].position).toBe('left');
    expect(r.notes[0].targetId).toBe('Foo');
    expect(r.notes[0].text).toBe('implementation tip');
    expect(r.notes[0].line).toBe(3);
    expect(r.notes[0].endLine).toBe(3);
  });

  test('parses 1-line note for all 4 positions', function() {
    var t = '@startuml\nclass A\nclass B\nclass C\nclass D\n' +
      'note left of A : la\nnote right of B : rb\nnote top of C : tc\nnote bottom of D : bd\n' +
      '@enduml';
    var r = clMod.parse(t);
    expect(r.notes.length).toBe(4);
    expect(r.notes[0].position).toBe('left');
    expect(r.notes[1].position).toBe('right');
    expect(r.notes[2].position).toBe('top');
    expect(r.notes[3].position).toBe('bottom');
  });

  test('parses 1-line note for interface and abstract and enum', function() {
    var t = '@startuml\ninterface I\nabstract class A\nenum E { X }\n' +
      'note left of I : i\nnote right of A : a\nnote top of E : e\n@enduml';
    var r = clMod.parse(t);
    expect(r.notes.length).toBe(3);
    expect(r.notes[0].targetId).toBe('I');
    expect(r.notes[1].targetId).toBe('A');
    expect(r.notes[2].targetId).toBe('E');
  });

  test('lower-cases position keyword', function() {
    var t = '@startuml\nclass Foo\nnote LEFT of Foo : x\n@enduml';
    var r = clMod.parse(t);
    expect(r.notes[0].position).toBe('left');
  });

  test('assigns sequential ids to notes', function() {
    var t = '@startuml\nclass Foo\nnote left of Foo : a\nnote right of Foo : b\n@enduml';
    var r = clMod.parse(t);
    expect(r.notes[0].id).toBe('__n_0');
    expect(r.notes[1].id).toBe('__n_1');
  });
});

describe('class.parse — note (multi-line block)', function() {
  test('parses multi-line note block', function() {
    var t = '@startuml\nclass Foo\nnote left of Foo\n  first line\n  second line\nend note\n@enduml';
    var r = clMod.parse(t);
    expect(r.notes.length).toBe(1);
    expect(r.notes[0].position).toBe('left');
    expect(r.notes[0].targetId).toBe('Foo');
    expect(r.notes[0].text).toBe('first line\nsecond line');
    expect(r.notes[0].line).toBe(3);
    expect(r.notes[0].endLine).toBe(6);
  });

  test('multi-line note keeps internal blank lines', function() {
    var t = '@startuml\nclass Foo\nnote right of Foo\n  para 1\n\n  para 2\nend note\n@enduml';
    var r = clMod.parse(t);
    expect(r.notes[0].text).toBe('para 1\n\npara 2');
  });

  test('parses 1-line and multi-line notes in same diagram', function() {
    var t = '@startuml\nclass Foo\nnote left of Foo : single\n' +
      'class Bar\nnote right of Bar\n  multi\nend note\n@enduml';
    var r = clMod.parse(t);
    expect(r.notes.length).toBe(2);
    expect(r.notes[0].text).toBe('single');
    expect(r.notes[1].text).toBe('multi');
  });
});

// jsdom epilogue
if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
