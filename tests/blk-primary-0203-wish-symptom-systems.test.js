'use strict';
// BLK-primary-20260909-0203-wish: 複数系統にまたがる不具合で、症状検索が
// 一部系統しか出さない。「SPI 初期化直後に DMA 転送が完了しないままタイムアウト。
// 割り込みは一度も発火していない」を貼ったとき、SPI の図だけでなく DMA・IRQ の
// 図も系統ごとに並ぶことをここで固定する。
const assert = require('assert');
if (!global.window) global.window = global;
try { delete require.cache[require.resolve('../src/core/impact-scan.js')]; } catch (e) {}
require('../src/core/impact-scan.js');
try { delete require.cache[require.resolve('../src/core/symptom-search.js')]; } catch (e) {}
require('../src/core/symptom-search.js');
try { delete require.cache[require.resolve('../src/core/symptom-systems.js')]; } catch (e) {}
require('../src/core/symptom-systems.js');
var sys = global.window.MA.symptomSystems;

// 現場の症状文そのまま (台本手順 4「不具合対応で過去の図を探す」)。
var SYMPTOM = 'SPI初期化直後にDMA転送が完了しないままタイムアウトする。割り込みは一度も発火していない模様';

var SPI_INIT = [
  '@startuml',
  'title Spi_Init_Sequence',
  'participant Spi_Driver',
  'participant Hw_Spi',
  'Spi_Driver -> Hw_Spi : Spi_Init',
  'Hw_Spi -> Spi_Driver : Ready',
  '@enduml',
].join('\n');

var DMA_STATE = [
  '@startuml',
  'title DMA_State',
  'state Idle',
  'state Transferring_Active',
  'Idle --> Transferring_Active : Spi_TransmitDma',
  'Transferring_Active --> Idle : TransferComplete',
  '@enduml',
].join('\n');

var DMA_SEQ = [
  '@startuml',
  'title DMA_Transfer_Sequence',
  'participant Dma_Ctrl',
  'participant Spi_Driver',
  'Spi_Driver -> Dma_Ctrl : Spi_TransmitDma',
  'Dma_Ctrl -> Spi_Driver : TransferComplete',
  '@enduml',
].join('\n');

var IRQ_STATE = [
  '@startuml',
  'title IRQ_State',
  'state Irq_Masked',
  'state Irq_Fired',
  'Irq_Masked --> Irq_Fired : Irq_Enable',
  '@enduml',
].join('\n');

var ADC_SEQ = [
  '@startuml',
  'title Adc_Init_Sequence',
  'participant Adc_Driver',
  'Adc_Driver -> Adc_Driver : Adc_Init',
  '@enduml',
].join('\n');

var DOCS = [
  { id: 'd1', name: 'spi_init_sequence.puml', dsl: SPI_INIT },
  { id: 'file:dma_state.puml', name: 'dma_state.puml', dsl: DMA_STATE, open: false },
  { id: 'file:dma_transfer_sequence.puml', name: 'dma_transfer_sequence.puml', dsl: DMA_SEQ, open: false },
  { id: 'd4', name: 'irq_state.puml', dsl: IRQ_STATE },
  { id: 'd5', name: 'adc_init_sequence.puml', dsl: ADC_SEQ },
];

function run(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { console.log('  FAIL - ' + name + ': ' + e.message); process.exitCode = 1; }
}

function sysTerms(g) { return g.systems.map(function(s) { return s.term; }); }
function docNames(row) { return row.docs.map(function(d) { return d.name; }); }
function find(g, term) {
  return g.systems.filter(function(s) { return s.term === term; })[0] || null;
}

console.log('BLK-primary-0203-wish symptom-systems');

run('症状に出てくる系統がすべて系統として立つ', function() {
  var g = sys.group(DOCS, SYMPTOM);
  var t = sysTerms(g);
  assert.ok(t.indexOf('SPI') >= 0, t.join(','));
  assert.ok(t.indexOf('DMA') >= 0, t.join(','));
  assert.ok(t.length >= 2, t.join(','));
});

// 図の側が英字 (Irq_*) でしか名乗っていない系統は、日本語の「割り込み」では
// 当たらない。当てられないこと自体は仕方がないが、当たらなかったことが
// 見出しに出れば「IRQ 側は未探索だ」と分かる。ここが無いと、SPI の図を見て
// 手詰まりで終わる。
run('図に当たらなかった系統の語が見出しに出る (未探索の系統に気付く)', function() {
  var g = sys.group(DOCS, SYMPTOM);
  assert.ok(g.missed.indexOf('割り込み') >= 0, g.missed.join(','));
  var h = sys.headline(g);
  assert.ok(h.indexOf('当たらなかった語') >= 0, h);
  assert.ok(h.indexOf('割り込み') >= 0, h);
});

run('図のノートに書かれた語でも当たる (日本語の事情はノートにしかない)', function() {
  var docs = [{
    id: 'n1', name: 'irq_init_sequence.puml',
    dsl: ['@startuml', 'title IRQ_Init_Sequence', 'participant IRQCtrl',
      'note over IRQCtrl : IRQ系統は割り込みベクタを直接握る',
      'IRQCtrl -> IRQCtrl : Irq_Init', '@enduml'].join('\n'),
  }];
  var g = sys.group(docs, '割り込みが発火しない');
  var all = g.systems.concat(g.actions).map(function(r) { return r.term; });
  assert.ok(all.indexOf('割り込み') >= 0, all.join(',') + ' / missed=' + g.missed.join(','));
});

run('DMA 系統の図が 2 枚とも並ぶ (関連度 1 位の 1 枚で終わらない)', function() {
  var dma = find(sys.group(DOCS, SYMPTOM), 'DMA');
  assert.ok(dma, 'DMA 系統が立っていない');
  var names = docNames(dma);
  assert.ok(names.indexOf('dma_state.puml') >= 0, names.join(','));
  assert.ok(names.indexOf('dma_transfer_sequence.puml') >= 0, names.join(','));
});

run('無関係な系統の図は入らない', function() {
  var g = sys.group(DOCS, SYMPTOM);
  g.systems.forEach(function(s) {
    assert.ok(docNames(s).indexOf('adc_init_sequence.puml') < 0, s.term + ' に ADC が混じった');
  });
});

run('系統の行から図の行へ運べる (図の名前・行番号・当たった名前)', function() {
  var dma = find(sys.group(DOCS, SYMPTOM), 'DMA');
  dma.docs.forEach(function(d) {
    assert.ok(d.name, '図の名前が無い');
    assert.ok(d.line >= 1, d.name + ' の行番号が無い');
    assert.ok(d.target, d.name + ' の当たった名前が無い');
    assert.strictEqual(d.term, 'DMA');
  });
});

run('開いていない図はそれと分かる (開いてから運ぶ必要がある)', function() {
  var dma = find(sys.group(DOCS, SYMPTOM), 'DMA');
  var closed = dma.docs.filter(function(d) { return d.open === false; });
  assert.strictEqual(closed.length, 2, '未開封の印が付いていない');
});

run('動作の語は系統にしない (転送・完了は系統ではない)', function() {
  var g = sys.group(DOCS, SYMPTOM);
  var acts = g.actions.map(function(a) { return a.term; });
  var t = sysTerms(g);
  assert.ok(t.indexOf('転送') < 0, '転送が系統になった');
  assert.ok(acts.indexOf('転送') >= 0 || g.missed.indexOf('転送') >= 0, acts.join(','));
});

run('当たらなかった語は missed に出る (語を足す手掛かり)', function() {
  var g = sys.group(DOCS, 'DMA転送のWatchdogリセット');
  assert.ok(g.missed.indexOf('Watchdog') >= 0, g.missed.join(','));
});

run('系統は入口の多い順に並ぶ', function() {
  var g = sys.group(DOCS, SYMPTOM);
  for (var i = 1; i < g.systems.length; i++) {
    assert.ok(g.systems[i - 1].docCount >= g.systems[i].docCount,
      sysTerms(g).join(','));
  }
});

run('見出しに系統の数と図の数が出る', function() {
  var g = sys.group(DOCS, SYMPTOM);
  var h = sys.headline(g);
  assert.ok(h.indexOf('系統') >= 0, h);
  assert.ok(/\d+ 図/.test(h), h);
});

run('1 系統しか当たらないときはそう言う (語を足す合図)', function() {
  var g = sys.group(DOCS, 'ADCの初期化が終わらない');
  assert.strictEqual(g.systems.length, 1, sysTerms(g).join(','));
  assert.ok(sys.headline(g).indexOf('1 系統だけ') >= 0, sys.headline(g));
});

run('症状文が空なら系統は立たない', function() {
  var g = sys.group(DOCS, '');
  assert.deepStrictEqual(g.systems, []);
  assert.deepStrictEqual(g.terms, []);
});

run('系統の 1 行に図種が並ぶ', function() {
  var dma = find(sys.group(DOCS, SYMPTOM), 'DMA');
  var label = sys.systemLabel(dma);
  assert.ok(label.indexOf('DMA') === 0, label);
  assert.ok(label.indexOf('2 図') >= 0, label);
  assert.ok(label.indexOf('状態遷移図') >= 0 && label.indexOf('シーケンス図') >= 0, label);
});
