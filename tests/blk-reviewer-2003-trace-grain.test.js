'use strict';
// BLK-reviewer-20260907-2003: `npm run audit --summary` のトレースが 60 件中 41 件を
// 「どのシーケンスにも現れない」と出していた。中身は 9 系統中 8 系統で、その系統の
// シーケンス図が `*_init_sequence.puml`(初期化専用)しか無いため、状態遷移図が持つ
// 初期化後の遷移が構造的に全部 missing になっていたもの。family-audit が持っている
// 粒度差の除外が trace-coverage には無く、同じ根本原因を再度誤検出していた。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['../src/core/html-utils.js', '../src/core/dsl-utils.js', '../src/core/regex-parts.js',
 '../src/core/parser-utils.js', '../src/core/state-transition.js', '../src/core/scope-decl.js',
 '../src/core/family-audit.js', '../src/core/trace-coverage.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var tc = global.window.MA.traceCoverage;
var sd = global.window.MA.scopeDecl;

// 初期化専用シーケンスしか無い系統 (誤検出していた 8 系統の形)。
var ADC_STATE = [
  '@startuml',
  '[*] --> Idle',
  'Idle --> Configured : Adc_Init',
  'Configured --> Sampling : StartConv',
  'Sampling --> Configured : Complete',
  'Sampling --> Error : ConvError',
  'Error --> Idle : Adc_Reset',
  '@enduml',
].join('\n');

var ADC_INIT_SEQ = [
  '@startuml',
  'participant App',
  'participant Adc',
  'App -> Adc : Adc_Init',
  'Adc --> App : InitDone',
  '@enduml',
].join('\n');

// 本物の記述漏れがある系統 (dma)。転送シーケンスが状態遷移の大半を担当していて、
// Spi_Reset だけがどこにも現れない。
var DMA_STATE = [
  '@startuml',
  '[*] --> Idle',
  'Idle --> Transferring : StartTransfer',
  'Transferring --> Done : TransferComplete',
  'Transferring --> Error : TransferError',
  'Error --> Idle : Spi_Reset',
  '@enduml',
].join('\n');

var DMA_SEQ = [
  '@startuml',
  'Drv -> Dma : StartTransfer',
  'Dma --> Drv : TransferComplete',
  'Dma --> Drv : TransferError',
  '@enduml',
].join('\n');

function fam(stateDsl, seqDsl, base) {
  return tc.coverFamily([
    { id: 's1', name: base + '_state.puml', diagramType: 'plantuml-state', dsl: stateDsl },
    { id: 'q1', name: base + '_sequence.puml', diagramType: 'plantuml-sequence', dsl: seqDsl },
  ]);
}

describe('trace-coverage — 初期化専用シーケンスの粒度差 (BLK-reviewer-2003)', () => {
  test('初期化しか担当していないシーケンスとは突き合わせない', () => {
    var f = fam(ADC_STATE, ADC_INIT_SEQ, 'adc');
    // 5 件全部が「見ていない」に回り、missing は 0 件
    expect(f.missing.length).toBe(0);
    expect(f.rows.length).toBe(0);
    expect(f.outOfScope.length).toBe(5);
    expect(f.outOfScope.map(function(r) { return r.label; }))
      .toEqual(['Adc_Init', 'StartConv', 'Complete', 'ConvError', 'Adc_Reset']);
    expect(f.outOfScope.every(function(r) { return r.reason === 'grain'; })).toBe(true);
  });

  test('外した組は残る。何を見ていないかを黙らない', () => {
    var f = fam(ADC_STATE, ADC_INIT_SEQ, 'adc');
    expect(f.grainSkipped.length).toBe(1);
    expect(f.grainSkipped[0].state).toBe('adc_state.puml');
    expect(f.grainSkipped[0].seq).toBe('adc_sequence.puml');
    expect(f.grainSkipped[0].of).toBe(5);
    var line = tc.summaryLine(f);
    expect(line).toContain('粒度が違うため突き合わせていません');
    expect(line).toContain('5 件');
    expect(line).toContain('担当範囲を宣言');
  });

  test('本物の記述漏れは今までどおり出る (dma の Spi_Reset)', () => {
    var f = fam(DMA_STATE, DMA_SEQ, 'dma');
    expect(f.outOfScope.length).toBe(0);
    expect(f.rows.length).toBe(4);
    expect(f.missing.length).toBe(1);
    expect(f.missing[0].label).toBe('Spi_Reset');
    expect(tc.summaryLine(f)).toContain('1 件');
  });

  test('遷移が 1〜2 本の小さな図を粒度差と取り違えない', () => {
    // 語彙の集合一致率で見ると 0 になるが、遷移は 1 本とも部分一致で担当されている
    var f = tc.coverFamily([
      { name: 'spi_state.puml', dsl: '@startuml\n[*] --> Idle\nIdle --> Armed : ArmChannel\n@enduml' },
      { name: 'spi_seq.puml', dsl: '@startuml\nDrv -> Spi : ArmChannelFast\n@enduml' },
    ]);
    expect(f.outOfScope.length).toBe(0);
    expect(f.partial.length).toBe(1);
    expect(f.missing.length).toBe(0);
  });

  test('担当するシーケンスが 1 枚でもあれば、その系統は突き合わせる', () => {
    // 初期化専用と転送用が同居する系統。初期化専用の方だけを外し、
    // 転送用と突き合わせるので Spi_Reset の漏れは残る。
    var f = tc.coverFamily([
      { name: 'dma_state.puml', dsl: DMA_STATE },
      { name: 'dma_init_sequence.puml', dsl: '@startuml\nDrv -> Dma : Dma_Init\n@enduml' },
      { name: 'dma_transfer_sequence.puml', dsl: DMA_SEQ },
    ]);
    expect(f.rows.length).toBe(4);
    expect(f.missing.length).toBe(1);
    expect(f.missing[0].label).toBe('Spi_Reset');
    // 外した組は init 側の 1 組だけ
    expect(f.grainSkipped.map(function(x) { return x.seq; })).toEqual(['dma_init_sequence.puml']);
  });

  test('外した図のメッセージ名で「現れている」と言わない', () => {
    // 初期化専用シーケンスに StartConv があっても、その図が粒度差で外れていれば
    // 突き合わせには使わない。ここでは転送用が担当するので突き合わせは成立する。
    var f = tc.coverFamily([
      { name: 'dma_state.puml', dsl: DMA_STATE },
      { name: 'dma_init_sequence.puml', dsl: '@startuml\nDrv -> Dma : Spi_Reset\n@enduml' },
      { name: 'dma_transfer_sequence.puml', dsl: DMA_SEQ },
    ]);
    expect(f.missing.length).toBe(1);
    expect(f.missing[0].label).toBe('Spi_Reset');
  });

  test('宣言があれば宣言が勝つ (推測は使わない)', () => {
    var seq = sd.apply(ADC_INIT_SEQ, [{ from: 'Idle', to: 'Configured' }]);
    var f = fam(ADC_STATE, seq, 'adc');
    expect(f.declared).toBe(true);
    expect(f.grainSkipped.length).toBe(0);
    expect(f.rows.length).toBe(1);
    expect(f.missing.length).toBe(0);
    expect(f.outOfScope.every(function(r) { return r.reason === 'declared'; })).toBe(true);
  });

  test('シーケンス図が無い系統は今までどおり「突き合わせ不能」', () => {
    var f = tc.coverFamily([{ name: 'adc_state.puml', dsl: ADC_STATE }]);
    expect(f.comparable).toBe(false);
    expect(f.outOfScope.length).toBe(0);
    expect(f.rows[0].status).toBe('unknown');
    expect(tc.summaryLine(f)).toContain('シーケンス図が無い');
  });

  test('audit: 8 系統が初期化専用でも、漏れは本物の 1 件だけになる', () => {
    var docs = [];
    ['adc', 'can', 'gpio', 'irq', 'spi', 'timer', 'uart', 'plantuml'].forEach(function(k) {
      docs.push({ name: k + '_state.puml', dsl: ADC_STATE.replace(/Adc_/g, k + '_') });
      docs.push({ name: k + '_init_sequence.puml', dsl: ADC_INIT_SEQ.replace(/Adc_/g, k + '_') });
    });
    docs.push({ name: 'dma_state.puml', dsl: DMA_STATE });
    docs.push({ name: 'dma_transfer_sequence.puml', dsl: DMA_SEQ });
    var res = tc.audit(docs);
    expect(res.length).toBe(9);
    expect(tc.totalMissing(res)).toBe(1);
  });
});
