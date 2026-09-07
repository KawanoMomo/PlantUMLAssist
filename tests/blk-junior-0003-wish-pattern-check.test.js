'use strict';
// BLK-junior-20260908-0003-wish: 同種指摘の一括チェック。
// 「GpioDrv にコンストラクタが無い」を 1 枚直したあと、同じ観点が他の題材の図
// にも当てはまるかを、図を 1 枚ずつ開かずに横断で棚卸しできることを固定する。
const assert = require('assert');
if (!global.window) global.window = global;
['../src/core/dsl-utils.js', '../src/core/impact-scan.js', '../src/core/method-audit.js',
  '../src/core/pattern-check.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var pc = global.window.MA.patternCheck;

function uml(lines) { return ['@startuml'].concat(lines, ['@enduml']).join('\n'); }

// ── クラス図 3 枚。GpioDrv だけコンストラクタ済み ──────────────────────
var CLASS_GPIO = uml([
  'class GpioDrv {', '  +GpioDrv()', '  +Gpio_Write(ch, v)', '}',
]);
var CLASS_UART = uml([
  'class UartDrv {', '  +Uart_Send(buf)', '}',
]);
var CLASS_CAN = uml([
  'class CanDrv {', '  +Can_Send(msg)', '}',
  'class CanMailbox {', '  +CanMailbox()', '}',
]);

// ── 状態遷移図 2 枚。dma だけ Error からの復帰が無い ────────────────────
var STATE_ADC = uml([
  '[*] --> Idle', 'Idle --> Busy : Start', 'Busy --> Error : Fault',
  'Error --> Idle : Reset', 'Idle --> [*]',
]);
var STATE_DMA = uml([
  '[*] --> Idle', 'Idle --> Transfer : Start', 'Transfer --> Error : Fault',
  'Error --> [*]',
]);

// ── シーケンス図 2 枚。can だけエラー呼び出しに応答が無い ────────────────
var SEQ_SPI = uml([
  'participant App', 'participant Spi_Driver',
  'App -> Spi_Driver : Spi_Transmit()',
  'Spi_Driver --> App : OK',
  'App -> Spi_Driver : Spi_ReportError()',
  'Spi_Driver --> App : Ack',
]);
var SEQ_CAN = uml([
  'participant App', 'participant Can_Driver',
  'App -> Can_Driver : Can_Send()',
  'Can_Driver --> App : OK',
  'App -> Can_Driver : Can_NotifyFault()',
]);

var DOCS = [
  { id: 'd1', name: 'gpio_class.puml', dsl: CLASS_GPIO },
  { id: 'd2', name: 'uart_class.puml', dsl: CLASS_UART },
  { id: 'd3', name: 'can_class.puml', dsl: CLASS_CAN },
  { id: 'd4', name: 'adc_state.puml', dsl: STATE_ADC },
  { id: 'd5', name: 'dma_state.puml', dsl: STATE_DMA },
  { id: 'd6', name: 'spi_seq.puml', dsl: SEQ_SPI },
  { id: 'd7', name: 'can_seq.puml', dsl: SEQ_CAN },
];

// 観点は 3 つ以上あり、id で引ける。
assert.ok(pc.patterns().length >= 3, '観点が登録されている');
assert.strictEqual(pc.findPattern('class-ctor').kind, 'class');
assert.strictEqual(pc.findPattern('nope'), null);

// ── コンストラクタ観点: 直した gpio は出ず、uart / can だけが出る ────────
var r1 = pc.run(DOCS, 'class-ctor');
assert.deepStrictEqual(r1.rows.map(function(x) { return x.name; }),
  ['uart_class.puml', 'can_class.puml'], '欠けているクラス図だけが出る');
assert.strictEqual(r1.okCount, 1, '満たしている図は 1 枚 (gpio)');
assert.strictEqual(r1.naCount, 4, 'クラス図でない 4 枚は対象外');
// 欠けている名前と、その宣言行が分かる (開く前に何を直すかが決まる)。
assert.deepStrictEqual(r1.rows[1].missing.map(function(m) { return m.text; }), ['CanDrv']);
assert.ok(r1.rows[0].missing[0].line >= 1, '飛び先の行番号を持つ');
assert.strictEqual(r1.rows[0].kindLabel, 'クラス図');

// ── 復帰遷移観点: dma だけが出る。終端 [*] への遷移は復帰と数えない ──────
var r2 = pc.run(DOCS, 'state-return');
assert.deepStrictEqual(r2.rows.map(function(x) { return x.name; }), ['dma_state.puml']);
assert.deepStrictEqual(r2.rows[0].missing.map(function(m) { return m.text; }), ['Error']);
assert.strictEqual(r2.okCount, 1, 'adc は Error --> Idle があるので満たしている');

// ── エラー応答観点: can_seq だけが出る ──────────────────────────────
var r3 = pc.run(DOCS, 'seq-error-reply');
assert.deepStrictEqual(r3.rows.map(function(x) { return x.name; }), ['can_seq.puml']);
assert.ok(/Can_NotifyFault/.test(r3.rows[0].missing[0].text));
assert.strictEqual(r3.okCount, 1);

// エラー語を含むメッセージが無いシーケンス図は「対象外」であって「満たしている」
// ではない。見ていないものを緑にすると棚卸しが嘘になる。
var noErr = [{ id: 'x', name: 'x_seq.puml', dsl: uml([
  'participant A', 'participant B', 'A -> B : Do()', 'B --> A : OK']) }];
assert.strictEqual(pc.checkDoc(noErr[0], 'seq-error-reply').status, 'na');

// ── 見出し ────────────────────────────────────────────────────
// 分母は「その観点を見られた図」。対象外の 4 枚を分母に入れると、
// 棚卸しの進み具合が実際より進んで見える。
assert.ok(/^3 図中 2 図で欠けています/.test(pc.summaryText(r1)), pc.summaryText(r1));
assert.ok(/対象外 4 図/.test(pc.summaryText(r1)));
assert.ok(/欠けている図はありません/.test(
  pc.summaryText(pc.run([DOCS[0]], 'class-ctor'))));
assert.ok(/当たる図がありません/.test(
  pc.summaryText(pc.run([DOCS[3]], 'class-ctor'))));
assert.ok(/観点を選ぶと/.test(pc.summaryText(pc.run(DOCS, 'nope'))));

// ── 指摘文からの観点サジェスト ────────────────────────────────────
assert.strictEqual(pc.suggest('GpioDrv クラスにコンストラクタが無い').id, 'class-ctor');
assert.strictEqual(pc.suggest('Error 状態からの復帰遷移が無い').id, 'state-return');
assert.strictEqual(pc.suggest('エラー応答が返っていない').id, 'seq-error-reply');
assert.strictEqual(pc.suggest('図が綺麗ではない'), null, '当たらなければ選ばない');
assert.strictEqual(pc.suggest(''), null);

console.log('blk-junior-0003-wish-pattern-check: OK');
