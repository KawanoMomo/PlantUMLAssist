'use strict';
// TICKET-owner-20261124-0422-1: 右パネルで名前 (id) を変えて「変更を反映」を押すと、宣言の行と、
// その名前を識別子として持つ行 (遷移・関係の両端、note の対象) を 1 回で付け替える。
// 4 図種 (state・class・component・usecase) で同じ共通の口 (dslUpdater.renameDecl) を通り、
// 付け替えは sequence と同じチェック「名前を変えたら関係の行も付け替える」(既定 on)。別ボタンは無い。
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
var TERMS = W.MA.terms;
var pushes = 0;
W.MA.history = W.MA.history || {};
W.MA.history.pushHistory = function() { pushes++; };

function byLine(coll, line, type) {
  return function(parsed) {
    var hit = (parsed[coll] || []).filter(function(x) { return x.line === line; })[0];
    if (!hit) throw new Error(coll + ' の ' + line + ' 行目が無い');
    return [{ type: type || hit.kind, id: hit.id, line: hit.line }];
  };
}

// 右パネルを描き、名前 (id) の欄を newId にして「変更を反映」を押した後の本文。refsOff ならチェックを外して押す。
function applyRename(c, refsOff) {
  var mod = M[c.mod];
  var current = c.lines.join(c.eol || '\n');
  var parsed = mod.parse(current);
  doc.body.innerHTML = '';
  var host = doc.createElement('div');
  doc.body.appendChild(host);
  mod.renderProps(c.pick(parsed), parsed, host, {
    getMmdText: function() { return current; }, setMmdText: function(t) { current = t; }, onUpdate: function() {},
  });
  var chk = doc.getElementById(c.check);
  var buttons = Array.prototype.map.call(host.querySelectorAll('button'), function(b) { return b.textContent.trim(); });
  doc.getElementById(c.idField).value = c.newId;
  if (refsOff) chk.checked = false;
  pushes = 0;
  doc.getElementById(c.apply).click();
  return { text: current, chk: chk, buttons: buttons, pushes: pushes };
}

function count(parsed, keys) {
  return keys.map(function(k) { return (parsed[k] || []).length; }).join('/');
}

var CASES = [
  { name: 'state', mod: 'plantumlState', idField: 'st-id', apply: 'st-update', check: 'st-rename-refs', newId: 'Idle2',
    counts: ['states', 'transitions'], eol: '\r\n',
    lines: ['@startuml', "' Idle is the waiting state", 'state Idle', 'state IdleWait', '[*] --> Idle',
      'Idle --> IdleWait : go', 'IdleWait --> Idle', 'note right of Idle : wait', '@enduml'],
    pick: byLine('states', 3, 'state'),
    same: [1, 2, 4, 9], changed: { 5: '[*] --> Idle2', 6: 'Idle2 --> IdleWait : go', 7: 'IdleWait --> Idle2', 8: 'note right of Idle2 : wait' } },
  { name: 'class', mod: 'plantumlClass', idField: 'cl-edit-id', apply: 'cl-edit-apply', check: 'cl-edit-rename-refs', newId: 'Bus2',
    counts: ['elements', 'relations'], eol: '\r\n',
    lines: ['@startuml', "' Bus is the shared line", 'class Bus {', '  +send()', '}', 'class BusCtl',
      'BusCtl --> Bus : uses', 'note right of Bus : shared', '@enduml'],
    pick: byLine('elements', 3),
    same: [1, 2, 4, 5, 6, 9], changed: { 7: 'BusCtl --> Bus2 : uses', 8: 'note right of Bus2 : shared' } },
  { name: 'component', mod: 'plantumlComponent', idField: 'co-edit-id', apply: 'co-edit-apply', check: 'co-edit-rename-refs', newId: 'Bus2',
    counts: ['elements', 'relations'], eol: '\r\n',
    lines: ['@startuml', "' Bus is the shared line", 'component Bus', 'component BusCtl', 'Bus --> BusCtl : data', '@enduml'],
    pick: byLine('elements', 3),
    same: [1, 2, 4, 6], changed: { 5: 'Bus2 --> BusCtl : data' } },
  { name: 'usecase', mod: 'plantumlUsecase', idField: 'uc-edit-id', apply: 'uc-edit-apply', check: 'uc-edit-rename-refs', newId: 'User2',
    counts: ['elements', 'relations'], eol: '\r\n',
    lines: ['@startuml', "' User signs in", 'actor User', 'actor UserAdmin', 'usecase "Login" as UC1', 'User --> UC1',
      'UserAdmin --> UC1', '@enduml'],
    pick: byLine('elements', 3),
    same: [1, 2, 4, 5, 7, 8], changed: { 6: 'User2 --> UC1' } },
];

describe('TICKET-owner-20261124-0422-1: 「変更を反映」の改名は参照する行も 1 回で付け替える', function() {
  CASES.forEach(function(c) {
    var before = c.lines.join(c.eol || '\n');
    var r = applyRename(c);
    var eol = c.eol || '\n';
    var out = r.text.split(eol);
    test(c.name + ': チェック「' + TERMS.renameRefs + '」が既定 on で出て、同じ語の別ボタンは無い', function() {
      expect(r.chk).not.toBeNull();
      expect(r.chk.checked).toBe(true);
      expect(r.buttons.indexOf(TERMS.renameRefs)).toBe(-1);
    });
    test(c.name + ': 参照する行が新しい名前に替わる', function() {
      Object.keys(c.changed).forEach(function(n) { expect(out[n - 1]).toBe(c.changed[n]); });
    });
    test(c.name + ': 宣言は新しい名前を持ち、元の名前の要素を残さない', function() {
      var decl = out[c.pick(M[c.mod].parse(before))[0].line - 1];
      expect(new RegExp('\\b' + c.newId + '\\b').test(decl)).toBe(true);
      var ids = (M[c.mod].parse(r.text)[c.counts[0]] || []).map(function(e) { return e.id; });
      expect(ids.indexOf(c.newId)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(c.pick(M[c.mod].parse(before))[0].id)).toBe(-1);
    });
    test(c.name + ': 同じ名前で始まる別の要素・コメント・ほかの行は 1 バイトも変わらない (改行コードも)', function() {
      expect(out.length).toBe(c.lines.length);
      c.same.forEach(function(n) { expect(out[n - 1]).toBe(c.lines[n - 1]); });
    });
    test(c.name + ': 要素の数・線の数が改名の前と同じ', function() {
      expect(count(M[c.mod].parse(r.text), c.counts)).toBe(count(M[c.mod].parse(before), c.counts));
    });
    test(c.name + ': 履歴は 1 回だけ積む (Ctrl+Z 1 回で全部戻る)', function() {
      expect(r.pushes).toBe(1);
    });
    test(c.name + ': チェックを外すと宣言の行だけが変わる', function() {
      var off = applyRename(c, true).text.split(eol);
      Object.keys(c.changed).forEach(function(n) { expect(off[n - 1]).toBe(c.lines[n - 1]); });
    });
  });
});

describe('dslUpdater.renameDecl', function() {
  var up = function(s) { return s.replace('class Bus', 'class Bus2'); };
  test('宣言は更新関数、外の行は識別子だけ付け替える', function() {
    var t = 'class Bus\nclass BusCtl\nBusCtl --> Bus';
    expect(DU.renameDecl(t, 1, 'Bus', 'Bus2', up, true)).toBe('class Bus2\nclass BusCtl\nBusCtl --> Bus2');
  });
  test('withRefs が偽なら宣言の行だけ', function() {
    var t = 'class Bus\nBusCtl --> Bus';
    expect(DU.renameDecl(t, 1, 'Bus', 'Bus2', up, false)).toBe('class Bus2\nBusCtl --> Bus');
  });
  test('宣言の行が更新関数で変わらない (宣言の無い要素) ときはその行も参照として付け替える', function() {
    var t = 'BusCtl --> Bus\nBus --> X';
    expect(DU.renameDecl(t, 1, 'Bus', 'Bus2', function(s) { return s; }, true)).toBe('BusCtl --> Bus2\nBus2 --> X');
  });
  test('CRLF の図で更新関数が宣言の行の \\r を落としても戻す', function() {
    var t = 'class Bus\r\nBusCtl --> Bus\r\n';
    var drop = function(s) { var l = s.split('\n'); l[0] = 'class Bus2'; return l.join('\n'); };
    expect(DU.renameDecl(t, 1, 'Bus', 'Bus2', drop, true)).toBe('class Bus2\r\nBusCtl --> Bus2\r\n');
    expect(DU.renameDecl(t, 1, 'Bus', 'Bus2', drop, false)).toBe('class Bus2\r\nBusCtl --> Bus\r\n');
  });
  test('名前が同じなら更新関数だけ', function() {
    var t = 'class Bus\nBusCtl --> Bus';
    expect(DU.renameDecl(t, 1, 'Bus', 'Bus', function(s) { return s + '!'; }, true)).toBe(t + '!');
  });
});

LOADED.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
global.window = prevWindow;
global.document = prevDocument;
