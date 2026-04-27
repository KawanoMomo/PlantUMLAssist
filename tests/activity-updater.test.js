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

describe('activity update/delete ops', function() {
  test('updateAction changes text', function() {
    var t = '@startuml\n:old;\n@enduml';
    var out = actMod.updateAction(t, 2, 2, 'new');
    expect(out).toContain(':new;');
    expect(out).not.toContain(':old;');
  });
  test('updateAction handles multi-line replacement', function() {
    var t = '@startuml\n:old;\n@enduml';
    var out = actMod.updateAction(t, 2, 2, 'a\nb');
    expect(out).toContain(':a');
    expect(out).toContain('b;');
  });
  test('updateIfCondition changes condition', function() {
    var t = '@startuml\nif (old) then (yes)\nendif\n@enduml';
    var out = actMod.updateIfCondition(t, 2, 'new');
    expect(out).toContain('if (new)');
  });
  test('updateBranchLabel changes branch label', function() {
    var t = '@startuml\nif (a) then (yes)\nelse (no)\nendif\n@enduml';
    var out = actMod.updateBranchLabel(t, 3, 'false');
    expect(out).toContain('else (false)');
  });
  test('updateWhileCondition changes condition', function() {
    var t = '@startuml\nwhile (old) is (yes)\nendwhile\n@enduml';
    var out = actMod.updateWhileCondition(t, 2, 'new');
    expect(out).toContain('while (new)');
  });
  test('updateSwimlane renames label', function() {
    var t = '@startuml\n|Old|\n@enduml';
    var out = actMod.updateSwimlane(t, 2, 'New');
    expect(out).toContain('|New|');
    expect(out).not.toContain('|Old|');
  });
  test('updateNote changes position + text', function() {
    var t = '@startuml\n:A;\nnote right : old\n@enduml';
    var out = actMod.updateNote(t, 3, 3, { position: 'left', text: 'new' });
    expect(out).toContain('note left : new');
  });
  test('deleteNode removes single-line node', function() {
    var t = '@startuml\nstart\n:A;\nstop\n@enduml';
    var out = actMod.deleteNode(t, 3, 3);
    expect(out).not.toContain(':A;');
    expect(out).toContain('start');
    expect(out).toContain('stop');
  });
  test('deleteNode removes block (line range)', function() {
    var t = '@startuml\nif (a) then\n:A;\nendif\n@enduml';
    var out = actMod.deleteNode(t, 2, 4);
    expect(out).not.toContain('if (a)');
    expect(out).not.toContain('endif');
  });
});

describe('activity addActionAtLine (mid-insertion)', function() {
  test('inserts before specified line', function() {
    var t = '@startuml\nstart\n:A;\nstop\n@enduml';
    var out = actMod.addActionAtLine(t, 3, 'before', 'NEW');
    var lines = out.split('\n');
    expect(lines[1]).toBe('start');
    expect(lines[2]).toBe(':NEW;');
    expect(lines[3]).toBe(':A;');
    expect(lines[4]).toBe('stop');
  });
  test('inserts after specified line', function() {
    var t = '@startuml\nstart\n:A;\nstop\n@enduml';
    var out = actMod.addActionAtLine(t, 3, 'after', 'NEW');
    var lines = out.split('\n');
    expect(lines[3]).toBe(':NEW;');
    expect(lines[4]).toBe('stop');
  });
  test('preserves indent of surrounding lines (inside if-block)', function() {
    var t = '@startuml\nif (a) then\n  :A;\nendif\n@enduml';
    var out = actMod.addActionAtLine(t, 3, 'before', 'NEW');
    var lines = out.split('\n');
    expect(lines[2]).toBe('  :NEW;');
    expect(lines[3]).toBe('  :A;');
  });
  test('boundary: insert before line 1', function() {
    var t = ':A;';
    var out = actMod.addActionAtLine(t, 1, 'before', 'NEW');
    var lines = out.split('\n');
    expect(lines[0]).toBe(':NEW;');
    expect(lines[1]).toBe(':A;');
  });
});

describe('activity resolveInsertLine (Y → line/position mapping)', function() {
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function makeOverlay(rectsSpec) {
    var ov = document.createElementNS(SVG_NS, 'svg');
    rectsSpec.forEach(function(r) {
      var el = document.createElementNS(SVG_NS, 'rect');
      Object.keys(r).forEach(function(k) { el.setAttribute(k, r[k]); });
      ov.appendChild(el);
    });
    return ov;
  }
  test('returns null for empty overlay', function() {
    var ov = makeOverlay([]);
    expect(actMod.resolveInsertLine(ov, 50)).toBe(null);
  });
  test('y above all rects: before first node', function() {
    var ov = makeOverlay([
      { 'data-type': 'action', 'data-line': '5', y: '50', height: '20' },
      { 'data-type': 'action', 'data-line': '7', y: '100', height: '20' },
    ]);
    var res = actMod.resolveInsertLine(ov, 10);
    expect(res.line).toBe(5);
    expect(res.position).toBe('before');
  });
  test('y between two rects: after upper rect', function() {
    var ov = makeOverlay([
      { 'data-type': 'action', 'data-line': '5', y: '50', height: '20' },
      { 'data-type': 'action', 'data-line': '7', y: '100', height: '20' },
    ]);
    var res = actMod.resolveInsertLine(ov, 80);
    expect(res.line).toBe(5);
    expect(res.position).toBe('after');
  });
  test('y below all rects: after last node', function() {
    var ov = makeOverlay([
      { 'data-type': 'action', 'data-line': '5', y: '50', height: '20' },
      { 'data-type': 'action', 'data-line': '7', y: '100', height: '20' },
    ]);
    var res = actMod.resolveInsertLine(ov, 200);
    expect(res.line).toBe(7);
    expect(res.position).toBe('after');
  });
  test('mixed kinds (start/action/decision/stop) all considered', function() {
    var ov = makeOverlay([
      { 'data-type': 'start', 'data-line': '2', y: '20', height: '20' },
      { 'data-type': 'decision', 'data-line': '4', y: '60', height: '24' },
      { 'data-type': 'action', 'data-line': '5', y: '100', height: '20' },
      { 'data-type': 'stop', 'data-line': '7', y: '150', height: '22' },
    ]);
    var res = actMod.resolveInsertLine(ov, 80);
    expect(res.line).toBe(4);
    expect(res.position).toBe('after');
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
