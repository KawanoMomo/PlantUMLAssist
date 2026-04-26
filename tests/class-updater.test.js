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

describe('class formatters (canonical emit)', function() {
  test('fmtClass with bare id', function() {
    expect(clMod.fmtClass('Foo', 'Foo', null, null)).toBe('class Foo');
  });
  test('fmtClass with quoted label', function() {
    expect(clMod.fmtClass('User', 'Long User Name', null, null)).toBe('class "Long User Name" as User');
  });
  test('fmtClass with generics', function() {
    expect(clMod.fmtClass('Container', 'Container', null, ['T'])).toBe('class Container<T>');
  });
  test('fmtClass with stereotype', function() {
    expect(clMod.fmtClass('User', 'User', 'Entity', null)).toBe('class User <<Entity>>');
  });
  test('fmtClass with generics + stereotype', function() {
    expect(clMod.fmtClass('Container', 'Container', 'Generic', ['T'])).toBe('class Container<T> <<Generic>>');
  });
  test('fmtRelation inheritance canonical', function() {
    expect(clMod.fmtRelation('inheritance', 'Animal', 'Dog')).toBe('Animal <|-- Dog');
  });
  test('fmtRelation composition', function() {
    expect(clMod.fmtRelation('composition', 'Car', 'Engine')).toBe('Car *-- Engine');
  });
  test('fmtRelation with label', function() {
    expect(clMod.fmtRelation('association', 'Foo', 'Bar', 'uses')).toBe('Foo -- Bar : uses');
  });
  test('fmtAttribute', function() {
    expect(clMod.fmtAttribute('+', 'name', 'String', false)).toBe('+ name : String');
    expect(clMod.fmtAttribute('-', 'count', 'int', true)).toBe('- {static} count : int');
  });
  test('fmtMethod', function() {
    expect(clMod.fmtMethod('+', 'login', '', 'void', false, false)).toBe('+ login() : void');
    expect(clMod.fmtMethod('+', 'validate', '', 'bool', false, true)).toBe('+ {abstract} validate() : bool');
  });
});

describe('class add operations', function() {
  test('addClass appends before @enduml', function() {
    var t = '@startuml\n@enduml';
    var out = clMod.addClass(t, 'Foo', 'Foo', null, null);
    expect(out).toContain('class Foo');
    expect(out.indexOf('class Foo')).toBeLessThan(out.indexOf('@enduml'));
  });
  test('addRelation appends', function() {
    var t = '@startuml\nclass A\nclass B\n@enduml';
    var out = clMod.addRelation(t, 'inheritance', 'A', 'B');
    expect(out).toContain('A <|-- B');
  });
  test('addInterface emits interface keyword', function() {
    var t = '@startuml\n@enduml';
    var out = clMod.addInterface(t, 'IAuth', 'IAuth');
    expect(out).toContain('interface IAuth');
  });
  test('addEnum with values emits block form', function() {
    var t = '@startuml\n@enduml';
    var out = clMod.addEnum(t, 'Color', 'Color', ['RED', 'GREEN']);
    expect(out).toContain('enum Color {');
    expect(out).toContain('RED');
    expect(out).toContain('GREEN');
    expect(out).toContain('}');
  });
});

describe('class update operations', function() {
  test('updateClass changes id', function() {
    var t = '@startuml\nclass Foo\n@enduml';
    var out = clMod.updateClass(t, 2, 'id', 'Bar');
    expect(out).toContain('class Bar');
    expect(out).not.toContain('class Foo');
  });
  test('updateClass adds stereotype', function() {
    var t = '@startuml\nclass Foo\n@enduml';
    var out = clMod.updateClass(t, 2, 'stereotype', 'Entity');
    expect(out).toContain('class Foo <<Entity>>');
  });
  test('updateRelation changes kind', function() {
    var t = '@startuml\nFoo -- Bar\n@enduml';
    var out = clMod.updateRelation(t, 2, 'kind', 'inheritance');
    expect(out).toContain('Foo <|-- Bar');
  });
  test('updateRelation swap', function() {
    var t = '@startuml\nFoo -- Bar\n@enduml';
    var out = clMod.updateRelation(t, 2, 'swap');
    expect(out).toContain('Bar -- Foo');
  });
});

describe('class member operations', function() {
  test('addAttribute inserts before closing brace', function() {
    var t = '@startuml\nclass Foo {\n}\n@enduml';
    var out = clMod.addAttribute(t, 2, '+', 'name', 'String', false);
    expect(out).toContain('+ name : String');
    expect(out.indexOf('+ name')).toBeLessThan(out.indexOf('}'));
  });
  test('addMethod inserts before closing brace', function() {
    var t = '@startuml\nclass Foo {\n}\n@enduml';
    var out = clMod.addMethod(t, 2, '+', 'login', '', 'void', false, false);
    expect(out).toContain('+ login() : void');
  });
  test('updateAttribute changes visibility', function() {
    var t = '@startuml\nclass Foo {\n  + name : String\n}\n@enduml';
    var out = clMod.updateAttribute(t, 3, 'visibility', '-');
    expect(out).toContain('- name : String');
  });
  test('deleteMember removes member line', function() {
    var t = '@startuml\nclass Foo {\n  + name : String\n  + id : int\n}\n@enduml';
    var out = clMod.deleteMember(t, 3);
    expect(out).not.toContain('name');
    expect(out).toContain('id');
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
