'use strict';
// BLK-builder-20260924-1252-2 (design 4c): 遷移を選んだ右パネルの「状態を追加 / Add state」。
// 追加タブへ回って挟む遷移を選び直さなくても、いま選んでいる遷移を相手に
// 「この遷移の途中 / 図の末尾 / From の中」へ 1 手で足せる。
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

// design 4c のサンプル。Idle / Running は宣言が無く遷移にだけ出る。
var SAMPLE = [
  '@startuml',
  'title Sample State',
  '[*] --> Idle',
  'Idle --> Running : start',
  'Running --> Idle : stop',
  'Running --> [*] : done',
  '@enduml',
].join('\n');
var SAMPLE_PARSED = {
  states: [],
  transitions: [
    { id: '__t_0', from: '[*]', to: 'Idle', line: 3, label: '' },
    { id: '__t_1', from: 'Idle', to: 'Running', trigger: 'start', label: 'start', line: 4 },
    { id: '__t_2', from: 'Running', to: 'Idle', trigger: 'stop', label: 'stop', line: 5 },
    { id: '__t_3', from: 'Running', to: '[*]', trigger: 'done', label: 'done', line: 6 },
  ],
};
var T_START = SAMPLE_PARSED.transitions[1];

var DECL = [
  '@startuml',
  'state Idle',
  'state Busy {',
  '  state Sub',
  '}',
  'Idle --> Busy : go',
  'Busy --> Idle : back',
  '@enduml',
].join('\n');
var DECL_PARSED = {
  states: [
    { id: 'Idle', label: 'Idle', line: 2, endLine: 2 },
    { id: 'Busy', label: 'Busy', line: 3, endLine: 5 },
    { id: 'Busy.Sub', label: 'Sub', line: 4, endLine: 4, parentId: 'Busy' },
  ],
  transitions: [
    { id: '__t_0', from: 'Idle', to: 'Busy', trigger: 'go', label: 'go', line: 6 },
    { id: '__t_1', from: 'Busy', to: 'Idle', trigger: 'back', label: 'back', line: 7 },
  ],
};

function values(ps) { return ps.map(function(p) { return p.value; }); }

describe('transitionPositions — 遷移を選んだパネルの「追加する位置」', function() {
  test('既定は「この遷移の途中」、続けて 図の末尾 / From の中', function() {
    var ps = SI.transitionPositions(SAMPLE_PARSED, T_START, 'state');
    expect(values(ps)).toEqual(['transition', 'end', 'inside']);
    expect(ps[0].label).toBe('この遷移の途中');
    expect(ps[2].label).toBe('Idle の中');
  });
  test('複合状態は遷移に挟まない (中身の無い箱を挟まない。追加タブと同じ)', function() {
    expect(values(SI.transitionPositions(SAMPLE_PARSED, T_START, 'composite'))).toEqual(['end', 'inside']);
  });
  test('開始 [*] からの遷移には「の中」が無い', function() {
    expect(values(SI.transitionPositions(SAMPLE_PARSED, SAMPLE_PARSED.transitions[0], 'state'))).toEqual(['transition', 'end']);
  });
  test('choice からの遷移には「の中」が無い (疑似状態は中を持てない)', function() {
    var parsed = { states: [{ id: 'C', label: 'C', line: 2, endLine: 2, stereotype: 'choice' }], transitions: [] };
    expect(SI.fromHost(parsed, { id: 'x', from: 'C', to: 'D', line: 3 })).toBe(null);
  });
});

describe('addFromTransition — いま選んでいる遷移を相手に足す', function() {
  test('この遷移の途中: Idle --> X : start と X --> Running に割り、きっかけは前半に残る', function() {
    var out = SI.addFromTransition(SAMPLE, SAMPLE_PARSED, T_START, { kind: 'state', id: 'Checking', where: 'transition' });
    expect(out.split('\n').slice(3, 6)).toEqual(['state Checking', 'Idle --> Checking : start', 'Checking --> Running']);
  });
  test('選択 choice を途中に挟むと <<choice>> の宣言になる', function() {
    var out = SI.addFromTransition(SAMPLE, SAMPLE_PARSED, T_START, { kind: 'choice', id: 'Ok', where: 'transition' });
    expect(out).toContain('state Ok <<choice>>\nIdle --> Ok : start\nOk --> Running');
  });
  test('図の末尾: @enduml の直前に足し、遷移は触らない', function() {
    var out = SI.addFromTransition(SAMPLE, SAMPLE_PARSED, T_START, { kind: 'composite', id: 'Box', where: 'end' });
    expect(out).toBe(SAMPLE.replace('@enduml', 'state Box {\n}\n@enduml'));
  });
  test('宣言の無い From の中: 末尾に state Idle { … } を足す (Idle の遷移は触らない)', function() {
    var out = SI.addFromTransition(SAMPLE, SAMPLE_PARSED, T_START, { kind: 'state', id: 'Warmup', where: 'inside' });
    expect(out).toBe(SAMPLE.replace('@enduml', 'state Idle {\n  state Warmup\n}\n@enduml'));
  });
  test('宣言のある単純状態の中: その宣言を { } に開いて入れる', function() {
    var out = SI.addFromTransition(DECL, DECL_PARSED, DECL_PARSED.transitions[0], { kind: 'state', id: 'Warmup', where: 'inside' });
    expect(out.split('\n').slice(1, 4)).toEqual(['state Idle {', '  state Warmup', '}']);
  });
  test('中身を持つ複合状態の中: 閉じ } の直前 (既にある子の後ろ) に入れる', function() {
    var out = SI.addFromTransition(DECL, DECL_PARSED, DECL_PARSED.transitions[1], { kind: 'state', id: 'Sub2', where: 'inside' });
    expect(out.split('\n').slice(2, 6)).toEqual(['state Busy {', '  state Sub', '  state Sub2', '}']);
  });
  test('既にある状態を挟むときは宣言を増やさない', function() {
    var out = SI.addFromTransition(DECL, DECL_PARSED, DECL_PARSED.transitions[1], { kind: 'state', id: 'Idle', where: 'transition' });
    expect(out.split('\n').filter(function(l) { return l === 'state Idle'; }).length).toBe(1);
    expect(out).toContain('Busy --> Idle : back\nIdle --> Idle');
  });
  test('名前が空・複合状態を途中に・相手の無い「の中」は何もしない', function() {
    expect(SI.addFromTransition(SAMPLE, SAMPLE_PARSED, T_START, { kind: 'state', id: '', where: 'end' })).toBe(SAMPLE);
    expect(SI.addFromTransition(SAMPLE, SAMPLE_PARSED, T_START, { kind: 'composite', id: 'B', where: 'transition' })).toBe(SAMPLE);
    expect(SI.addFromTransition(SAMPLE, SAMPLE_PARSED, SAMPLE_PARSED.transitions[0], { kind: 'state', id: 'B', where: 'inside' })).toBe(SAMPLE);
  });
});
