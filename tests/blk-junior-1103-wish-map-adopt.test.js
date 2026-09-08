'use strict';
// BLK-junior-20260908-1103-wish: 対応表の「参照図だけ」の行を、自分の図に
// そのまま足せること。これまでは対応表で見つけたあと、一括入力欄に
// 同じ状態・遷移を自分で打ち直していた。
//
// 見たいこと:
//   - 参照図だけの状態は、そのまま押せば足せる (聞き返さない)
//   - 参照図だけの遷移は、端点の対応が付いていれば自分の状態 id に読み替えて足す
//   - 端点の対応が付かないときだけ、どの状態にするかを聞く (needs に出る)
//   - 足したあと対応表を作り直すと、その行の「参照図だけ」が消える
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

[
  '../src/core/html-utils.js',
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js',
  '../src/core/dsl-updater.js',
  '../src/core/overlay-builder.js',
  '../src/core/state-transition.js',
  '../src/modules/state.js',
  '../src/core/state-map.js',
].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});

const sm = global.window.MA.stateMap;
const stateMod = global.window.MA.modules.plantumlState;

// 先輩の図。Configured と Idle --> Configured が自分の図に無い。
const SENIOR_DSL = [
  '@startuml',
  '[*] --> Idle',
  'state Idle',
  'state Ready',
  'state Configured',
  'Idle --> Ready : init',
  'Idle --> Configured : configure',
  '@enduml',
].join('\n');

// 自分の図。名前の付け方が違う (Ready ではなく WaitReady)。
const MINE_DSL = [
  '@startuml',
  '[*] --> Idle',
  'state Idle',
  'state WaitReady',
  'Idle --> WaitReady : init',
  '@enduml',
].join('\n');

function build(refDsl, mineDsl) {
  var ref = stateMod.parse(refDsl);
  var mine = stateMod.parse(mineDsl);
  return { map: sm.build(ref, mine), mine: mine };
}

function rowOf(map, type, name) {
  var rows = (type === 'state' ? map.states : map.transitions);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].match === 'ref-only' && rows[i].ref.indexOf(name) >= 0) return rows[i];
  }
  return null;
}

describe('対応表の橙の行を自分の図に足す (BLK-junior-20260908-1103-wish)', function() {

  test('参照図だけの状態は聞き返さずに足せる', function() {
    var b = build(SENIOR_DSL, MINE_DSL);
    var row = rowOf(b.map, 'state', 'Configured');
    expect(row).not.toBeNull();
    var plan = sm.adoptPlan(row, b.map, b.mine);
    expect(plan.adoptable).toBe(true);
    expect(plan.ready).toBe(true);
    expect(plan.needs.length).toBe(0);
    expect(plan.state.id).toBe('Configured');
  });

  test('足した状態は自分の DSL の末尾 (@enduml の前) に入る', function() {
    var b = build(SENIOR_DSL, MINE_DSL);
    var out = sm.applyAdopt(MINE_DSL, rowOf(b.map, 'state', 'Configured'), b.map, b.mine, null);
    expect(out).not.toBeNull();
    var lines = out.text.split('\n');
    expect(lines[out.line - 1]).toBe('state Configured');
    expect(lines[lines.length - 1]).toBe('@enduml');
    expect(stateMod.parse(out.text).states.length).toBe(3);
  });

  test('対応表だけの行しか足せない (一致した行には計画が出ない)', function() {
    var b = build(SENIOR_DSL, MINE_DSL);
    var paired = b.map.states.filter(function(r) { return r.match !== 'ref-only'; })[0];
    expect(sm.adoptPlan(paired, b.map, b.mine).adoptable).toBe(false);
  });

  test('参照図だけの遷移は、端点を自分の状態 id に読み替えて足す', function() {
    // 先に Configured を足しておく (先輩の Ready は自分の WaitReady に対応する)。
    var withState = sm.applyAdopt(MINE_DSL, rowOf(build(SENIOR_DSL, MINE_DSL).map, 'state', 'Configured'),
      build(SENIOR_DSL, MINE_DSL).map, build(SENIOR_DSL, MINE_DSL).mine, null).text;
    var b = build(SENIOR_DSL, withState);
    var row = rowOf(b.map, 'transition', 'configure');
    expect(row).not.toBeNull();
    var plan = sm.adoptPlan(row, b.map, b.mine);
    expect(plan.ready).toBe(true);
    var out = sm.applyAdopt(withState, row, b.map, b.mine, null);
    expect(out.text.split('\n')[out.line - 1]).toBe('Idle --> Configured : configure');
  });

  test('端点の名前が違っても、対応が付いていれば自分の名前で足す', function() {
    // 先輩の Ready は自分では WaitReady。先輩の Ready --> Configured を足すと
    // 自分の図では WaitReady --> Configured になる。
    var senior = [
      '@startuml',
      'state Idle',
      'state Ready',
      'state Configured',
      'Ready --> Configured : configure',
      '@enduml',
    ].join('\n');
    var mine = [
      '@startuml',
      'state Idle',
      'state WaitReady',
      'state Configured',
      '@enduml',
    ].join('\n');
    var b = build(senior, mine);
    var row = rowOf(b.map, 'transition', 'configure');
    var plan = sm.adoptPlan(row, b.map, b.mine);
    expect(plan.ready).toBe(true);
    var out = sm.applyAdopt(mine, row, b.map, b.mine, null);
    expect(out.text.split('\n')[out.line - 1]).toBe('WaitReady --> Configured : configure');
  });

  test('端点の対応が付かない遷移は、どの状態にするかを聞き返す', function() {
    var senior = [
      '@startuml',
      'state Idle',
      'state Configured',
      'Idle --> Configured : configure',
      '@enduml',
    ].join('\n');
    var mine = [
      '@startuml',
      'state Idle',
      '@enduml',
    ].join('\n');
    var b = build(senior, mine);
    var row = rowOf(b.map, 'transition', 'configure');
    var plan = sm.adoptPlan(row, b.map, b.mine);
    expect(plan.ready).toBe(false);
    expect(plan.needs.length).toBe(1);
    expect(plan.needs[0].side).toBe('to');
    // 選択肢には自分の状態と [*] が並ぶ。
    var values = plan.needs[0].options.map(function(o) { return o.value; });
    expect(values).toContain('Idle');
    expect(values).toContain('[*]');
  });

  test('聞き返した端点に自分の状態を選ぶと、その状態への遷移になる', function() {
    var senior = [
      '@startuml',
      'state Idle',
      'state Configured',
      'Idle --> Configured : configure',
      '@enduml',
    ].join('\n');
    var mine = [
      '@startuml',
      'state Idle',
      'state Ready',
      '@enduml',
    ].join('\n');
    var b = build(senior, mine);
    var row = rowOf(b.map, 'transition', 'configure');
    var out = sm.applyAdopt(mine, row, b.map, b.mine, { to: 'Ready' });
    expect(out.text.split('\n')[out.line - 1]).toBe('Idle --> Ready : configure');
    // 状態は増やさない (自分の状態を選んだので新設しない)。
    expect(stateMod.parse(out.text).states.length).toBe(2);
  });

  test('新しく作るを選ぶと、状態行と遷移行の両方が入る', function() {
    var senior = [
      '@startuml',
      'state Idle',
      'state Configured',
      'Idle --> Configured : configure',
      '@enduml',
    ].join('\n');
    var mine = [
      '@startuml',
      'state Idle',
      '@enduml',
    ].join('\n');
    var b = build(senior, mine);
    var row = rowOf(b.map, 'transition', 'configure');
    var out = sm.applyAdopt(mine, row, b.map, b.mine, { to: sm.NEW_STATE });
    expect(out.text).toContain('state Configured');
    expect(out.text.split('\n')[out.line - 1]).toBe('Idle --> Configured : configure');
    expect(out.added.length).toBe(2);
  });

  test('日本語の状態名は別名を作って足す (パーサが読める形にする)', function() {
    var senior = [
      '@startuml',
      'state Idle',
      'state "設定済み" as Configured',
      '@enduml',
    ].join('\n');
    var mine = ['@startuml', 'state Idle', '@enduml'].join('\n');
    var b = build(senior, mine);
    var row = rowOf(b.map, 'state', '設定済み');
    var out = sm.applyAdopt(mine, row, b.map, b.mine, null);
    var added = stateMod.parse(out.text).states.filter(function(s) { return s.label === '設定済み'; });
    expect(added.length).toBe(1);
    expect(window.MA.idNormalizer.ASCII_ID_RE.test(added[0].id)).toBe(true);
  });

  test('足したあと対応表を作り直すと、その行の「参照図だけ」が消える', function() {
    var b = build(SENIOR_DSL, MINE_DSL);
    var out = sm.applyAdopt(MINE_DSL, rowOf(b.map, 'state', 'Configured'), b.map, b.mine, null);
    var again = build(SENIOR_DSL, out.text);
    expect(rowOf(again.map, 'state', 'Configured')).toBeNull();
  });

  test('遷移を足すと、遷移の「参照図だけ」も消える', function() {
    var b = build(SENIOR_DSL, MINE_DSL);
    var step1 = sm.applyAdopt(MINE_DSL, rowOf(b.map, 'state', 'Configured'), b.map, b.mine, null).text;
    var b2 = build(SENIOR_DSL, step1);
    var step2 = sm.applyAdopt(step1, rowOf(b2.map, 'transition', 'configure'), b2.map, b2.mine, null).text;
    var b3 = build(SENIOR_DSL, step2);
    expect(rowOf(b3.map, 'transition', 'configure')).toBeNull();
    expect(sm.summary(b3.map)).toContain('片方だけ 0 件');
  });
});
