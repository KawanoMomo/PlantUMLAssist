'use strict';
// BLK-junior-20260908-0823-wish: 2 枚の状態遷移図の対応表。
// 状態名・イベント名がばらばらでも、名前の形だけで対応を取り、
// 片方にしか無い状態・遷移を「足された 1 要素」の候補として挙げられること。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/state-transition.js')]; } catch (e) {}
require('../src/core/state-transition.js');
try { delete require.cache[require.resolve('../src/modules/state.js')]; } catch (e) {}
require('../src/modules/state.js');
try { delete require.cache[require.resolve('../src/core/state-map.js')]; } catch (e) {}
require('../src/core/state-map.js');

const sm = global.window.MA.stateMap;
const stateMod = global.window.MA.modules.plantumlState;

function parse(lines) { return stateMod.parse(lines.join('\n')); }

// 先輩 (primary) の図。Disabled が 1 つ多い。
const SENIOR = parse([
  '@startuml',
  '[*] --> Idle',
  'state Idle',
  'state Ready',
  'state Running',
  'state Disabled',
  'Idle --> Ready : init',
  'Ready --> Running : start',
  'Running --> Idle : stop',
  'Idle --> Disabled : disable',
  '@enduml',
]);

// 自分 (junior) の図。名前の付け方が違うが、同じ骨格。
const MINE = parse([
  '@startuml',
  '[*] --> Idle',
  'state Idle',
  'state Ready_State',
  'state Running_State',
  'Idle --> Ready_State : init',
  'Ready_State --> Running_State : start',
  'Running_State --> Idle : stop',
  '@enduml',
]);

function matches(rows, kind) {
  return rows.filter(function(r) { return r.match === kind; });
}

describe('state-map — 名前の突き合わせ (BLK-junior-20260908-0823-wish)', () => {
  test('normalize は大小・記号・空白の違いを消す', () => {
    expect(sm.normalize('Wait_Ready')).toBe('waitready');
    expect(sm.normalize('  WAIT READY ')).toBe('waitready');
    expect(sm.normalize(null)).toBe('');
  });

  test('words は CamelCase と snake_case を同じ語列にする', () => {
    expect(sm.words('RunState')).toEqual(['run', 'state']);
    expect(sm.words('run_state')).toEqual(['run', 'state']);
  });

  test('editDistance は文字の違いを数える', () => {
    expect(sm.editDistance('Ready', 'Redy')).toBe(1);
    expect(sm.editDistance('Idle', 'Idle')).toBe(0);
  });

  test('score: 完全一致は 1、無関係は 0', () => {
    expect(sm.score('Idle', 'idle')).toBe(1);
    expect(sm.score('Idle', 'Sleeping')).toBe(0);
  });

  test('score: 語を共有する名前は部分一致に届く', () => {
    expect(sm.score('Ready', 'Ready_State')).toBeGreaterThan(0.39);
  });

  test('score: 短い名前の 2 文字違いは別物にする (on と off を結ばない)', () => {
    expect(sm.score('on', 'off')).toBe(0);
  });
});

describe('state-map — 状態の対応表', () => {
  test('名前が違っても語を共有すれば対応が付く', () => {
    const rows = sm.mapStates(SENIOR, MINE);
    const ready = rows.filter(function(r) { return r.ref === 'Ready'; })[0];
    expect(ready).toBeDefined();
    expect(ready.mine).toBe('Ready_State');
    expect(ready.match).toBe('partial');
  });

  test('先輩だけにある Disabled が「参照図だけ」として残る', () => {
    const only = matches(sm.mapStates(SENIOR, MINE), 'ref-only');
    expect(only.length).toBe(1);
    expect(only[0].ref).toBe('Disabled');
    expect(only[0].mine).toBe('');
    expect(only[0].refLine).toBeGreaterThan(0);
  });

  test('対応が付いた行は自分の図の行番号を持つ (押して飛べる)', () => {
    const rows = sm.mapStates(SENIOR, MINE);
    const idle = rows.filter(function(r) { return r.ref === 'Idle'; })[0];
    expect(idle.match).toBe('exact');
    expect(idle.mineLine).toBeGreaterThan(0);
  });

  test('1 つの状態が 2 つに対応しない', () => {
    const ref = parse(['@startuml', 'state Ready', '@enduml']);
    const mine = parse(['@startuml', 'state Ready_A', 'state Ready_B', '@enduml']);
    const rows = sm.mapStates(ref, mine);
    expect(rows.filter(function(r) { return r.refId && r.mineId; }).length).toBe(1);
    expect(matches(rows, 'mine-only').length).toBe(1);
  });

  test('[*] は状態として並べない (開始・終了は対応を取る対象ではない)', () => {
    const rows = sm.mapStates(SENIOR, MINE);
    expect(rows.filter(function(r) { return r.ref === '[*]' || r.mine === '[*]'; }).length).toBe(0);
  });
});

describe('state-map — 遷移の対応表', () => {
  test('状態の対応を踏まえて端点を読み替える', () => {
    const states = sm.mapStates(SENIOR, MINE);
    const rows = sm.mapTransitions(SENIOR, MINE, states);
    const init = rows.filter(function(r) { return r.ref.indexOf('init') >= 0; })[0];
    expect(init).toBeDefined();
    expect(init.match).not.toBe('ref-only');
    expect(init.mine).toContain('init');
  });

  test('先輩だけにある disable が「参照図だけ」になる', () => {
    const states = sm.mapStates(SENIOR, MINE);
    const only = matches(sm.mapTransitions(SENIOR, MINE, states), 'ref-only');
    expect(only.length).toBe(1);
    expect(only[0].ref).toContain('disable');
  });

  test('transitionName は状態を表示名に直して読める形にする', () => {
    const name = sm.transitionName(MINE.transitions[1], MINE);
    expect(name).toContain('Ready_State');
    expect(name).toContain('->');
  });
});

describe('state-map — 見出しと行き詰まりの検出', () => {
  test('build は状態と遷移をまとめて返す', () => {
    const map = sm.build(SENIOR, MINE);
    expect(map.states.length).toBeGreaterThan(0);
    expect(map.transitions.length).toBeGreaterThan(0);
  });

  test('summary: 片方だけの件数を先に言う', () => {
    const text = sm.summary(sm.build(SENIOR, MINE));
    expect(text).toContain('参照図だけ 2');
    expect(text).toContain('自分だけ 0');
  });

  test('summary: 片方だけが 0 件なら言い切る', () => {
    expect(sm.summary(sm.build(SENIOR, SENIOR))).toContain('片方だけ 0 件');
  });

  test('summary: 読めない図では状態遷移が読めないと言う', () => {
    expect(sm.summary({ states: [], transitions: [] })).toBe('状態遷移が読めません');
  });

  test('abstractionWarning: 対応が半分未満なら抽象度の違いを言う', () => {
    const coarse = parse(['@startuml', 'state 動作中', 'state 停止中', '@enduml']);
    const fine = parse([
      '@startuml',
      'state Init', 'state Configuring', 'state Running', 'state Stopping',
      '@enduml',
    ]);
    expect(sm.abstractionWarning(sm.build(coarse, fine))).toContain('抽象度が違う');
  });

  test('abstractionWarning: 対応が付いていれば何も言わない', () => {
    expect(sm.abstractionWarning(sm.build(SENIOR, MINE))).toBe('');
  });

  test('matchLabel は日本語の見出しを返す', () => {
    expect(sm.matchLabel('ref-only')).toBe('参照図だけ');
    expect(sm.matchLabel('exact')).toBe('一致');
  });

  test('空の図でも落ちない', () => {
    const empty = parse(['@startuml', '@enduml']);
    const map = sm.build(empty, empty);
    expect(map.states.length).toBe(0);
    expect(map.transitions.length).toBe(0);
  });
});
