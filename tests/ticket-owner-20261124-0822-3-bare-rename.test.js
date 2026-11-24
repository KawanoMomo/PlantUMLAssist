'use strict';
// TICKET-owner-20261124-0822-3: 表示名を書いていない宣言 (`component Bus`・`[Bus]`・`actor User`・`usecase Login`・
// `state Idle`) の名前 (id) だけを替えて「変更を反映」を押すと、宣言の行は名前の字だけが替わる。
// 以前は前の名前を表示名に据えて `component "Bus" as Bus2` と書き、図は前の名前のまま描かれた。
// 表示名を書いてある宣言は表示名を残し、打った表示名は今どおり書く。class・sequence は今のまま。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

var ROOT = path.join(__dirname, '..');
var prevWindow = global.window, prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
dom.window.alert = function() {};
dom.window.confirm = function() { return true; };
var doc = dom.window.document;
var CORE = ['html-utils', 'dsl-utils', 'regex-parts', 'id-normalizer', 'line-resolver', 'formatter-interface', 'text-updater',
  'dsl-updater', 'parser-utils', 'props-renderer', 'overlay-builder', 'history', 'selection', 'selection-reorder',
  'swimlane-move', 'activity-insert', 'label-colors', 'note-edit', 'note-block', 'relation-kind-cards', 'relation-options',
  'relation-roles', 'relation-add', 'group-notation', 'group-place', 'seq-place', 'sequence-marks', 'sequence-autonumber',
  'sequence-participant-zone', 'sequence-scaffold', 'sequence-group-range', 'sequence-activation-insert', 'insert-marker',
  'state-branch', 'state-transition', 'state-insert', 'state-tx-entry', 'state-child', 'state-collapse', 'class-scaffold',
  'class-derive', 'selected-endpoints', 'scaffold-notice', 'alias-hint', 'tail-kind-chips', 'tail-memory', 'activity-branch-pattern',
  'generated-part', 'add-kind-vocab', 'edge-hint'];
var LOADED = [];
CORE.forEach(function(c) {
  var p = path.join(ROOT, 'src', 'core', c + '.js');
  if (!fs.existsSync(p)) return;
  try { delete require.cache[require.resolve(p)]; require(p); LOADED.push(p); } catch (e) {}
});
['src/ui/terms.js', 'src/ui/properties.js', 'src/ui/rich-label-editor.js', 'src/modules/sequence.js', 'src/modules/usecase.js',
  'src/modules/component.js', 'src/modules/class.js', 'src/modules/state.js'].forEach(function(rel) {
  var p = path.join(ROOT, rel);
  delete require.cache[require.resolve(p)];
  require(p);
  LOADED.push(p);
});
var W = dom.window;
var M = W.MA.modules;
var DU = W.MA.dslUpdater;
W.MA.history = W.MA.history || {};
W.MA.history.pushHistory = function() {};

var FORMS = {
  component: { mod: 'plantumlComponent', idField: 'co-edit-id', labelField: 'co-edit-label', apply: 'co-edit-apply', coll: 'elements' },
  usecase: { mod: 'plantumlUsecase', idField: 'uc-edit-id', labelField: 'uc-edit-label', apply: 'uc-edit-apply', coll: 'elements' },
  state: { mod: 'plantumlState', idField: 'st-id', labelField: 'st-label', apply: 'st-update', coll: 'states' },
  class: { mod: 'plantumlClass', idField: 'cl-edit-id', labelField: 'cl-edit-label', apply: 'cl-edit-apply', coll: 'elements' },
};

// 右パネルを描き、名前 (id) の欄を newId にして (label を渡せば表示名の欄も打って)「変更を反映」を押した後の本文。
function applyRename(kind, lines, line, newId, label) {
  var f = FORMS[kind];
  var mod = M[f.mod];
  var current = lines.join('\n');
  var parsed = mod.parse(current);
  var hit = (parsed[f.coll] || []).filter(function(x) { return x.line === line; })[0];
  if (!hit) throw new Error(kind + ' の ' + line + ' 行目が無い');
  doc.body.innerHTML = '';
  var host = doc.createElement('div');
  doc.body.appendChild(host);
  mod.renderProps([{ type: kind === 'state' ? 'state' : hit.kind, id: hit.id, line: hit.line }], parsed, host, {
    getMmdText: function() { return current; }, setMmdText: function(t) { current = t; }, onUpdate: function() {},
  });
  doc.getElementById(f.idField).value = newId;
  if (label != null) doc.getElementById(f.labelField).value = label;
  doc.getElementById(f.apply).click();
  return current.split('\n');
}

function ids(kind, text) {
  var f = FORMS[kind];
  return (M[f.mod].parse(text)[f.coll] || []).map(function(e) { return e.id; });
}

describe('TICKET-owner-20261124-0822-3: 表示名の無い宣言の改名は名前の字だけを替える', function() {
  [
    { kind: 'component', lines: ['@startuml', 'component Bus', 'component Ctl', 'Bus --> Ctl : data', '@enduml'],
      line: 2, newId: 'Bus2', decl: 'component Bus2', ref: { 4: 'Bus2 --> Ctl : data' } },
    { kind: 'component', lines: ['@startuml', '[Bus]', '[Ctl]', '[Bus] --> [Ctl]', '@enduml'],
      line: 2, newId: 'Bus2', decl: '[Bus2]', ref: { 4: '[Bus2] --> [Ctl]' } },
    { kind: 'component', lines: ['@startuml', 'component Bus <<hw>>', 'Bus --> Ctl', '@enduml'],
      line: 2, newId: 'Bus2', decl: 'component Bus2 <<hw>>', ref: { 3: 'Bus2 --> Ctl' } },
    { kind: 'usecase', lines: ['@startuml', 'actor User', 'usecase "Login" as UC1', 'User --> UC1', '@enduml'],
      line: 2, newId: 'User2', decl: 'actor User2', ref: { 4: 'User2 --> UC1' } },
    { kind: 'usecase', lines: ['@startuml', 'actor User', 'usecase Login', 'User --> Login', '@enduml'],
      line: 3, newId: 'Login2', decl: 'usecase Login2', ref: { 4: 'User --> Login2' } },
    { kind: 'state', lines: ['@startuml', 'state Idle', 'state Run', '[*] --> Idle', 'Idle --> Run : go', '@enduml'],
      line: 2, newId: 'Idle2', decl: 'state Idle2', ref: { 4: '[*] --> Idle2', 5: 'Idle2 --> Run : go' } },
    { kind: 'state', lines: ['@startuml', 'state Idle #pink {', '  state Sub', '}', 'Idle --> Run', '@enduml'],
      line: 2, newId: 'Idle2', decl: 'state Idle2 #pink {', ref: { 5: 'Idle2 --> Run' } },
    { kind: 'class', lines: ['@startuml', 'class Bus', 'class Ctl', 'Ctl --> Bus', '@enduml'],
      line: 2, newId: 'Bus2', decl: 'class Bus2', ref: { 4: 'Ctl --> Bus2' } },
  ].forEach(function(c) {
    var out = applyRename(c.kind, c.lines, c.line, c.newId);
    test(c.kind + ': `' + c.lines[c.line - 1] + '` → `' + c.decl + '` (表示名を足さない)', function() {
      expect(out[c.line - 1]).toBe(c.decl);
    });
    test(c.kind + ': `' + c.lines[c.line - 1] + '` の参照の行も付け替わり、ほかの行は動かない', function() {
      expect(out.length).toBe(c.lines.length);
      c.lines.forEach(function(l, i) {
        var n = i + 1;
        if (n === c.line) return;
        expect(out[i]).toBe(c.ref[n] != null ? c.ref[n] : l);
      });
    });
    test(c.kind + ': 新しい名前の要素だけになる (前の名前の要素は残らない)', function() {
      var got = ids(c.kind, out.join('\n'));
      expect(got.indexOf(c.newId)).toBeGreaterThanOrEqual(0);
      var f = FORMS[c.kind];
      var oldId = (M[f.mod].parse(c.lines.join('\n'))[f.coll] || []).filter(function(x) { return x.line === c.line; })[0].id;
      expect(got.indexOf(oldId)).toBe(-1);
    });
  });
});

describe('TICKET-owner-20261124-0822-3: 表示名を書いてある宣言・打った表示名は今どおり', function() {
  test('component: `component "制御" as Bus` は表示名を残して別名だけが替わる', function() {
    var out = applyRename('component', ['@startuml', 'component "制御" as Bus', 'Bus --> Ctl', '@enduml'], 2, 'Bus2');
    expect(out[1]).toBe('component "制御" as Bus2');
    expect(out[2]).toBe('Bus2 --> Ctl');
  });
  test('usecase: `actor "利用者" as User` は表示名を残す', function() {
    var out = applyRename('usecase', ['@startuml', 'actor "利用者" as User', 'User --> (Login)', '@enduml'], 2, 'User2');
    expect(out[1]).toBe('actor "利用者" as User2');
  });
  test('state: `state "待機" as Idle` は表示名を残す', function() {
    var out = applyRename('state', ['@startuml', 'state "待機" as Idle', '[*] --> Idle', '@enduml'], 2, 'Idle2');
    expect(out[1]).toBe('state "待機" as Idle2');
    expect(out[2]).toBe('[*] --> Idle2');
  });
  test('state: 表示名の無い宣言で表示名を打てば、新しい名前に表示名が付く', function() {
    var out = applyRename('state', ['@startuml', 'state Idle', '[*] --> Idle', '@enduml'], 2, 'Idle2', '待機');
    expect(out[1]).toBe('state "待機" as Idle2');
    expect(out[2]).toBe('[*] --> Idle2');
  });
  test('component: 表示名の無い宣言で表示名を打てば、新しい名前に表示名が付く', function() {
    var out = applyRename('component', ['@startuml', 'component Bus', 'Bus --> Ctl', '@enduml'], 2, 'Bus2', '制御');
    expect(out[1]).toBe('component "制御" as Bus2');
    expect(out[2]).toBe('Bus2 --> Ctl');
  });
  test('state: 名前を替えずに表示名の欄を開いたまま反映しても宣言は変わらない', function() {
    var out = applyRename('state', ['@startuml', 'state Idle', '[*] --> Idle', '@enduml'], 2, 'Idle');
    expect(out[1]).toBe('state Idle');
  });
});

describe('dslUpdater.renameDecl: 表示名の無い宣言は更新関数を通さず名前の字だけ', function() {
  var bad = function(s) { return s.replace('component Bus', 'component "Bus" as Bus2'); };
  test('`component Bus` は更新関数の書き方に依らず `component Bus2`', function() {
    expect(DU.renameDecl('component Bus\nBus --> X', 1, 'Bus', 'Bus2', bad, true)).toBe('component Bus2\nBus2 --> X');
    expect(DU.renameDecl('component Bus\nBus --> X', 1, 'Bus', 'Bus2', bad, false)).toBe('component Bus2\nBus --> X');
  });
  test('`:User:` のアクター・`(Login)` のユースケースも名前の字だけ', function() {
    expect(DU.renameDecl('actor :User:\n:User: --> (L)', 1, 'User', 'U2', function(s) { return s; }, true))
      .toBe('actor :U2:\n:U2: --> (L)');
    expect(DU.renameDecl('usecase (Login)', 1, 'Login', 'Login2', function(s) { return s; }, true)).toBe('usecase (Login2)');
  });
  test('表示名のある宣言 (引用符・as) は更新関数に任せる', function() {
    var up = function(s) { return s.replace('as Bus', 'as Bus2'); };
    expect(DU.renameDecl('component "B" as Bus', 1, 'Bus', 'Bus2', up, true)).toBe('component "B" as Bus2');
    var up2 = function(s) { return s.replace('Bus as B', 'Bus2 as B'); };
    expect(DU.renameDecl('component Bus as B', 1, 'Bus', 'Bus2', up2, false)).toBe('component Bus2 as B');
  });
  test('CRLF の宣言の行は \\r を残す', function() {
    expect(DU.renameDecl('state Idle\r\n[*] --> Idle\r\n', 1, 'Idle', 'Idle2', function(s) { return s; }, true))
      .toBe('state Idle2\r\n[*] --> Idle2\r\n');
  });
});

LOADED.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
global.window = prevWindow;
global.document = prevDocument;
