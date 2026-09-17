/**
 * BLK-junior-20260917-0523-wish — 図種は合うが部品名が違う相手を除外する。
 * 先輩のクラス図は driver_common_class (TIMER を含まない) しか無く、図種が合うので
 * 「対応が付きません。選んでください」に混じり、開いて読むまで TIMER 用でないと分からなかった。
 * @jest-environment jsdom
 */
'use strict';
require('../src/core/diagram-kind.js');
require('../src/core/cross-ref-diff.js');
const CRD = () => window.MA.crossRefDiff;

const SENIOR = [
  { name: 'timer_init_sequence', kind: 'sequence' },
  { name: 'timer_state', kind: 'state' },
  { name: 'driver_common_class', kind: 'class' },
  { name: 'plantuml-class', kind: 'class' },
];

describe('部品名を拾う', () => {
  [
    ['TimerDrv派生クラス図', 'timer'],
    ['TIMERドライバ状態遷移', 'timer'],
    ['timer_state.puml', 'timer'],
    ['Gpio_Driver', 'gpio'],
    ['driver_common_class', ''],
    ['diagram1', ''],
    ['状態遷移図', ''],
  ].forEach(([n, p]) => {
    test(n + ' → ' + p, () => { expect(CRD().partOf(n)).toBe(p); });
  });
});

describe('同じ図種でも部品名を含まない候補は相手にしない', () => {
  test('TIMER を含むクラス図が 0 枚なら no-part と言い切る', () => {
    const v = CRD().counterpartVerdict(SENIOR, 'TimerDrv派生クラス図', 'class');
    expect(v.state).toBe('no-part');
    expect(v.part).toBe('TIMER');
    expect(v.sameKind).toBe(2);
    expect(v.message).toContain('TIMER のクラス図がありません (4 枚中 0 枚)');
    expect(v.message).toContain('先へ進めます');
  });

  test('部品名を含む同じ図種があれば、今までどおり選ばせる', () => {
    const v = CRD().counterpartVerdict(
      SENIOR.concat([{ name: 'zz_timer_qq', kind: 'class' }]), 'TimerDrv派生クラス図', 'class');
    expect(['no-match', 'picked']).toContain(v.state);
  });

  test('部品名が拾えない図は図種だけで判断する (今までどおり)', () => {
    const v = CRD().counterpartVerdict([{ name: 'zzz_qqq', kind: 'class' }], 'クラス図', 'class');
    expect(v.state).toBe('no-match');
  });
});
