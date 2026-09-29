'use strict';
// BLK-builder-20260924-1719-3 (design 10a): 保存先ツリーの部品フォルダ。
// 区切りの無い日本語名 (`TIMERドライバ状態遷移`) が 1 枚ずつ別の部品フォルダになっていた。
// 先頭の英数字の語を部品名として読み、日本語の図種の語も図種として読む。

var W = (typeof window !== 'undefined' && window) || global.window;
var FT = W.MA.fileTree;
var FM = W.MA.fileMenu;

describe('区切りの無い日本語名の部品名 (BLK-builder-20260924-1719-3)', function() {
  test('先頭の英数字の語が部品', function() {
    expect(FT.partOf('TIMERドライバ初期化シーケンス')).toBe('timer');
    expect(FT.partOf('TIMERドライバ状態遷移(資料用)')).toBe('timer');
    expect(FT.partOf('GPIOドライバ利用ユースケース図(資料用)')).toBe('gpio');
    expect(FT.partOf('ADCドライバコンポーネント構成')).toBe('adc');
    expect(FT.partOf('SPIドライバ初期化シーケンス')).toBe('spi');
  });

  test('「部品名 + Drv / Driver」は同じ部品に数える', function() {
    expect(FT.partOf('TimerDrv派生クラス図')).toBe('timer');
    expect(FT.partOf('GpioDrv派生クラス図(資料用)')).toBe('gpio');
    expect(FT.partOf('CanDriverの構成')).toBe('can');
  });

  test('区切りのある名前の読み方は今のまま', function() {
    expect(FT.partOf('spi_init_sequence')).toBe('spi');
    expect(FT.partOf('SPI ドライバ 状態遷移')).toBe('spi');
    expect(FT.partOf('can-component')).toBe('can');
    expect(FT.partOf('diagram1_sequence-3')).toBe('diagram1');
    // 区切りのある英字だけの名前の Drv は削らない (spi_driver の driver を部品から外さないのと同じ)
    expect(FT.partOf('TimerDrv_class')).toBe('timerdrv');
    // 英数字で始まらない名前は名前全体
    expect(FT.partOf('新規図')).toBe('新規図');
  });
});

describe('日本語の図種の語 (BLK-builder-20260924-1719-3)', function() {
  test('名前の中の図種の語を読む', function() {
    expect(FT.kindOf('TIMERドライバ初期化シーケンス')).toBe('sequence');
    expect(FT.kindOf('TIMERドライバ状態遷移(資料用)')).toBe('state');
    expect(FT.kindOf('TimerDrv派生クラス図')).toBe('class');
    expect(FT.kindOf('ADCドライバ利用ユースケース図')).toBe('usecase');
    expect(FT.kindOf('ADCドライバコンポーネント構成')).toBe('component');
    expect(FT.kindOf('GPIOドライバ初期化アクティビティ図')).toBe('activity');
    expect(FT.kindOf('TIMERドライバ初期化シーケンス-編集中')).toBe('sequence');
  });

  test('添え字 (資料用) を外して末尾の語を読む', function() {
    expect(FT.kindOf('spi_sequence(資料用)')).toBe('sequence');
    expect(FT.kindOf('spi_state')).toBe('state');
    expect(FT.kindOf('diagram1')).toBe('');
  });
});

describe('junior の保存先の形 (BLK-builder-20260924-1719-3)', function() {
  test('TIMER の図 12 枚が 1 つの部品フォルダ「TIMER 6 / 6」になる', function() {
    var names = [
      'TimerDrv派生クラス図(資料用)', 'TimerDrv派生クラス図',
      'TIMERドライバコンポーネント構成(資料用)', 'TIMERドライバコンポーネント構成',
      'TIMERドライバ初期化アクティビティ図(資料用)', 'TIMERドライバ初期化アクティビティ図',
      'TIMERドライバ初期化シーケンス(資料用)', 'TIMERドライバ初期化シーケンス',
      'TIMERドライバ状態遷移(資料用)', 'TIMERドライバ状態遷移',
      'TIMERドライバ利用ユースケース図(資料用)', 'TIMERドライバ利用ユースケース図',
      'spi_state', 'SPIドライバ初期化シーケンス',
    ];
    var lay = FT.layout(names.map(function(n) { return { name: n }; }));
    expect(lay.loose.length).toBe(0);
    expect(lay.groups.map(function(g) { return g.countLabel; })).toEqual(['SPI 2 / 6', 'TIMER 6 / 6']);
    expect(lay.groups[1].files.length).toBe(12);
  });
});

describe('別の部品フォルダへ動かしたときの名前 (BLK-builder-20260924-1719-3)', function() {
  test('先頭の部品名だけを差し替え、大文字の部品名は大文字・頭だけ大文字なら頭だけ大文字で書く', function() {
    expect(FM.renameForPart('TIMERドライバ状態遷移', 'adc')).toBe('ADCドライバ状態遷移');
    expect(FM.renameForPart('TimerDrv派生クラス図', 'gpio')).toBe('GpioDrv派生クラス図');
    expect(FM.renameForPart('TIMERドライバ状態遷移', 'timer')).toBe(null);
    // 区切りのある名前は今のまま
    expect(FM.renameForPart('spi_init_sequence', 'adc')).toBe('adc_init_sequence');
  });
});
