'use strict';
// BLK-junior-20260907-0943-wish: テンプレートの部品を「対応表」で 1 度に置き換える。
// 置換は文字列一致ではなく宣言済みの部品名の付け替えとして行う。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/template-map.js')]; } catch (e) {}
require('../src/core/template-map.js');
var tm = global.window.MA.templateMap;

// junior が流用した先輩の GPIO ドライバ構成図。
// 「置換元の名前を含まない interface 宣言」がある状態が再現条件だった。
var GPIO = [
  '@startuml',
  'component GpioDrv',
  'interface "GPIO制御" as IGpio',
  'component "GPIO HAL" as GpioHal',
  'GpioDrv - IGpio',
  'GpioDrv --> GpioHal : Gpio_Write()',
  'note right of GpioDrv : GpioDrv は GPIO を握る',
  '@enduml',
].join('\n');

describe('templateMap.declarations', () => {
  test('別名つきの宣言は別名を部品名、引用符の中をラベルにする', () => {
    var d = tm.declarations(GPIO);
    var i = d.filter(function(x) { return x.kind === 'interface'; })[0];
    expect(i.id).toBe('IGpio');
    expect(i.label).toBe('GPIO制御');
  });

  test('別名の無い宣言は書かれた名前がそのまま部品名', () => {
    var c = tm.declarations(GPIO)[0];
    expect(c.kind).toBe('component');
    expect(c.id).toBe('GpioDrv');
  });

  test('宣言行の行番号を持つ', () => {
    expect(tm.declarations(GPIO)[0].line).toBe(2);
  });

  test('対応表に出る部品名は宣言順で重複しない', () => {
    expect(tm.declaredIds(GPIO)).toEqual(['GpioDrv', 'IGpio', 'GpioHal']);
  });

  test('引用名だけの宣言は本文から参照できないので部品名にしない', () => {
    expect(tm.declaredIds('@startuml\ncomponent "図だけの箱"\n@enduml')).toEqual([]);
  });
});

describe('templateMap.mapRows', () => {
  test('系統の置換で決まった行は resolved、決まらない行は空欄', () => {
    var rows = tm.mapRows(GPIO, function(n) { return n.split('Gpio').join('Uart'); });
    expect(rows.map(function(r) { return r.from; })).toEqual(['GpioDrv', 'IGpio', 'GpioHal']);
    expect(rows[0].to).toBe('UartDrv');
    expect(rows[0].resolved).toBe(true);
    // IGpio は Gpio を含むので系統の置換で決まる
    expect(rows[1].to).toBe('IUart');
  });

  test('系統の置換が当たらない部品は空欄のまま残る', () => {
    var dsl = '@startuml\ncomponent SpiDrv\ncomponent CommonLog\n@enduml';
    var rows = tm.mapRows(dsl, function(n) { return n.split('Spi').join('Adc'); });
    expect(rows[1].from).toBe('CommonLog');
    expect(rows[1].to).toBe('');
    expect(rows[1].resolved).toBe(false);
    expect(tm.unresolved(rows).map(function(r) { return r.from; })).toEqual(['CommonLog']);
  });

  test('keep を立てた行は決まったものとして扱う', () => {
    var rows = [{ from: 'CommonLog', to: '', keep: true }];
    expect(tm.unresolved(rows)).toEqual([]);
  });

  test('置換の関数を渡さなければ全部空欄', () => {
    var rows = tm.mapRows(GPIO);
    expect(rows.every(function(r) { return r.to === '' && !r.resolved; })).toBe(true);
  });
});

describe('templateMap.apply — 宣言済みの部品名の付け替え', () => {
  var ROWS = [
    { from: 'GpioDrv', to: 'UartDrv' },
    { from: 'IGpio', to: 'IUart' },
    { from: 'GpioHal', to: 'UartHal' },
  ];

  test('置換元の名前を含まない interface 宣言が壊れない', () => {
    var out = tm.apply(GPIO, ROWS).split('\n');
    expect(out[2]).toBe('interface "GPIO制御" as IUart');
  });

  test('対応表に無い部品名の宣言はそのまま残る', () => {
    var out = tm.apply(GPIO, [{ from: 'GpioDrv', to: 'UartDrv' }]).split('\n');
    expect(out[2]).toBe('interface "GPIO制御" as IGpio');
    expect(out[3]).toBe('component "GPIO HAL" as GpioHal');
  });

  test('本文の参照もまとめて付け替わる', () => {
    var out = tm.apply(GPIO, ROWS).split('\n');
    expect(out[4]).toBe('UartDrv - IUart');
    expect(out[5]).toContain('UartDrv --> UartHal');
  });

  test('部分一致では動かない (SpiDrvTest は SpiDrv の置換で変わらない)', () => {
    var dsl = '@startuml\ncomponent SpiDrv\nSpiDrv --> SpiDrvTest\nmySpiDrv --> SpiDrv\n@enduml';
    var out = tm.apply(dsl, [{ from: 'SpiDrv', to: 'AdcDrv' }]).split('\n');
    expect(out[2]).toBe('AdcDrv --> SpiDrvTest');
    expect(out[3]).toBe('mySpiDrv --> AdcDrv');
  });

  test('引用符の中のラベルは自由文として差し替わる', () => {
    var dsl = '@startuml\ncomponent "SpiDrv の箱" as SpiDrv\n@enduml';
    var out = tm.apply(dsl, [{ from: 'SpiDrv', to: 'AdcDrv' }]).split('\n');
    expect(out[1]).toBe('component "AdcDrv の箱" as AdcDrv');
  });

  test('宣言されていない名前は対応表に入れても効かない', () => {
    var out = tm.apply(GPIO, [{ from: 'Hal', to: 'X' }]);
    expect(out).toBe(GPIO);
  });

  test('置換先が空・同名・記号入りの行は当たらない', () => {
    expect(tm.apply(GPIO, [{ from: 'GpioDrv', to: '' }])).toBe(GPIO);
    expect(tm.apply(GPIO, [{ from: 'GpioDrv', to: 'GpioDrv' }])).toBe(GPIO);
    expect(tm.apply(GPIO, [{ from: 'GpioDrv', to: 'Uart Drv' }])).toBe(GPIO);
  });

  test('keep の行は当たらない', () => {
    expect(tm.apply(GPIO, [{ from: 'GpioDrv', to: 'UartDrv', keep: true }])).toBe(GPIO);
  });

  test('入れ替え (A→B, B→A) が 1 回で正しく行われる', () => {
    var dsl = '@startuml\ncomponent A\ncomponent B\nA --> B\n@enduml';
    var out = tm.apply(dsl, [{ from: 'A', to: 'B' }, { from: 'B', to: 'A' }]).split('\n');
    expect(out[3]).toBe('B --> A');
  });

  test('行数は変わらない', () => {
    expect(tm.apply(GPIO, ROWS).split('\n').length).toBe(GPIO.split('\n').length);
  });
});

describe('templateMap の検査', () => {
  test('置換先の綴りを検査する', () => {
    expect(tm.isValidTarget('UartDrv')).toBe(true);
    expect(tm.isValidTarget('Uart Drv')).toBe(false);
    expect(tm.isValidTarget('"Uart"')).toBe(false);
    expect(tm.isValidTarget('')).toBe(false);
  });

  test('2 つの部品を同じ名前に寄せる組を見つける', () => {
    var c = tm.collisions([
      { from: 'GpioDrv', to: 'UartDrv' },
      { from: 'GpioHal', to: 'UartDrv' },
      { from: 'IGpio', to: 'IUart' },
    ]);
    expect(c.length).toBe(1);
    expect(c[0].to).toBe('UartDrv');
    expect(c[0].from).toEqual(['GpioDrv', 'GpioHal']);
  });

  test('衝突が無ければ空', () => {
    expect(tm.collisions([{ from: 'A', to: 'B' }])).toEqual([]);
  });

  test('previewLines は変わる行だけを行番号つきで返す', () => {
    var p = tm.previewLines(GPIO, [{ from: 'IGpio', to: 'IUart' }]);
    expect(p.map(function(r) { return r.line; })).toEqual([3, 5]);
    expect(p[0].after).toBe('interface "GPIO制御" as IUart');
  });
});
