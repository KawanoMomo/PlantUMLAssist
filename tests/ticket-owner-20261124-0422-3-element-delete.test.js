'use strict';
// TICKET-owner-20261124-0422-3: 線・メッセージ・note の付いた要素の「✕ 削除」が図種ごとに 4 通りで、
// コンポーネント・アクター・シーケンスの参加者は宣言の行だけを消し、要素が図に残った。
// 6 図種の削除は共通部 MA.elementDelete (消える行を集める・本数を言う窓・消す) を通り、
// Delete キーは右パネルの要素の削除ボタン (data-el-delete) を押す。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var ROOT = path.join(__dirname, '..');
// 他の test が global.window を差し替えるので、run-tests.js と同じ並びの src を自前の jsdom に読む。
var W = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>').window;
var runner = fs.readFileSync(path.join(__dirname, 'run-tests.js'), 'utf8');
var list = runner.slice(runner.indexOf('const sourceFiles = ['), runner.indexOf('];', runner.indexOf('const sourceFiles = [')))
  .match(/'src\/[^']+\.js'/g).map(function(s) { return s.slice(1, -1); });
var loadErrors = [];
list.forEach(function(rel) {
  try {
    new Function('window', 'document', 'localStorage', 'alert', 'confirm', 'prompt', fs.readFileSync(path.join(ROOT, rel), 'utf8'))(
      W, W.document, { getItem: function() { return null; }, setItem: function() {} },
      function() {}, function() { throw new Error('confirm() must not be used'); }, function() { return null; });
  } catch (e) { loadErrors.push(rel + ': ' + e.message); }
});
var ED = W.MA.elementDelete;
var M = W.MA.modules;

describe('TICKET-owner-20261124-0422-3 sources load', function() {
  test('element-delete と 6 図種のモジュールが読める', function() {
    expect(!!ED).toBe(true);
    ['plantumlSequence', 'plantumlUsecase', 'plantumlComponent', 'plantumlClass', 'plantumlState'].forEach(function(k) {
      expect(!!M[k]).toBe(true);
    });
  });
});

function del(text, plan) { return ED.apply(text, plan).split('\n'); }

describe('MA.elementDelete: 範囲をまとめて本数を数え、窓の文を作る', function() {
  test('重なる範囲は 1 つにまとめ、同じ行は 2 回数えない', function() {
    var p = ED.plan({ decl: [{ start: 2, end: 4 }], relations: [{ start: 3, end: 3 }, { start: 6, end: 6 }, { start: 6, end: 6 }],
      notes: [{ start: 7, end: 9 }] });
    expect(p.ranges).toEqual([{ start: 7, end: 9 }, { start: 6, end: 6 }, { start: 2, end: 4 }]);
    expect(p.relations).toBe(2);
    expect(p.notes).toBe(1);
    expect(ED.attached(p)).toBe(true);
    expect(ED.attached(ED.plan({ decl: [{ start: 2, end: 2 }] }))).toBe(false);
  });
  test('文は「関係 N 本とnote M つも消えます」の形 (クラス図と同じ)、線が無ければ無いと言う', function() {
    var p = ED.plan({ decl: [{ start: 1 }], relations: [{ start: 2 }], notes: [{ start: 3 }] });
    expect(ED.message('部品', 'Bus', p, '関係')).toBe('部品 Bus を削除します。関係 1 本とnote 1 つも消えます。');
    expect(ED.message('状態', 'Idle', ED.plan({ decl: [{ start: 1 }] }), '遷移')).toBe('状態 Idle を削除します。繋がる遷移と note はありません。');
  });
  test('notesOf: 1 行・複数行・note over A, B の対象を拾い、別の要素の note・本文の同じ語は拾わない', function() {
    var t = ['note right of Bus : Bus note', 'note left of BusCtl : x', 'note over Ctl, Bus', '  Bus text', 'end note',
      'note top of "Bus" : q', 'note over X : Bus'].join('\n');
    expect(ED.notesOf(t, 'Bus')).toEqual([{ start: 1, end: 1 }, { start: 3, end: 5 }, { start: 6, end: 6 }]);
  });
  test('CRLF の行末を保つ', function() {
    var t = 'a\r\nb\r\nc\r\n';
    expect(ED.apply(t, ED.plan({ decl: [{ start: 2 }] }))).toBe('a\r\nc\r\n');
  });
});

var COMP = ['@startuml', "' Bus is the shared line", 'component Bus', 'component BusCtl', 'Bus --> BusCtl : Bus data',
  'note right of Bus : Bus note', 'component Solo', '@enduml'].join('\n');
var UC = ['@startuml', 'actor User', 'actor UserAdmin', 'usecase "Login" as UC1', 'User --> UC1 : User login',
  'UserAdmin --> UC1', 'note left of User', '  first user', 'end note', '@enduml'].join('\n');
var ST = ['@startuml', 'state Idle', 'state Run', '[*] --> Idle', 'Idle --> Run : go', 'Run --> Idle',
  'note right of Idle : Idle note', '@enduml'].join('\n');

describe('部品・アクター・状態の削除は付いた行も一緒に消し、要素が本文に残らない', function() {
  test('component: 宣言・関係・note を消し、コメントと別の部品は残す', function() {
    var p = M.plantumlComponent.elementDeletePlan(COMP, 'Bus');
    expect([p.relations, p.notes]).toEqual([1, 1]);
    expect(del(COMP, p)).toEqual(['@startuml', "' Bus is the shared line", 'component BusCtl', 'component Solo', '@enduml']);
    var lone = M.plantumlComponent.elementDeletePlan(COMP, 'Solo');
    expect(ED.attached(lone)).toBe(false);
    expect(del(COMP, lone).length).toBe(COMP.split('\n').length - 1);
  });
  test('component: 関係の行にだけ出る部品は宣言が無いので関係だけを消す', function() {
    var t = ['@startuml', '[A] --> [B]', '[A] --> [C]', '@enduml'].join('\n');
    var p = M.plantumlComponent.elementDeletePlan(t, 'B');
    expect(p.relations).toBe(1);
    expect(del(t, p)).toEqual(['@startuml', '[A] --> [C]', '@enduml']);
  });
  test('usecase: アクターの宣言・関係・複数行の note を消し、UserAdmin は残す', function() {
    var p = M.plantumlUsecase.elementDeletePlan(UC, 'User');
    expect([p.relations, p.notes]).toEqual([1, 1]);
    expect(del(UC, p)).toEqual(['@startuml', 'actor UserAdmin', 'usecase "Login" as UC1', 'UserAdmin --> UC1', '@enduml']);
  });
  test('state: 窓が言う本数と消える行が合う', function() {
    var p = M.plantumlState.stateDeletePlan(ST, 'Idle');
    expect([p.relations, p.notes]).toEqual([3, 1]);
    expect(ED.message('状態', 'Idle', p, '遷移')).toBe('状態 Idle を削除します。遷移 3 本とnote 1 つも消えます。');
    expect(del(ST, p)).toEqual(['@startuml', 'state Run', '@enduml']);
    expect(M.plantumlState.deleteStateWithRefs(ST, 'Idle')).toBe(ED.apply(ST, p));
  });
  test('sequence: 参加者の宣言・メッセージ・note を消す', function() {
    var t = ['@startuml', 'participant Ctl', 'participant CtlSub', 'Ctl -> CtlSub : Ctl req', 'CtlSub --> Ctl : done',
      'note over Ctl : Ctl note', '@enduml'].join('\n');
    var p = M.plantumlSequence.participantDeletePlan(t, 'Ctl');
    expect([p.relations, p.notes]).toEqual([2, 1]);
    expect(del(t, p)).toEqual(['@startuml', 'participant CtlSub', '@enduml']);
  });
});

describe('ブラウザの confirm を使わず、共通の窓に通す (図種ごとの別の確かめを持たない)', function() {
  var src = function(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); };
  function handler(code, marker) {
    var i = code.indexOf(marker);
    if (i < 0) throw new Error('marker not found: ' + marker);
    return code.slice(i, code.indexOf('});', i));
  }
  [['src/modules/component.js', "P.bindEvent('co-delete', 'click', function() {\n      // 宣言"],
   ['src/modules/usecase.js', "P.bindEvent('uc-delete'"],
   ['src/modules/state.js', "P.bindEvent('st-delete'"],
   ['src/modules/class.js', 'function _askDeleteClass(']].forEach(function(c) {
    test(c[0] + ' の要素の削除は MA.elementDelete.ask を通り confirm( を持たない', function() {
      var h = handler(src(c[0]), c[1]);
      expect(h.indexOf('confirm(')).toBe(-1);
      expect(h.indexOf('window.MA.elementDelete.ask(')).toBeGreaterThan(0);
    });
  });
  test('要素の削除ボタンは data-el-delete を持つ (Delete キーが押す印)', function() {
    expect(src('src/modules/component.js')).toContain('id="co-delete" data-el-delete="1"');
    expect(src('src/modules/usecase.js')).toContain('id="uc-delete" data-el-delete="1"');
    expect(src('src/modules/class.js')).toContain('id="cl-delete" data-el-delete="1"');
    expect(src('src/modules/state.js')).toContain("stDelBtn.setAttribute('data-el-delete', '1'); stDelBtn.setAttribute('data-el-id', st.id);");
    expect(src('src/modules/sequence.js')).toContain(`(partId ? ' data-el-delete="1" data-el-id="' + escHtml(partId) + '"' : '')`);
  });
  test('Delete キーはパネルが押した要素のものであるときだけ押す (メンバーの選択でクラスを消さない)', function() {
    expect(src('src/app.js')).toContain("btn.getAttribute('data-el-id') !== String(one.id)");
  });
  test('app.js の Delete は ↑↓ の候補より先に要素の削除ボタンを押す', function() {
    var app = src('src/app.js');
    expect(app).toContain("document.querySelector('#props-content [data-el-delete]')");
    var i = app.indexOf("if ((key === 'Delete' || key === 'Backspace') && _kbdDeleteViaPanel()) { e.preventDefault(); return; }");
    var j = app.indexOf('var cur = _kbdSelectedItem();\n    if (!cur) return;');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
  });
});
