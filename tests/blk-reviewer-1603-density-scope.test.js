'use strict';
// BLK-reviewer-20260908-1603: 遷移密度が uart を「他系統より細かく分解されている」と
// 名指ししたが、5 系統を読み比べた結果これは粒度の崩れではなく、UART が TX/RX 双方向を
// 持つという構造の違いだった。
//
// 原因は分母と分子が別のものを数えていること。uart_init_sequence の 6 メッセージは
// Uart_Init() の中身 (EnableClock / WriteConfig / EnableIrq / Ack / InitDone) であり、
// 状態機械では 1 遷移にあたる。分母が初期化 1 回の内訳・分子が状態機械全体なので、
// 状態機械の広い系統は粒度が揃っていても必ず外れ値側に出る。
// 分母のメッセージが遷移と対応しているかを先に確かめ、対応していなければ
// 「比べられない」と言う (数だけ出さない)。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['../src/core/dsl-utils.js', '../src/core/parser-utils.js', '../src/core/scope-decl.js',
  '../src/core/family-audit.js', '../src/core/trace-coverage.js',
  '../src/core/transition-density.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var td = global.window.MA.transitionDensity;

// 初期化の「中身」を描いたシーケンス図 (実データの *_init_sequence.puml と同じ形)。
// 6 メッセージのうち、状態遷移のラベルと対応するのは先頭の 1 つだけ。
function initSeq(prefix) {
  return [
    '@startuml',
    'actor App',
    'participant ' + prefix + '_Driver',
    'participant ' + prefix + 'Regs',
    'participant ClockCtrl',
    'App -> ' + prefix + '_Driver : ' + prefix + '_Init()',
    prefix + '_Driver -> ClockCtrl : EnableClock()',
    prefix + '_Driver -> ' + prefix + 'Regs : WriteConfig()',
    prefix + '_Driver --> App : InitDone',
    '@enduml',
  ].join('\n');
}

function state(pairs) {
  return ['@startuml', '[*] --> Idle']
    .concat(pairs.map(function(p) { return p[0] + ' --> ' + p[1] + ' : ' + p[2]; }))
    .concat(['@enduml']).join('\n');
}

// 単方向の系統 (SPI/CAN と同じ形)。状態機械は 3 遷移。
function uni(key) {
  return [
    { id: key + 's', name: key + '_state', diagramType: 'state',
      dsl: state([
        ['Idle', 'Configured', key + '_Init'],
        ['Configured', 'Busy', key + '_Transmit'],
        ['Busy', 'Configured', 'TransferComplete'],
      ]) },
    { id: key + 'q', name: key + '_init_sequence', diagramType: 'sequence', dsl: initSeq(key) },
  ];
}

// 双方向の系統 (UART)。TX と RX を持つので状態機械は広いが、粒度は同じ 1 操作 1 遷移。
var UART = [
  { id: 'uarts', name: 'uart_state', diagramType: 'state',
    dsl: state([
      ['Idle', 'Configured', 'Uart_Init'],
      ['Configured', 'Transmitting', 'Uart_Send'],
      ['Configured', 'Receiving', 'Uart_Recv'],
      ['Transmitting', 'Configured', 'TxDone'],
      ['Receiving', 'Configured', 'RxDone'],
      ['Transmitting', 'Fault', 'FramingError'],
      ['Fault', 'Idle', 'Uart_Reset'],
    ]) },
  { id: 'uartq', name: 'uart_init_sequence', diagramType: 'sequence', dsl: initSeq('Uart') },
];

var DOCS = uni('Spi').concat(uni('Can'), uni('Adc'), UART);

// 状態遷移と同じ粒度で描かれたシーケンス図を持つ系統。
function levelSeq(prefix, msgs) {
  return ['@startuml', 'participant App', 'participant ' + prefix]
    .concat(msgs.map(function(m) { return 'App -> ' + prefix + ' : ' + m; }))
    .concat(['@enduml']).join('\n');
}
function oneToOne(key) {
  return [
    { id: key + 's', name: key + '_state', diagramType: 'state',
      dsl: state([['Idle', 'Configured', key + '_Init'], ['Configured', 'Done', key + '_Start']]) },
    { id: key + 'q', name: key + '_init_sequence', diagramType: 'sequence',
      dsl: levelSeq(key, [key + '_Init', key + '_Start']) },
  ];
}

describe('transition-density — 分母が状態機械と同じ粒度かを先に見る', function() {
  test('初期化の中身を描いたシーケンス図では密度を出さない', function() {
    var r = td.rank(DOCS);
    var uart = r.rows.filter(function(x) { return x.key === 'uart'; })[0];
    expect(uart.transitions).toBe(7);
    expect(uart.messages).toBe(4);
    // 遷移のラベルと対応するのは Uart_Init だけ
    expect(uart.msgMatched).toBe(1);
    expect(uart.sameGrain).toBe(false);
    expect(uart.density).toBe(null);
    expect(uart.reason).toBe('シーケンス図が状態機械と同じ粒度ではありません (1/4 メッセージだけが遷移に対応)');
    expect(td.densityText(uart)).toBe('—');
  });

  test('双方向系統がもう外れ値にならない (これまでは必ず外れ値側に出た)', function() {
    var r = td.rank(DOCS);
    expect(r.outliers).toEqual([]);
    // 単方向の系統も同じ理由で数えていない (物差しが無いので誰も名指ししない)
    expect(r.rows.filter(function(x) { return x.density != null; })).toEqual([]);
  });

  test('数えなかった系統は要約で名指しする (黙って落とさない)', function() {
    var line = td.summaryLine(td.rank(DOCS));
    expect(line).toContain('シーケンス図が状態機械と同じ粒度でない系統 4 件');
    expect(line).toContain('uart');
  });

  test('同じ粒度で描かれた系統は今までどおり数える', function() {
    var r = td.rank(oneToOne('Adc').concat(oneToOne('Can'), oneToOne('Spi')));
    expect(r.rows.every(function(x) { return x.sameGrain; })).toBe(true);
    expect(r.median).toBe(1);
    expect(td.summaryLine(r)).toContain('揃っています');
  });

  test('本当に粒度が崩れている系統は今までどおり外れ値になる', function() {
    var DMA = [
      { id: 'dmas', name: 'dma_state', diagramType: 'state',
        dsl: state([
          ['Idle', 'Configured', 'Dma_Init'],
          ['Configured', 'SrcSet', 'Dma_SetSrc'],
          ['SrcSet', 'DstSet', 'Dma_SetDst'],
          ['DstSet', 'Armed', 'Dma_Start'],
        ]) },
      { id: 'dmaq', name: 'dma_init_sequence', diagramType: 'sequence',
        dsl: levelSeq('Dma', ['Dma_Init', 'Dma_Start']) },
    ];
    var r = td.rank(oneToOne('Adc').concat(oneToOne('Can'), oneToOne('Spi'), DMA));
    expect(r.outliers.map(function(x) { return x.key; })).toEqual(['dma']);
    expect(r.rows[0].density).toBe(2);
  });

  test('粒度が同じ系統が 3 件に満たなければ、比べていないと言う', function() {
    var line = td.summaryLine(td.rank(uni('Spi').concat(uni('Can'), oneToOne('Adc'))));
    expect(line).toContain('比べられる系統が 1 件しかありません');
    expect(line).toContain('同じ粒度でない系統 2 件');
  });

  test('messageMatch: 対応したメッセージの数と割合を返す', function() {
    var m = td.messageMatch(
      [state([['Idle', 'Done', 'Spi_Init']])],
      [initSeq('Spi')]);
    expect(m.total).toBe(4);
    expect(m.matched).toBe(1);
    expect(m.ratio).toBe(0.25);
  });
});
