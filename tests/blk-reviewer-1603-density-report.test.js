'use strict';
// BLK-reviewer-20260908-1603: --summary の遷移密度の行が、実際には 2 系統しか
// 比べていない中央値を「10 系統とも揃っている」と言っていた (数えられなかった系統も
// rows に並ぶため)。数えた系統と、粒度が違って数えなかった系統を分けて言う。
const { loadMA } = require('../tools/audit-runtime');
const report = require('../tools/audit-report');

const { MA } = loadMA();

// 初期化の「中身」を描いたシーケンス図。状態遷移のラベルと対応するのは先頭だけ。
function initSeq(prefix) {
  return [
    '@startuml',
    'App -> ' + prefix + '_Driver : ' + prefix + '_Init()',
    prefix + '_Driver -> ClockCtrl : EnableClock()',
    prefix + '_Driver -> ' + prefix + 'Regs : WriteConfig()',
    prefix + '_Driver --> App : InitDone',
    '@enduml',
  ].join('\n');
}

function stateOf(prefix, extra) {
  return ['@startuml', '[*] --> Idle', 'Idle --> Configured : ' + prefix + '_Init']
    .concat(extra || []).concat(['@enduml']).join('\n');
}

function family(prefix, extra) {
  return [
    { name: prefix.toLowerCase() + '_state', dsl: stateOf(prefix, extra) },
    { name: prefix.toLowerCase() + '_init_sequence', dsl: initSeq(prefix) },
  ];
}

// spi / can は単方向、uart は TX/RX を持つ双方向。粒度はどれも 1 操作 1 遷移。
const DOCS = family('Spi', ['Configured --> Busy : Spi_Transmit', 'Busy --> Configured : Done'])
  .concat(family('Can', ['Configured --> Busy : Can_Transmit', 'Busy --> Configured : Done']))
  .concat(family('Uart', [
    'Configured --> Transmitting : Uart_Send',
    'Configured --> Receiving : Uart_Recv',
    'Transmitting --> Configured : TxDone',
    'Receiving --> Configured : RxDone',
    'Transmitting --> Fault : FramingError',
    'Fault --> Idle : Uart_Reset',
  ]));

function summaryOf(docs) {
  return report.formatSummary(report.buildReport(MA, docs, { targets: ["fixture"] }));
}

describe('--summary の遷移密度の行', function() {
  test('双方向系統を外れ値として名指ししない', function() {
    const line = summaryOf(DOCS).split('\n').filter((l) => l.indexOf('遷移密度') === 0)[0];
    expect(line).not.toContain('外れた系統');
    expect(line).toContain('比べられる系統が 0 件しかない');
  });

  test('数えなかった系統を名指しする (何を見ていないかを言う)', function() {
    const line = summaryOf(DOCS).split('\n').filter((l) => l.indexOf('遷移密度') === 0)[0];
    expect(line).toContain('同じ粒度でない系統 3 件');
    expect(line).toContain('uart');
  });
});
