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
  '../src/core/id-normalizer.js',
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
  test('fmtClass quoted label with generics (label != id)', function() {
    expect(clMod.fmtClass('Box', 'コンテナ', null, ['T'])).toBe('class "コンテナ" as Box<T>');
  });
});

describe('class normalizeIdInput', function() {
  test('ASCII alias passes through', function() {
    var n = clMod.normalizeIdInput('Foo', { elements: [] });
    expect(n).toEqual({ id: 'Foo', label: 'Foo', valid: true });
  });
  test('Japanese alias maps to C1', function() {
    var n = clMod.normalizeIdInput('クラスA', { elements: [] });
    expect(n.id).toBe('C1');
    expect(n.label).toBe('クラスA');
  });
  test('avoids id collision with existing C1 element', function() {
    var n = clMod.normalizeIdInput('日本語', { elements: [{ id: 'C1' }] });
    expect(n.id).toBe('C2');
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

describe('class fmtNote', function() {
  test('fmtNote 1-line for short single-line text', function() {
    var line = clMod.fmtNote('left', 'Foo', 'short tip');
    expect(line).toBe('note left of Foo : short tip');
  });
  test('fmtNote multi-line block for text with newline', function() {
    var lines = clMod.fmtNote('right', 'Bar', 'first\nsecond');
    expect(lines).toEqual(['note right of Bar', 'first', 'second', 'end note']);
  });
  test('fmtNote 1-line preserves spaces in text', function() {
    var line = clMod.fmtNote('top', 'Foo', 'a b  c');
    expect(line).toBe('note top of Foo : a b  c');
  });
  test('fmtNote multi-line preserves blank lines', function() {
    var lines = clMod.fmtNote('left', 'Foo', 'a\n\nb');
    expect(lines).toEqual(['note left of Foo', 'a', '', 'b', 'end note']);
  });
});

describe('class addNote', function() {
  test('addNote inserts 1-line note before @enduml', function() {
    var t = '@startuml\nclass Foo\n@enduml';
    var out = clMod.addNote(t, 'Foo', 'left', 'tip');
    expect(out).toContain('note left of Foo : tip');
    expect(out).toContain('@enduml');
  });
  test('addNote inserts multi-line block when text has newline', function() {
    var t = '@startuml\nclass Foo\n@enduml';
    var out = clMod.addNote(t, 'Foo', 'right', 'a\nb');
    var ls = out.split('\n');
    expect(ls.indexOf('note right of Foo') >= 0).toBe(true);
    expect(ls.indexOf('end note') >= 0).toBe(true);
  });
  test('addNote default position is left', function() {
    var t = '@startuml\nclass Foo\n@enduml';
    var out = clMod.addNote(t, 'Foo', null, 'x');
    expect(out).toContain('note left of Foo : x');
  });
});

describe('class updateNote', function() {
  test('updateNote changes position of 1-line note', function() {
    var t = '@startuml\nclass Foo\nnote left of Foo : tip\n@enduml';
    var out = clMod.updateNote(t, 3, 3, { position: 'right' });
    expect(out).toContain('note right of Foo : tip');
  });
  test('updateNote changes text of 1-line note', function() {
    var t = '@startuml\nclass Foo\nnote left of Foo : old\n@enduml';
    var out = clMod.updateNote(t, 3, 3, { text: 'new' });
    expect(out).toContain('note left of Foo : new');
  });
  test('updateNote converts 1-line to multi-line when text has newline', function() {
    var t = '@startuml\nclass Foo\nnote left of Foo : single\n@enduml';
    var out = clMod.updateNote(t, 3, 3, { text: 'a\nb' });
    var ls = out.split('\n');
    expect(ls.indexOf('note left of Foo') >= 0).toBe(true);
    expect(ls.indexOf('end note') >= 0).toBe(true);
  });
  test('updateNote replaces multi-line block', function() {
    var t = '@startuml\nclass Foo\nnote left of Foo\n  old1\n  old2\nend note\n@enduml';
    var out = clMod.updateNote(t, 3, 6, { text: 'new1\nnew2' });
    expect(out).toContain('new1');
    expect(out).toContain('new2');
    expect(out).not.toContain('old1');
  });
});

describe('class deleteNote', function() {
  test('deleteNote removes 1-line note', function() {
    var t = '@startuml\nclass Foo\nnote left of Foo : x\n@enduml';
    var out = clMod.deleteNote(t, 3, 3);
    expect(out).not.toContain('note left of Foo');
    expect(out).toContain('class Foo');
  });
  test('deleteNote removes multi-line block', function() {
    var t = '@startuml\nclass Foo\nnote left of Foo\n  body\nend note\n@enduml';
    var out = clMod.deleteNote(t, 3, 5);
    expect(out).not.toContain('note left');
    expect(out).not.toContain('end note');
    expect(out).not.toContain('body');
  });
  test('deleteNote preserves surrounding lines', function() {
    var t = '@startuml\nclass A\nnote left of A : tip\nclass B\n@enduml';
    var out = clMod.deleteNote(t, 3, 3);
    expect(out).toContain('class A');
    expect(out).toContain('class B');
  });
});

describe('class deleteClassWithNotes', function() {
  test('deleting a class also removes its notes', function() {
    var t = '@startuml\nclass Foo\nnote left of Foo : a\nnote right of Foo : b\nclass Bar\n@enduml';
    var out = clMod.deleteClassWithNotes(t, 'Foo');
    expect(out).not.toContain('class Foo');
    expect(out).not.toContain('note left of Foo');
    expect(out).not.toContain('note right of Foo');
    expect(out).toContain('class Bar');
  });
  test('deleting a class with multi-line notes removes the entire note blocks', function() {
    var t = '@startuml\nclass Foo\nnote left of Foo\n  body\nend note\nclass Bar\n@enduml';
    var out = clMod.deleteClassWithNotes(t, 'Foo');
    expect(out).not.toContain('class Foo');
    expect(out).not.toContain('note left of Foo');
    expect(out).not.toContain('end note');
    expect(out).not.toContain('body');
  });
  test('deleteClassWithNotes preserves notes targeting other classes', function() {
    var t = '@startuml\nclass Foo\nclass Bar\nnote left of Bar : keep\n@enduml';
    var out = clMod.deleteClassWithNotes(t, 'Foo');
    expect(out).not.toContain('class Foo');
    expect(out).toContain('note left of Bar : keep');
  });
});

describe('class line ops', function() {
  test('deleteLine removes class declaration', function() {
    var t = '@startuml\nclass Foo\n@enduml';
    var out = clMod.deleteLine(t, 2);
    expect(out).not.toContain('Foo');
  });
  test('setTitle inserts after @startuml', function() {
    var t = '@startuml\nclass Foo\n@enduml';
    var out = clMod.setTitle(t, 'My Diagram');
    expect(out).toContain('title My Diagram');
  });
  test('renameWithRefs updates id in class + relations', function() {
    var t = '@startuml\nclass Foo\nclass Bar\nFoo -- Bar\n@enduml';
    var out = clMod.renameWithRefs(t, 'Foo', 'Baz');
    expect(out).toContain('class Baz');
    expect(out).toContain('Baz -- Bar');
    expect(out).not.toContain('class Foo');
  });
});

describe('class member move/delete by index (closure-stale safe)', function() {
  test('moveMemberUpByIndex no-op for first member (does not swap with class declaration)', function() {
    var t = '@startuml\nclass Foo {\n  + a : int\n  + b : int\n}\n@enduml';
    var out = clMod.moveMemberUpByIndex(t, 'Foo', 0);
    expect(out).toBe(t);
    var ls = out.split('\n');
    expect(ls[1]).toBe('class Foo {');
  });
  test('moveMemberUpByIndex swaps within class block (idx 1 → 0)', function() {
    var t = '@startuml\nclass Foo {\n  + a : int\n  + b : int\n}\n@enduml';
    var out = clMod.moveMemberUpByIndex(t, 'Foo', 1);
    var ls = out.split('\n');
    expect(ls[1]).toBe('class Foo {');
    expect(ls[2]).toContain('+ b');
    expect(ls[3]).toContain('+ a');
    expect(ls[4]).toBe('}');
  });
  test('moveMemberDownByIndex no-op for last member', function() {
    var t = '@startuml\nclass Foo {\n  + a : int\n  + b : int\n}\n@enduml';
    var out = clMod.moveMemberDownByIndex(t, 'Foo', 1);
    expect(out).toBe(t);
  });
  test('moveMemberDownByIndex swaps within class block (idx 0 → 1)', function() {
    var t = '@startuml\nclass Foo {\n  + a : int\n  + b : int\n}\n@enduml';
    var out = clMod.moveMemberDownByIndex(t, 'Foo', 0);
    var ls = out.split('\n');
    expect(ls[2]).toContain('+ b');
    expect(ls[3]).toContain('+ a');
    expect(ls[4]).toBe('}');
  });
  test('moveMember*ByIndex returns text unchanged for unknown classId', function() {
    var t = '@startuml\nclass Foo {\n  + a : int\n}\n@enduml';
    expect(clMod.moveMemberUpByIndex(t, 'Bar', 0)).toBe(t);
    expect(clMod.moveMemberDownByIndex(t, 'Bar', 0)).toBe(t);
  });
  test('moveMemberUpByIndex with single-member class: no-op even on idx 0', function() {
    var t = '@startuml\nclass Foo {\n  + a : int\n}\n@enduml';
    var out = clMod.moveMemberUpByIndex(t, 'Foo', 0);
    expect(out).toBe(t);
    var ls = out.split('\n');
    expect(ls[1]).toBe('class Foo {');
    expect(ls[2]).toContain('+ a');
    expect(ls[3]).toBe('}');
  });
  test('deleteMemberByIndex deletes the correct member by index', function() {
    var t = '@startuml\nclass Foo {\n  + a : int\n  + b : int\n  + c : int\n}\n@enduml';
    var out = clMod.deleteMemberByIndex(t, 'Foo', 1);
    expect(out).toContain('+ a');
    expect(out).toContain('+ c');
    expect(out).not.toContain('+ b');
  });
  test('deleteMemberByIndex rapid same-index calls do NOT delete non-member lines (class brace preserved)', function() {
    // Reproduces the rapid-click bug: 3-member class, delete idx 0 four times in a row.
    // Without index-based safety: closure-captured m.line=stale would splice the closing '}'
    // and break DSL. With fix: each call re-parses, returns unchanged when idx out of range.
    var t = '@startuml\nclass Foo {\n  + a : int\n  + b : int\n  + c : int\n}\n@enduml';
    var t1 = clMod.deleteMemberByIndex(t, 'Foo', 0);   // members: [b, c]
    var t2 = clMod.deleteMemberByIndex(t1, 'Foo', 0);  // members: [c]
    var t3 = clMod.deleteMemberByIndex(t2, 'Foo', 0);  // members: []
    var t4 = clMod.deleteMemberByIndex(t3, 'Foo', 0);  // out-of-range: no-op
    expect(t3).toContain('class Foo {');
    expect(t3).toContain('}');
    expect(t3).not.toContain('+ a');
    expect(t3).not.toContain('+ b');
    expect(t3).not.toContain('+ c');
    expect(t4).toBe(t3);
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
