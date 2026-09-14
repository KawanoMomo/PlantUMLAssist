'use strict';
// BLK-junior-20260908-0823 (差し戻し 1 回目) — 対応を手で決める。
//
// 抽象度の違う 2 枚では、名前の形だけで組んだ対応が当たらない。
// `[*] --> Idle` と `AnomalyCheck --> Idle` のように行き先が同じというだけで
// 部分一致に落ちる組が並ぶと、残った「参照図だけ」の行が本当に先輩の足した
// 要素なのか、対応を取り損ねただけなのかを読む側で判別できない。
// ここでは 1 組ずつ「同じもの」「対応なし」と決めていくと推測が減り、
// 推測が 0 件になった時点で「参照図だけ」を言い切れることを確かめる。
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

// 起票そのままの 2 枚。先輩は電気的な出力状態、自分は Uninit/Busy/Error の抽象度。
const SENIOR = parse([
  '@startuml',
  '[*] --> Idle',
  'state Idle',
  'state Configured',
  'state Driving_High',
  'state Fault',
  'Idle --> Configured : Gpio_SetPinDirection',
  'Configured --> Driving_High : Gpio_WriteChannel(HIGH)',
  'Driving_High --> Fault : OverCurrent',
  '@enduml',
]);

const MINE = parse([
  '@startuml',
  '[*] --> Uninit',
  'state Uninit',
  'state Busy',
  'state Error',
  'Uninit --> Busy : init',
  'Busy --> Error : fail',
  '@enduml',
]);

function rowsOf(map) { return map.states.concat(map.transitions); }
function stateRow(map, refName) {
  return map.states.filter((r) => r.ref === refName)[0];
}

describe('BLK-junior-20260908-0823 対応を手で決める', () => {
  test('決める前は推測が残っていて、参照図だけの行を言い切らない', () => {
    const map = sm.build(SENIOR, MINE);
    expect(sm.guessCount(map)).toBeGreaterThan(0);
    expect(sm.settled(map)).toBe(false);
    // 推測が残る間は「先輩が足した要素」を 1 件も返さない。
    expect(sm.addedByRef(map)).toEqual([]);
    expect(sm.decisionSummary(map)).toContain('機械の推測が');
  });

  test('「同じもの」と決めた組は手で対応になり、推測から外れる', () => {
    const before = sm.build(SENIOR, MINE);
    const ov = sm.withPair(sm.EMPTY_OVERRIDES, 'state', 'Idle', 'Uninit');
    const map = sm.build(SENIOR, MINE, ov);
    const row = stateRow(map, 'Idle');
    expect(row.match).toBe('manual');
    expect(row.mine).toBe('Uninit');
    expect(row.decided).toBe(true);
    expect(sm.guessCount(map)).toBeLessThan(sm.guessCount(before));
  });

  test('「対応なし」と決めた要素は参照図だけの行として確定する', () => {
    const ov = sm.withNone(sm.EMPTY_OVERRIDES, 'state', 'ref', 'Driving_High');
    const map = sm.build(SENIOR, MINE, ov);
    const row = stateRow(map, 'Driving_High');
    expect(row.match).toBe('ref-only');
    expect(row.decided).toBe(true);
    expect(sm.isGuess(row)).toBe(false);
  });

  test('1 つの要素は 1 か所にしか居ない (組み直すと前の決めは外れる)', () => {
    let ov = sm.withPair(sm.EMPTY_OVERRIDES, 'state', 'Idle', 'Uninit');
    ov = sm.withPair(ov, 'state', 'Idle', 'Busy');
    expect(ov.pairs.length).toBe(1);
    expect(ov.pairs[0].mine).toBe('Busy');
    // 「対応なし」に決め直しても組は消える
    ov = sm.withNone(ov, 'state', 'ref', 'Idle');
    expect(ov.pairs.length).toBe(0);
    expect(sm.decisionOf(ov, 'state', 'ref', 'Idle')).toBe('none');
  });

  test('決めを戻すと機械の推測に返る', () => {
    const ov = sm.withPair(sm.EMPTY_OVERRIDES, 'state', 'Idle', 'Uninit');
    const back = sm.without(ov, 'state', 'ref', 'Idle');
    expect(back.pairs.length).toBe(0);
    expect(sm.decisionOf(back, 'state', 'ref', 'Idle')).toBe(null);
    expect(stateRow(sm.build(SENIOR, MINE, back), 'Idle').match).not.toBe('manual');
  });

  test('全部決め切ると言い切り、参照図だけの件数を出す', () => {
    let ov = sm.EMPTY_OVERRIDES;
    // 状態も遷移も、残った行を 1 つずつ決めていく。
    for (let i = 0; i < 40; i++) {
      const map = sm.build(SENIOR, MINE, ov);
      const guess = rowsOf(map).filter(sm.isGuess)[0];
      if (!guess) break;
      if (guess.ref && guess.mine) ov = sm.withPair(ov, guess.type, guess.ref, guess.mine);
      else if (guess.ref) ov = sm.withNone(ov, guess.type, 'ref', guess.ref);
      else ov = sm.withNone(ov, guess.type, 'mine', guess.mine);
    }
    const map = sm.build(SENIOR, MINE, ov);
    expect(sm.guessCount(map)).toBe(0);
    expect(sm.settled(map)).toBe(true);
    const added = sm.addedByRef(map);
    expect(added.length).toBeGreaterThan(0);
    expect(sm.decisionSummary(map)).toContain('対応は全部決まりました');
    // 言い切った行は、そのまま「＋この図にも足す」に渡せる。
    expect(sm.adoptPlan(added[0], map, MINE).adoptable).toBe(true);
    // 決め切ったので抽象度の警告も出ない。
    expect(sm.abstractionWarning(map)).toBe('');
  });

  test('片方だけの行には、相手側の片方だけの行が選び直し候補として出る', () => {
    const map = sm.build(SENIOR, MINE);
    const only = map.states.filter((r) => r.match === 'ref-only')[0];
    if (only) {
      const opts = sm.pairOptions(map, only);
      opts.forEach((o) => {
        expect(map.states.some((r) => r.match === 'mine-only' && r.mine === o.value)).toBe(true);
      });
    }
    // 組になっている行には選び直しの候補を出さない (既に相手がいる)。
    const paired = map.states.filter((r) => r.ref && r.mine)[0];
    if (paired) expect(sm.pairOptions(map, paired)).toEqual([]);
  });

  test('手で決めた状態の対応は、遷移の突き合わせにも効く', () => {
    const ov = sm.withPair(sm.EMPTY_OVERRIDES, 'state', 'Idle', 'Uninit');
    const map = sm.build(SENIOR, MINE, ov);
    expect(sm.aliasMap(map).Idle).toBe('Uninit');
  });

  test('壊れた・空の決めを渡しても落ちない', () => {
    expect(sm.overrides(null)).toEqual({ pairs: [], none: [] });
    expect(sm.overrides({ pairs: [{ ref: '', mine: 'x' }], none: [{ side: 'nope', name: 'y' }] }))
      .toEqual({ pairs: [], none: [] });
    // 図に無い名前を決めても、その決めは効かないだけで表は作れる。
    const ov = sm.withPair(sm.EMPTY_OVERRIDES, 'state', 'NoSuch', 'Neither');
    expect(sm.build(SENIOR, MINE, ov).states.length).toBeGreaterThan(0);
  });

  test('決めが無いときは今までと同じ表になる', () => {
    const a = sm.build(SENIOR, MINE);
    const b = sm.build(SENIOR, MINE, sm.EMPTY_OVERRIDES);
    expect(b.states.map((r) => r.match)).toEqual(a.states.map((r) => r.match));
    expect(b.transitions.map((r) => r.match)).toEqual(a.transitions.map((r) => r.match));
  });
});
