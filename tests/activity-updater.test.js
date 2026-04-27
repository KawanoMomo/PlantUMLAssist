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
  '../src/modules/activity.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var actMod = global.window.MA.modules.plantumlActivity;

describe('activity formatters', function() {
  test('fmtAction single-line', function() {
    expect(actMod.fmtAction('Hello')).toBe(':Hello;');
  });
  test('fmtAction multi-line', function() {
    expect(actMod.fmtAction('a\nb')).toBe(':a\nb;');
  });
  test('fmtIf with then label', function() {
    expect(actMod.fmtIf('cond?', 'yes')).toBe('if (cond?) then (yes)');
  });
  test('fmtElse with label', function() {
    expect(actMod.fmtElse('no')).toBe('else (no)');
  });
  test('fmtElseif', function() {
    expect(actMod.fmtElseif('b?', 'maybe')).toBe('elseif (b?) then (maybe)');
  });
  test('fmtWhile with is label', function() {
    expect(actMod.fmtWhile('cond?', 'yes')).toBe('while (cond?) is (yes)');
  });
  test('fmtRepeatWhile', function() {
    expect(actMod.fmtRepeatWhile('cond?', 'yes')).toBe('repeat while (cond?) is (yes)');
  });
  test('fmtSwimlane', function() {
    expect(actMod.fmtSwimlane('Frontend')).toBe('|Frontend|');
  });
  test('fmtNote 1-line', function() {
    expect(actMod.fmtNote('right', 'tip')).toBe('note right : tip');
  });
  test('fmtNote multi-line returns array', function() {
    expect(actMod.fmtNote('left', 'a\nb')).toEqual(['note left', 'a', 'b', 'end note']);
  });
});

describe('activity add ops', function() {
  test('addAction inserts before @enduml', function() {
    var t = '@startuml\nstart\n@enduml';
    var out = actMod.addAction(t, 'Hello');
    expect(out).toContain(':Hello;');
    expect(out.split('\n').indexOf(':Hello;')).toBeGreaterThan(0);
  });
  test('addIf inserts skeleton with then/endif', function() {
    var t = '@startuml\nstart\n@enduml';
    var out = actMod.addIf(t, 'cond?', 'yes', 'no');
    expect(out).toContain('if (cond?) then (yes)');
    expect(out).toContain('else (no)');
    expect(out).toContain('endif');
  });
  test('addWhile inserts while/endwhile skeleton', function() {
    var t = '@startuml\nstart\n@enduml';
    var out = actMod.addWhile(t, 'cond?', 'yes');
    expect(out).toContain('while (cond?) is (yes)');
    expect(out).toContain('endwhile');
  });
  test('addRepeat inserts repeat ... repeat while skeleton', function() {
    var t = '@startuml\nstart\n@enduml';
    var out = actMod.addRepeat(t, 'cond?', 'yes');
    expect(out).toContain('repeat');
    expect(out).toContain('repeat while (cond?) is (yes)');
  });
  test('addFork inserts fork/end fork with N branches', function() {
    var t = '@startuml\nstart\n@enduml';
    var out = actMod.addFork(t, 3);
    var s = out.split('\n');
    var againCount = s.filter(function(l) { return /^fork again\s*$/.test(l); }).length;
    expect(againCount).toBe(2);
    expect(out).toContain('end fork');
  });
  test('addSwimlane inserts swimlane block', function() {
    var t = '@startuml\nstart\n@enduml';
    var out = actMod.addSwimlane(t, 'Frontend');
    expect(out).toContain('|Frontend|');
  });
  test('addNote inserts after specified action line', function() {
    var t = '@startuml\nstart\n:A;\nstop\n@enduml';
    var out = actMod.addNote(t, 3, 'right', 'tip');
    var s = out.split('\n');
    expect(s[3]).toBe('note right : tip');
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
