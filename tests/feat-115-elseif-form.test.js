'use strict';
// FEAT-115 (HFR-061): elseif 追加の prompt() 2 回を 1 枚のフォームにする。
// 判定層は FEAT-115 spec の指定に従う: E2E = [AC-1] [AC-6]、単体 = [AC-2] [AC-3] [AC-4] [AC-5]。
// [AC-7] (既存 showInsertForm の回帰なし) は変更前コードでも必ず PASS しテストを追加しない
// (E5 = 変更前 FAIL の観測が構造上成立しない)。E4 の実機操作と既存 E2E で見る。
var fs = require('fs'), path = require('path'), jsdom = require('jsdom');
var ROOT = path.join(__dirname, '..');
var SRC = ('src/core/html-utils.js src/core/dsl-utils.js src/core/regex-parts.js ' +
  'src/core/id-normalizer.js src/core/line-resolver.js src/core/formatter-interface.js ' +
  'src/core/dsl-updater.js src/core/props-renderer.js src/core/text-updater.js ' +
  'src/core/parser-utils.js src/core/history.js src/core/selection.js ' +
  'src/ui/properties.js src/modules/activity.js').split(' ');
var FIXTURE = ['@startuml', 'start', ':A;', 'if (cond1?) then (yes)', '  :X;',
  'else (no)', '  :Y;', 'endif', 'stop', '@enduml'].join('\n');

// withModal=true なら act-modal を持つ DOM、false なら持たない DOM を作る ([AC-5])。
function makeWindow(withModal) {
  var body = withModal ? '<div id="act-modal" style="display:none"><div id="act-modal-content"></div></div>' : '<div id="x"></div>';
  var W = new jsdom.JSDOM('<!DOCTYPE html><html><body>' + body + '</body></html>').window;
  SRC.forEach(function(rel) {
    var code = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
    var fn = new Function('window', 'document', 'localStorage', 'alert', 'confirm', 'prompt', code);
    fn(W, W.document, { getItem: function() { return null; }, setItem: function() {} },
       function() {}, function() { return true; }, function() { return null; });
  });
  return W;
}
function setup(W) {
  var st = { text: FIXTURE, pushes: 0, updates: 0 };
  st.ctx = { getMmdText: function() { return st.text; },
             setMmdText: function(t) { st.text = t; },
             onUpdate: function() { st.updates++; } };
  W.MA.history.init(st.ctx);
  W.MA.history.pushHistory = function() { st.pushes++; };
  return st;
}
var ACT_WITH = makeWindow(true), ACT_NO = makeWindow(false);
var A_WITH = ACT_WITH.MA.modules.plantumlActivity, A_NO = ACT_NO.MA.modules.plantumlActivity;
var IF_NODE = { line: 4, kind: 'if' };   // FIXTURE の 'if (cond1?) then (yes)' は 4 行目
function byId(W, id) { return W.document.getElementById(id); }

describe('FEAT-115 elseif を 1 枚のフォームで入力する', function() {
  test('[AC-2] 確定で生成される DSL は addElseifBranch の出力とバイト単位で同一', function() {
    var st = setup(ACT_WITH), before = st.text;
    A_WITH.showElseifForm(st.ctx, IF_NODE);
    byId(ACT_WITH, 'act-ei-cond').value = 'cond2?';
    byId(ACT_WITH, 'act-ei-lbl').value = 'maybe';
    byId(ACT_WITH, 'act-ei-confirm').click();
    expect(st.text).toBe(A_WITH.addElseifBranch(before, IF_NODE.line, 'cond2?', 'maybe'));
    expect(st.text).not.toBe(before);
    expect(st.pushes).toBe(1);
    expect(st.updates).toBe(1);
  });
  test('[AC-3] label を空のまま確定すると既定値 yes になる', function() {
    var st = setup(ACT_WITH), before = st.text;
    A_WITH.showElseifForm(st.ctx, IF_NODE);
    byId(ACT_WITH, 'act-ei-cond').value = 'cond3?';
    byId(ACT_WITH, 'act-ei-lbl').value = '';
    byId(ACT_WITH, 'act-ei-confirm').click();
    expect(st.text).toBe(A_WITH.addElseifBranch(before, IF_NODE.line, 'cond3?', 'yes'));
    expect(st.text).not.toBe(before);
  });
  test('[AC-4] キャンセルで DSL が 1 バイトも変わらず pushHistory も呼ばれない', function() {
    var st = setup(ACT_WITH), before = st.text;
    A_WITH.showElseifForm(st.ctx, IF_NODE);
    byId(ACT_WITH, 'act-ei-cancel').click();
    expect(st.text).toBe(before);
    expect(st.pushes).toBe(0);
    expect(st.updates).toBe(0);
    expect(byId(ACT_WITH, 'act-modal').style.display).toBe('none');
  });
  test('[AC-5] act-modal 不在なら prompt() にフォールバックし機能を失わない', function() {
    var st = setup(ACT_NO), before = st.text, asked = [];
    ACT_NO.prompt = function(m) { asked.push(m); return asked.length === 1 ? 'cond4?' : 'later'; };
    A_NO.showElseifForm(st.ctx, IF_NODE);
    expect(asked.length).toBe(2);
    expect(st.text).toBe(A_NO.addElseifBranch(before, IF_NODE.line, 'cond4?', 'later'));
    expect(st.text).not.toBe(before);
  });
  test('[AC-5] フォールバックで condition をキャンセルすると何も起きない', function() {
    var st = setup(ACT_NO), before = st.text;
    ACT_NO.prompt = function() { return null; };
    A_NO.showElseifForm(st.ctx, IF_NODE);
    expect(st.text).toBe(before);
    expect(st.pushes).toBe(0);
  });
});
