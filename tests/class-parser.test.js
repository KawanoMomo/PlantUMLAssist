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

// jsdom epilogue
if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
