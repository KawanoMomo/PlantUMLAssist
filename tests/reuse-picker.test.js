'use strict';
// BLK-junior-20260907-0643: 一括入力欄が「構文込みの行をそのまま打たせる」設計だと
// 要素が少し増えるだけでキー入力が 50 を超える。既に他の図にある行は打ち直さず
// 選んで持ち込めるようにするための候補集め。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/line-edit.js', '../src/core/reuse-picker.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var rp = global.window.MA.reusePicker;

var SEQ_DSL = [
  '@startuml',
  'actor Dev',
  'participant "SPI ドライバ" as SpiDrv',
  'participant Hal',
  'Dev -> SpiDrv : Spi_Init()',
  'SpiDrv -> Hal : Hal_Open()',
  'alt 失敗',
  '  Hal --> SpiDrv : E_NOT_OK',
  'end',
  '@enduml',
].join('\n');

var ACT_DSL = [
  '@startuml',
  'start',
  ':SPIレジスタクロックを有効化;',
  ':SPIピン方向を設定;',
  'stop',
  '@enduml',
].join('\n');

var DOCS = [
  { id: 'd1', name: 'SPI_Init_Sequence', diagramType: 'plantuml-sequence', dsl: SEQ_DSL },
  { id: 'd2', name: 'Spi_Init_Activity', diagramType: 'plantuml-activity', dsl: ACT_DSL },
  { id: 'd3', name: 'UART_Init_Sequence', diagramType: 'plantuml-sequence', dsl: '@startuml\nactor Dev\nparticipant UartDrv\n@enduml' },
];

describe('reusePicker.collect', function() {
  test('同じ図種の図から宣言と矢印だけを集める', function() {
    var got = rp.collect(DOCS, 'plantuml-sequence', 'd3');
    var texts = got.map(function(g) { return g.text; });
    expect(texts).toContain('actor Dev');
    expect(texts).toContain('participant "SPI ドライバ" as SpiDrv');
    expect(texts).toContain('Dev -> SpiDrv : Spi_Init()');
    expect(texts).toContain('Hal --> SpiDrv : E_NOT_OK');
  });

  test('@startuml・alt・end などは候補にしない', function() {
    var texts = rp.collect(DOCS, 'plantuml-sequence', 'd3').map(function(g) { return g.text; });
    expect(texts.indexOf('@startuml')).toBe(-1);
    expect(texts.indexOf('alt 失敗')).toBe(-1);
    expect(texts.indexOf('end')).toBe(-1);
  });

  test('図種が違う図の行は混ざらない', function() {
    var texts = rp.collect(DOCS, 'plantuml-sequence', null).map(function(g) { return g.text; });
    expect(texts.indexOf('SPIピン方向を設定')).toBe(-1);
  });

  test('編集中の図 (exceptId) は候補にしない', function() {
    var texts = rp.collect(DOCS, 'plantuml-sequence', 'd1').map(function(g) { return g.text; });
    expect(texts.indexOf('Dev -> SpiDrv : Spi_Init()')).toBe(-1);
    expect(texts).toContain('participant UartDrv');
  });

  test('同じ行は 1 度しか出さない (actor Dev は 2 図にある)', function() {
    var texts = rp.collect(DOCS, 'plantuml-sequence', null).map(function(g) { return g.text; });
    var n = texts.filter(function(t) { return t === 'actor Dev'; }).length;
    expect(n).toBe(1);
  });

  test('どの図から来たかが分かる', function() {
    var got = rp.collect(DOCS, 'plantuml-sequence', 'd3');
    var hit = got.filter(function(g) { return g.text === 'Dev -> SpiDrv : Spi_Init()'; })[0];
    expect(hit.from).toBe('SPI_Init_Sequence');
  });

  test('アクティビティ図はラベルだけを候補にする', function() {
    var got = rp.collect(DOCS, 'plantuml-activity', null);
    var texts = got.map(function(g) { return g.text; });
    expect(texts).toContain('SPIレジスタクロックを有効化');
    expect(texts.indexOf(':SPIピン方向を設定;')).toBe(-1);
    expect(texts.indexOf('start')).toBe(-1);
  });

  test('図が無ければ空 (落ちない)', function() {
    expect(rp.collect([], 'plantuml-sequence', null).length).toBe(0);
    expect(rp.collect(null, 'plantuml-sequence', null).length).toBe(0);
  });
});

describe('reusePicker.toBlock', function() {
  test('宣言が先、矢印が後に並ぶ', function() {
    var block = rp.toBlock([
      { text: 'Dev -> SpiDrv : Spi_Init()', kind: 'arrow' },
      { text: 'actor Dev', kind: 'decl' },
      { text: 'participant SpiDrv', kind: 'decl' },
    ]);
    expect(block).toBe('actor Dev\nparticipant SpiDrv\nDev -> SpiDrv : Spi_Init()');
  });

  test('空の選択は空文字', function() {
    expect(rp.toBlock([])).toBe('');
    expect(rp.toBlock(null)).toBe('');
  });
});

describe('reusePicker.appendTo', function() {
  test('空の欄なら置き換える', function() {
    expect(rp.appendTo('', 'actor Dev')).toBe('actor Dev');
    expect(rp.appendTo('   \n', 'actor Dev')).toBe('actor Dev');
  });

  test('書きかけの行の後ろに足す', function() {
    expect(rp.appendTo('actor Dev', 'participant UartDrv')).toBe('actor Dev\nparticipant UartDrv');
  });

  test('既にある行は足さない', function() {
    expect(rp.appendTo('actor Dev', 'actor Dev\nparticipant UartDrv'))
      .toBe('actor Dev\nparticipant UartDrv');
    expect(rp.appendTo('actor Dev', 'actor Dev')).toBe('actor Dev');
  });

  test('空の block は欄を変えない', function() {
    expect(rp.appendTo('actor Dev', '')).toBe('actor Dev');
  });
});
