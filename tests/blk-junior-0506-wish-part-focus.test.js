'use strict';
// BLK-junior-20260915-0506-wish: 相乗り図 (SPI/CAN/GPIO… が 1 枚) を 1 枚のまま
// 部品名でフィルタし、その部品に関係するクラス・関連だけを浮かび上がらせる。
// ここで固定するのは:
//   - 関係の範囲が切り出し (part-slice) と同じ (部品 + 継承の元 + 直接の相手)
//   - 淡色化は行を消さない (相乗り図の位置関係が残る)
//   - 非表示は切り出しと同じ本文になる (規則を 2 つ持たない)
//   - 本文 (テキスト) の側でも、どの行が関係するかが行単位で言える
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

['../src/core/part-slice.js', '../src/core/part-focus.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var PF = global.window.MA.partFocus;
var PS = global.window.MA.partSlice;

// 先輩の driver_common_class.puml を写した形。共通基底 + 3 ドライバ + 周辺。
var SENIOR = [
  '@startuml',
  'class Driver_Common {',
  '  +Init()',
  '  +DeInit()',
  '}',
  'class Spi_Driver {',
  '  +Spi_Init()',
  '  +Spi_Transmit()',
  '}',
  'class Can_Driver {',
  '  +Can_Init()',
  '}',
  'class Gpio_Driver {',
  '  +Gpio_Init()',
  '}',
  'class SpiRegs',
  'class CanRegs',
  'class IRQCtrl {',
  '  +EnableIrq()',
  '}',
  'Driver_Common <|-- Spi_Driver',
  'Driver_Common <|-- Can_Driver',
  'Driver_Common <|-- Gpio_Driver',
  'Spi_Driver --> SpiRegs',
  'Can_Driver --> CanRegs',
  'Spi_Driver ..> IRQCtrl',
  '@enduml',
].join('\n');

describe('part-focus — 相乗り図を 1 枚のまま部品で絞る', function() {
  test('相乗り図だと分かり、部品が数えられる', function() {
    expect(PF.isComposite(SENIOR)).toBe(true);
    var names = PF.parts(SENIOR).map(function(p) { return p.name; });
    expect(names).toContain('Spi_Driver');
    expect(names).toContain('Can_Driver');
    expect(PF.compositeLabel(SENIOR)).toContain('3 部品');
  });

  test('関係する範囲は 部品 + 継承の元 + 直接つながる相手', function() {
    var r = PF.related(SENIOR, 'Spi_Driver');
    expect(r.kept.sort()).toEqual(['Driver_Common', 'IRQCtrl', 'SpiRegs', 'Spi_Driver']);
    expect(r.others.sort()).toEqual(['CanRegs', 'Can_Driver', 'Gpio_Driver']);
  });

  test('部品名の揺れ (SPI / SpiDrv) でも同じ部品を引ける', function() {
    expect(PF.related(SENIOR, 'SpiDrv').part.name).toBe('Spi_Driver');
  });

  test('淡色化は行を消さない (相乗り図の位置関係が残る)', function() {
    var res = PF.focus(SENIOR, 'Spi_Driver', 'dim');
    expect(res.dsl.split('\n').length).toBe(SENIOR.split('\n').length);
    expect(res.dsl).toContain('Can_Driver');
    expect(res.dsl).toContain('Gpio_Init()');
  });

  test('関係しないクラスは淡色、選んだ部品は目立つ色が付く', function() {
    var res = PF.focus(SENIOR, 'Spi_Driver', 'dim');
    var lines = res.dsl.split('\n');
    function headOf(name) {
      return lines.filter(function(l) { return l.indexOf('class ' + name) === 0; })[0];
    }
    expect(headOf('Spi_Driver')).toContain(PF.FOCUS);
    expect(headOf('Can_Driver')).toContain(PF.DIM);
    expect(headOf('Gpio_Driver')).toContain(PF.DIM);
    // 関係する相手は色を足さない (浮かせたいのは関係する所の方)
    expect(headOf('Driver_Common')).not.toContain(PF.DIM);
    expect(headOf('SpiRegs')).not.toContain(PF.DIM);
    // 中身の行は触らない (メソッド名が消えない)
    expect(res.dsl).toContain('  +Can_Init()');
  });

  test('波括弧のあるクラス宣言も、色を足した後で開いたままになる', function() {
    var res = PF.focus(SENIOR, 'Spi_Driver', 'dim');
    var head = res.dsl.split('\n').filter(function(l) { return l.indexOf('class Can_Driver') === 0; })[0];
    expect(head.slice(-1)).toBe('{');
    expect(head).toBe('class Can_Driver ' + PF.DIM + ' {');
  });

  test('関係しない関連線は矢印の中に色が入る (線の形は変えない)', function() {
    var res = PF.focus(SENIOR, 'Spi_Driver', 'dim');
    expect(res.dsl).toContain('Driver_Common <|-[' + PF.DIM + ']- Can_Driver');
    expect(res.dsl).toContain('Can_Driver -[' + PF.DIM + ']-> CanRegs');
    // 関係する線はそのまま
    expect(res.dsl).toContain('Driver_Common <|-- Spi_Driver');
    expect(res.dsl).toContain('Spi_Driver --> SpiRegs');
    expect(res.dsl).toContain('Spi_Driver ..> IRQCtrl');
  });

  test('既に色の付いたクラスも、関係しなければ淡色に置き換わる', function() {
    var dsl = SENIOR.replace('class Can_Driver {', 'class Can_Driver #Pink {');
    var res = PF.focus(dsl, 'Spi_Driver', 'dim');
    var head = res.dsl.split('\n').filter(function(l) { return l.indexOf('class Can_Driver') === 0; })[0];
    expect(head).toBe('class Can_Driver ' + PF.DIM + ' {');
  });

  test('非表示は切り出しと同じ本文 (規則を 2 つ持たない)', function() {
    var res = PF.focus(SENIOR, 'Spi_Driver', 'hide');
    expect(res.dsl).toBe(PS.slice(SENIOR, 'Spi_Driver').dsl);
    expect(res.dsl).not.toContain('Can_Driver');
  });

  test('何が残って何が落ちたかを数で言う', function() {
    var res = PF.focus(SENIOR, 'Spi_Driver', 'dim');
    var label = PF.focusLabel(res);
    expect(label).toContain('Spi_Driver');
    expect(label).toContain('4 クラス');
    expect(label).toContain('3 クラス');
    expect(label).toContain('淡色');
    expect(PF.focusLabel(PF.focus(SENIOR, 'Spi_Driver', 'hide'))).toContain('非表示');
  });

  test('本文の行も関係するかどうかが行単位で言える', function() {
    var flags = PF.lineFlags(SENIOR, 'Spi_Driver');
    var lines = SENIOR.split('\n');
    function flagOf(text) { return flags[lines.indexOf(text)]; }
    expect(flagOf('class Spi_Driver {')).toBe('keep');
    expect(flagOf('  +Spi_Init()')).toBe('keep');
    expect(flagOf('class Can_Driver {')).toBe('dim');
    expect(flagOf('  +Can_Init()')).toBe('dim');
    expect(flagOf('Can_Driver --> CanRegs')).toBe('dim');
    expect(flagOf('Spi_Driver --> SpiRegs')).toBe('keep');
    expect(flagOf('@startuml')).toBe('');
  });

  test('図に無い部品名なら何もしない (別の図で誤爆しない)', function() {
    expect(PF.focus(SENIOR, 'Adc_Driver', 'dim')).toBe(null);
    expect(PF.related(SENIOR, 'Adc_Driver')).toBe(null);
    expect(PF.compositeLabel('@startuml\nclass A\n@enduml')).toBe('');
  });
});

global.window = prevWindow;
global.document = prevDocument;
