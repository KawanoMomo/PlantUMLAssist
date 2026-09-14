'use strict';
// BLK-junior-20260914-1006-wish: 先輩は GPIO 単独のクラス図を持たず、
// driver_common_class.puml (共通基底 + Spi/Can/Gpio/Uart/Timer/Adc の 8 クラス) に
// まとめている。部品名 1 つで、その部品に関わるクラス・メソッド・継承だけを
// 切り出し、自分の単独図と並べられるようにする。

if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['../src/core/part-slice.js'].forEach(function(f) {
  try { delete require.cache[require.resolve(f)]; } catch (e) {}
  require(f);
});
var PS = global.window.MA.partSlice;

// 先輩の複合図 (persona-data/primary/driver_common_class.puml と同じ形)
var COMPOSITE = [
  '@startuml',
  'title Driver_Common_Class',
  'class Driver_Common {',
  '  + Init() : void',
  '  + DeInit() : void',
  '}',
  'class Spi_Driver {',
  '  + Spi_Init() : void',
  '  + Spi_TransmitDma() : void',
  '}',
  'class Gpio_Driver {',
  '  + Gpio_Init() : void',
  '  + Gpio_Reset() : StatusType',
  '  + Gpio_SetHigh() : void',
  '}',
  'class Uart_Driver {',
  '  + Uart_Init() : void',
  '}',
  'class IRQCtrl {',
  '  + EnableIrq() : void',
  '  + Irq_Init() : void',
  '  + Spi_Ack() : void',
  '}',
  'Spi_Driver --|> Driver_Common',
  'Gpio_Driver --|> Driver_Common',
  'Uart_Driver --|> Driver_Common',
  'Spi_Driver --> IRQCtrl',
  'Gpio_Driver --> IRQCtrl',
  '@enduml',
].join('\n');

describe('part-slice — 複合図から部品を切り出す', function() {

  test('部品の一覧は継承の子だけ。基底は部品にしない', function() {
    expect(PS.parts(COMPOSITE).map(function(p) { return p.name; }))
      .toEqual(['Spi_Driver', 'Gpio_Driver', 'Uart_Driver']);
    expect(PS.isComposite(COMPOSITE)).toBe(true);
  });

  test('部品名の引きは _Driver / Drv の違いを吸収する', function() {
    expect(PS.partKey('Gpio_Driver')).toBe('gpio');
    expect(PS.partKey('GpioDrv')).toBe('gpio');
    expect(PS.partKey('Gpio')).toBe('gpio');
  });

  test('部品を選ぶと、その部品・継承の元・直接つながる相手だけが残る', function() {
    var r = PS.slice(COMPOSITE, 'Gpio');
    expect(r.kept).toEqual(['Driver_Common', 'Gpio_Driver', 'IRQCtrl']);
    expect(r.dropped).toEqual(['Spi_Driver', 'Uart_Driver']);
    expect(r.dsl).toContain('class Gpio_Driver {');
    expect(r.dsl).not.toContain('Spi_Driver');
    expect(r.dsl).not.toContain('Uart_Driver');
    // 継承と関連の線も、残ったクラスどうしのものだけ
    expect(r.dsl).toContain('Gpio_Driver --|> Driver_Common');
    expect(r.dsl).toContain('Gpio_Driver --> IRQCtrl');
  });

  test('残った相手のメンバから、別の部品の接頭辞を持つものを落とす', function() {
    var r = PS.slice(COMPOSITE, 'Gpio');
    expect(r.dsl).not.toContain('Spi_Ack');
    // どの部品のものでもないメンバは落とさない (基底の役目が読めなくなる)
    expect(r.dsl).toContain('EnableIrq');
    expect(r.dsl).toContain('Irq_Init');
    expect(r.dsl).toContain('+ Init() : void');
    // 部品そのもののメソッドは全部残る
    expect(r.dsl).toContain('Gpio_SetHigh');
  });

  test('@startuml・title など図の骨は残す (そのまま描ける)', function() {
    var r = PS.slice(COMPOSITE, 'Gpio_Driver');
    expect(r.dsl.split('\n')[0]).toBe('@startuml');
    expect(r.dsl).toContain('title Driver_Common_Class');
    expect(r.dsl.trim().slice(-7)).toBe('@enduml');
    // 閉じ括弧が残ったクラスぶんだけ残る (壊れた DSL を作らない)
    expect((r.dsl.match(/^\}$/gm) || []).length).toBe(3);
  });

  test('図に無い部品を選んだら null。切り出しは言い切れるときだけ', function() {
    expect(PS.slice(COMPOSITE, 'Adc')).toBeNull();
    expect(PS.findPart(COMPOSITE, 'Adc')).toBeNull();
  });

  test('切り出した結果を 1 行で言う (押す前に何が残るか読める)', function() {
    expect(PS.sliceLabel(PS.slice(COMPOSITE, 'Gpio')))
      .toBe('Gpio_Driver: 3 クラス (2 クラスを外しました)');
  });

  test('自分側の図の候補は、ファイル名が対でなくても部品名から並ぶ', function() {
    var names = [
      'GpioDrv派生クラス図(資料用).puml',
      'TimerDrv派生クラス図.puml',
      'gpio_init_sequence.puml',
      'plantuml-class.puml',
    ];
    var c = PS.candidates(names, 'Gpio');
    expect(c[0]).toBe('GpioDrv派生クラス図(資料用).puml');
    expect(c).not.toContain('TimerDrv派生クラス図.puml');
    expect(c).not.toContain('plantuml-class.puml');
  });

  test('候補のうち、本文にその部品のクラスがある 1 枚を採る', function() {
    var docs = [
      { name: 'a.puml', dsl: '@startuml\nclass Timer_Driver\n@enduml' },
      { name: 'b.puml', dsl: '@startuml\nclass Gpio_Driver\n@enduml' },
    ];
    expect(PS.pickOwn(docs, 'Gpio').name).toBe('b.puml');
    expect(PS.pickOwn(docs, 'Can')).toBeNull();
  });
});
