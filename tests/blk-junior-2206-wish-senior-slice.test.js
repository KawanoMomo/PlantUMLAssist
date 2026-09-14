'use strict';
// BLK-junior-20260914-2206-wish: 先輩のクラス図は全ドライバ共通の 1 枚
// (driver_common_class) なので、部品名で 1:1 に引けず「👀 先輩」は常に「−」だった。
// 共通図を相手として選び、その中から自分の部品に当たる所だけを抜き出せること。
const assert = require('assert');
const SS = require('../src/core/senior-slice');
const SP = require('../src/core/senior-pane');

const COMMON = [
  '@startuml',
  'title Driver_Common_Class',
  'class Driver_Common {',
  '  + Init() : void',
  '}',
  'class Spi_Driver {',
  '  + Spi_Init() : void',
  '}',
  'class Timer_Driver {',
  '  + Timer_Init() : void',
  '  + Timer_Start() : void',
  '}',
  'class Uart_Driver {',
  '  + Uart_Init() : void',
  '}',
  'class IRQCtrl {',
  '  + EnableIrq() : void',
  '}',
  'Spi_Driver --|> Driver_Common',
  'Timer_Driver --|> Driver_Common',
  'Uart_Driver --|> Driver_Common',
  'Spi_Driver --> IRQCtrl',
  'Timer_Driver --> IRQCtrl : 完了通知',
  '@enduml',
].join('\n');

describe('共通図から自分の部品の所だけを抜き出す', function() {
  test('図の名前から部品名を起こす (Drv/ドライバ は落とし、先に短い方を試す)', function() {
    assert.deepStrictEqual(SS.partKeysOf('TimerDrv派生クラス図.puml'), ['timer', 'timerdrv']);
    assert.deepStrictEqual(SS.partKeysOf('TIMERドライバ状態遷移.puml'), ['timer']);
    assert.deepStrictEqual(SS.partKeysOf('gpio_state.puml'), ['gpio']);
  });

  test('当たったクラスと、線で繋がる相手 1 段だけを残す', function() {
    const r = SS.slice(COMMON, ['timer']);
    assert.strictEqual(r.matched, true);
    assert.deepStrictEqual(r.focus, ['Timer_Driver']);
    assert.deepStrictEqual(r.kept, ['Driver_Common', 'Timer_Driver', 'IRQCtrl']);
    // 他部品は伏せる (共通図をそのまま出すと自分の所を目で探すことになる)。
    assert.ok(r.dsl.indexOf('Spi_Driver') < 0);
    assert.ok(r.dsl.indexOf('Uart_Driver') < 0);
    assert.strictEqual(r.dropped, 2);
  });

  test('残したクラス同士の線だけを引く (片端が消えた線は落とす)', function() {
    const r = SS.slice(COMMON, ['timer']);
    assert.ok(r.dsl.indexOf('Timer_Driver --|> Driver_Common') >= 0);
    assert.ok(r.dsl.indexOf('Timer_Driver --> IRQCtrl : 完了通知') >= 0);
    assert.ok(r.dsl.indexOf('Spi_Driver --> IRQCtrl') < 0);
  });

  test('当たったクラスだけに色を付け、線で繋がる相手には付けない', function() {
    const r = SS.slice(COMMON, ['timer']);
    assert.ok(r.dsl.indexOf('class Timer_Driver ' + SS.FOCUS_BG + ' {') >= 0);
    assert.ok(r.dsl.indexOf('class Driver_Common {') >= 0);
  });

  test('メソッドの行は先輩のまま残す (粒度を合わせるのが手順1 の的)', function() {
    const r = SS.slice(COMMON, ['timer']);
    assert.ok(r.dsl.indexOf('+ Timer_Start() : void') >= 0);
  });

  test('当たるクラスが無ければ「抜き出せた」と言わない', function() {
    const r = SS.slice(COMMON, ['adc']);
    assert.strictEqual(r.matched, false);
    assert.ok(SS.sliceNotice(r, 'driver_common_class.puml', 'adc').indexOf('ありません') >= 0);
  });

  test('抜き出した枚数と伏せた枚数を言う (これで全部、と読ませない)', function() {
    const note = SS.sliceNotice(SS.slice(COMMON, ['timer']), 'driver_common_class.puml', 'timer');
    assert.ok(note.indexOf('3 クラス') >= 0);
    assert.ok(note.indexOf('他 2 クラスは伏せています') >= 0);
  });
});

describe('共通図を相手として選ぶ (4 段目)', function() {
  const NAMES = ['driver_common_class.puml', 'gpio_init_sequence.puml', 'can_state.puml'];
  function pick(mine, keys) {
    return SP.pickCounterpart({ name: mine, dir: './junior' }, NAMES, './primary', keys);
  }

  test('区切りの無い日本語の名前からも図種を読む (TimerDrv派生クラス図 = クラス図)', function() {
    assert.strictEqual(SP.kindOf('TimerDrv派生クラス図.puml'), 'class');
    assert.strictEqual(SP.kindOf('TIMERドライバ初期化シーケンス.puml'), 'sequence');
    assert.strictEqual(SP.kindOf('TIMERドライバ状態遷移.puml'), 'state');
  });

  test('名前で引けないクラス図でも、同じ図種の共通図を相手にする', function() {
    const p = pick('TimerDrv派生クラス図.puml', SS.partKeysOf('TimerDrv派生クラス図.puml'));
    assert.strictEqual(p.how, 'common-slice');
    assert.strictEqual(p.name, 'driver_common_class.puml');
    assert.strictEqual(p.key, 'timer');
  });

  test('下端は「−」ではなく、どの共通図のどの部分が出るかを言う', function() {
    const p = pick('TimerDrv派生クラス図.puml', SS.partKeysOf('TimerDrv派生クラス図.puml'));
    const t = SP.statusText(p, { ready: true });
    assert.ok(t.label.indexOf('driver_common_class') >= 0);
    assert.ok(t.label.indexOf('timer') >= 0);
    assert.strictEqual(t.count, 1);
  });

  test('部品名が起こせなければ共通図を相手にしない (無関係な図を先輩と読ませない)', function() {
    assert.strictEqual(pick('TimerDrv派生クラス図.puml', []).how, 'none');
  });

  test('図種が違えば共通図を相手にしない', function() {
    assert.strictEqual(pick('adc_activity.puml', ['adc']).how, 'none');
  });

  test('名前で 1:1 に引ける図は今までどおり 1〜3 段で決まる', function() {
    assert.strictEqual(pick('gpio_init_sequence.puml', ['gpio']).how, 'same-name');
  });
});
