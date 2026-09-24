'use strict';
// BLK-builder-20260924-2341-1 (design 4c の残り): 遷移を選んだ右パネルの「状態を追加」に
// H 履歴 / 開始 [*] / 終了 [*] と「その他… ▾」(並行状態 fork・join / 入口・出口ポイント) を足す。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['../src/core/state-child.js', '../src/core/state-insert.js'].forEach(function(dep) {
  try { delete require.cache[require.resolve(dep)]; } catch (e) {}
  require(dep);
});
var SI = global.window.MA.stateInsert;

var SAMPLE = [
  '@startuml',
  '[*] --> Idle',
  'Idle --> Running : start',
  'Running --> Idle : stop',
  'Running --> [*] : done',
  '@enduml',
].join('\n');
var SAMPLE_PARSED = {
  states: [],
  transitions: [
    { id: '__t_0', from: '[*]', to: 'Idle', line: 2, label: '' },
    { id: '__t_1', from: 'Idle', to: 'Running', trigger: 'start', label: 'start', line: 3 },
    { id: '__t_2', from: 'Running', to: 'Idle', trigger: 'stop', label: 'stop', line: 4 },
    { id: '__t_3', from: 'Running', to: '[*]', trigger: 'done', label: 'done', line: 5 },
  ],
};
var T_START = SAMPLE_PARSED.transitions[1];

var DECL_PARSED = {
  states: [
    { id: 'Idle', label: 'Idle', line: 2, endLine: 2 },
    { id: 'Busy', label: 'Busy', line: 3, endLine: 6 },
    { id: 'Busy.Sub', label: 'Sub', line: 4, endLine: 4, parentId: 'Busy' },
    { id: 'Busy.Sub2', label: 'Sub2', line: 5, endLine: 5, parentId: 'Busy' },
  ],
  transitions: [
    { id: '__t_0', from: 'Idle', to: 'Busy', trigger: 'go', label: 'go', line: 7 },
    { id: '__t_1', from: 'Busy', to: 'Idle', trigger: 'back', label: 'back', line: 8 },
    { id: '__t_2', from: 'Sub', to: 'Sub2', label: '', line: 9, scope: 'Busy' },
  ],
};

function values(ps) { return ps.map(function(p) { return p.value; }); }

describe('開始 / 終了 / 履歴 — 相手は選んだ遷移で決まる', function() {
  test('開始は From を、その状態と同じ所の開始にする', function() {
    var r = SI.pseudoFromTransition(SAMPLE_PARSED, T_START, 'start');
    expect(r.ok).toBe(true);
    expect(r.line).toBe('[*] --> Idle');
    expect(r.scope).toBe('');
  });
  test('From が [*] なら開始は To に付く', function() {
    expect(SI.pseudoFromTransition(SAMPLE_PARSED, SAMPLE_PARSED.transitions[0], 'start').line).toBe('[*] --> Idle');
  });
  test('終了は To から [*] へ。To が [*] なら From から', function() {
    expect(SI.pseudoFromTransition(SAMPLE_PARSED, T_START, 'end').line).toBe('Running --> [*]');
    expect(SI.pseudoFromTransition(SAMPLE_PARSED, SAMPLE_PARSED.transitions[3], 'end').line).toBe('Running --> [*]');
  });
  test('入れ子の中の遷移の開始・終了は、その親の中に書く (scope が親)', function() {
    var r = SI.pseudoFromTransition(DECL_PARSED, DECL_PARSED.transitions[2], 'end');
    expect(r.scope).toBe('Busy');
    expect(r.line).toBe('Sub2 --> [*]');
  });
  test('履歴は To が複合状態ならその [H] へ、To が子ならその親の [H] へ From から戻る', function() {
    expect(SI.pseudoFromTransition(DECL_PARSED, DECL_PARSED.transitions[0], 'history').line).toBe('Idle --> Busy[H]');
    var r = SI.pseudoFromTransition(DECL_PARSED, DECL_PARSED.transitions[2], 'history');
    expect(r.ok).toBe(true);
    expect(r.scope).toBe('Busy');
  });
  test('複合状態に向かわない遷移では履歴は足せず、理由を返す', function() {
    var r = SI.pseudoFromTransition(SAMPLE_PARSED, T_START, 'history');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('複合状態');
  });
  test('開始・終了・履歴には位置を選ばせない / addFromTransition は何もしない', function() {
    expect(SI.transitionPositions(SAMPLE_PARSED, T_START, 'start')).toEqual([]);
    expect(SI.addFromTransition(SAMPLE, SAMPLE_PARSED, T_START, { kind: 'end', id: 'X', where: 'end' })).toBe(SAMPLE);
  });
});

describe('その他… ▾ — 並行状態 fork・join / 入口・出口ポイント', function() {
  test('fork / join は choice と同じ位置で選べ、遷移の途中に <<fork>> で挟まる', function() {
    expect(values(SI.transitionPositions(SAMPLE_PARSED, T_START, 'fork'))).toEqual(['transition', 'end', 'inside']);
    var out = SI.addFromTransition(SAMPLE, SAMPLE_PARSED, T_START, { kind: 'fork', id: 'Fork1', where: 'transition' }).split('\n');
    expect(out).toContain('state Fork1 <<fork>>');
    expect(out).toContain('Idle --> Fork1 : start');
    expect(out).toContain('Fork1 --> Running');
  });
  test('入口・出口ポイントは From の中だけ (複合状態の縁に付く)', function() {
    expect(values(SI.transitionPositions(DECL_PARSED, DECL_PARSED.transitions[1], 'entryPoint'))).toEqual(['inside']);
    expect(SI.addFromTransition(SAMPLE, SAMPLE_PARSED, T_START, { kind: 'entryPoint', id: 'In', where: 'end' })).toBe(SAMPLE);
    var out = SI.addFromTransition(SAMPLE, SAMPLE_PARSED, T_START, { kind: 'exitPoint', id: 'Out', where: 'inside' });
    expect(out).toContain('state Out <<exitPoint>>');
    expect(out).toContain('state Idle {');
  });
  test('From が [*] の遷移では入口・出口ポイントの位置が無い', function() {
    expect(SI.transitionPositions(SAMPLE_PARSED, SAMPLE_PARSED.transitions[0], 'entryPoint')).toEqual([]);
  });
});
