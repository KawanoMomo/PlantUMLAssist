/**
 * BLK-junior-20260917-0423 — 相手のフォルダに同じ図種が無いときの答え。
 *
 * 場面3 (先輩の図の変更を取り込む) のクラス図の周で、先輩のフォルダには
 * timer_init_sequence / timer_state しか無く TimerDrv のクラス図が無かった。
 * 相手選びは名前の近さだけを見ていたので、クラス図の相手にシーケンス図
 * (timer_init_sequence) が「近い名前」として当たり、全要素が片方にしか無い
 * 差分になる。junior はそれを「先輩が全部書き換えた」と区別できず、
 * フォルダを目で走査して「無い」を確かめ直すところで手順 1 が止まった。
 *
 * 図種が食い違う相手は候補から外し、1 枚も無いことは答えとして言い切る。
 * @jest-environment jsdom
 */
'use strict';

require('../src/core/diagram-kind.js');
require('../src/core/cross-ref-diff.js');

const CRD = () => window.MA.crossRefDiff;

// 先輩 (primary) のフォルダの実際の中身に近い並び。
const SENIOR = [
  { name: 'timer_init_sequence', kind: 'sequence' },
  { name: 'timer_state', kind: 'state' },
  { name: 'driver_common_class', kind: 'class' },
];

describe('図種の違う図は相手にしない', () => {
  test('クラス図の相手に、図種の違う図を当てない', () => {
    const pick = CRD().pickCounterpart(SENIOR, 'TimerDrv派生クラス図', 'class');
    expect(pick).not.toBe('timer_init_sequence');
    expect(pick).not.toBe('timer_state');
  });

  test('名前の近さが付く図でも、図種が違えば外す', () => {
    // timer_state は timer_init_sequence と語が重なるので、state 図どうしなら近い。
    expect(CRD().pickCounterpart(SENIOR, 'timer_init_sequence', 'state')).toBe('timer_state');
    // 同じ名前でも図種が違えば相手にしない (名前は図種をまたいで使い回される)。
    expect(CRD().pickCounterpart(
      [{ name: 'timer_state', kind: 'state' }], 'timer_state', 'class')).toBe(null);
  });

  test('図種の食い違う候補には印が付き、一覧の後ろに回る', () => {
    const ranked = CRD().counterparts(SENIOR, 'TimerDrv派生クラス図', 'class');
    const seq = ranked.find((c) => c.name === 'timer_init_sequence');
    expect(seq.kindMismatch).toBe(true);
    expect(seq.distance).toBe(null);
    // 同じ図種のものが先。
    expect(ranked[0].kindMismatch).toBe(false);
  });

  test('図種が分からない相手は今までどおり名前で見る', () => {
    const names = ['gpio_init_sequence', 'zzz'];
    expect(CRD().pickCounterpart(names, 'gpio_init_sequence', 'class')).toBe('gpio_init_sequence');
  });
});

describe('相手が決まらないことを答えにする', () => {
  const TIMER_ONLY = [
    { name: 'timer_init_sequence', kind: 'sequence' },
    { name: 'timer_state', kind: 'state' },
  ];

  test('相手にクラス図が 1 枚も無ければ「比較元なし」と言い切る', () => {
    const v = CRD().counterpartVerdict(TIMER_ONLY, 'TimerDrv派生クラス図', 'class');
    expect(v.state).toBe('no-kind');
    expect(v.name).toBe(null);
    expect(v.sameKind).toBe(0);
    expect(v.total).toBe(2);
    expect(v.message).toContain('クラス図がありません');
    // 手順 1 の答えとして先へ進める、と画面の言葉で言う。
    expect(v.message).toContain('先へ進めます');
  });

  test('その図種はあるが名前が離れているときは、選べと言う', () => {
    const v = CRD().counterpartVerdict(
      [{ name: 'zzz_qqq', kind: 'class' }], 'TimerDrv派生クラス図', 'class');
    expect(v.state).toBe('no-match');
    expect(v.sameKind).toBe(1);
    expect(v.message).toContain('選んでください');
  });

  test('相手が決まるときは名前を返すだけ', () => {
    const v = CRD().counterpartVerdict(
      [{ name: 'TimerDrv派生クラス図', kind: 'class' }], 'TimerDrv派生クラス図', 'class');
    expect(v.state).toBe('picked');
    expect(v.name).toBe('TimerDrv派生クラス図');
    expect(v.message).toBe('');
  });

  test('相手のフォルダが空なら空と言う', () => {
    const v = CRD().counterpartVerdict([], 'TimerDrv派生クラス図', 'class');
    expect(v.state).toBe('empty');
    expect(v.message).toContain('図がありません');
  });
});
