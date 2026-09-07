'use strict';
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
try { delete require.cache[require.resolve('../src/core/family-audit.js')]; } catch (e) {}
require('../src/core/family-audit.js');
var fa = global.window.MA.familyAudit;

var ADC_SEQ = [
  '@startuml',
  'title ADC init',
  'participant Drv',
  'participant Adc',
  'Drv -> Adc : ConfigureChannel',
  'Drv -> Adc : EnableIrq',
  'Adc --> Drv : IrqAck',
  '@enduml',
].join('\n');

var ADC_STATE = [
  '@startuml',
  '[*] --> Idle',
  'Idle --> Configured : configure_channel',
  'Configured --> Armed : enable_irq',
  'Armed --> Idle : irq_ack',
  '@enduml',
].join('\n');

var DMA_SEQ = [
  '@startuml',
  'Drv -> Dma : ConfigureChannel',
  'Drv -> Dma : SetSrcDst',
  'Drv -> Dma : EnableDmaReq',
  'Drv -> Dma : ArmChannel',
  '@enduml',
].join('\n');

var DMA_STATE = [
  '@startuml',
  'Configured --> Transferring_Active : arm channel',
  '@enduml',
].join('\n');

describe('family-audit — 系統をまたいだ動作名の突合', () => {
  test('normalizeAction: 綴り・区切り・手番号・引数の違いを吸収する', () => {
    expect(fa.normalizeAction('ConfigureChannel')).toBe('configurechannel');
    expect(fa.normalizeAction('configure_channel')).toBe('configurechannel');
    expect(fa.normalizeAction('3. Configure Channel')).toBe('configurechannel');
    expect(fa.normalizeAction('ConfigureChannel(ch, mode)')).toBe('configurechannel');
    expect(fa.normalizeAction('<<async>> ConfigureChannel')).toBe('configurechannel');
    expect(fa.normalizeAction('[ok] ConfigureChannel')).toBe('configurechannel');
    expect(fa.normalizeAction('')).toBe('');
    expect(fa.normalizeAction(null)).toBe('');
  });

  test('familyKeyOf: 図の名前の頭 1 語を系統キーにする', () => {
    expect(fa.familyKeyOf('Adc_Init_Sequence')).toBe('adc');
    expect(fa.familyKeyOf('adc-state')).toBe('adc');
    expect(fa.familyKeyOf('AdcClass')).toBe('adc');
    expect(fa.familyKeyOf('dma seq.puml')).toBe('dma');
    expect(fa.familyKeyOf('UART')).toBe('uart');
    expect(fa.familyKeyOf('')).toBe('');
  });

  test('actionsOf: 矢印ラベルを順序どおりに拾い、骨組み行は数えない', () => {
    expect(fa.actionsOf(ADC_SEQ).map(function(a) { return a.label; }))
      .toEqual(['ConfigureChannel', 'EnableIrq', 'IrqAck']);
    expect(fa.actionsOf(ADC_STATE).map(function(a) { return a.label; }))
      .toEqual(['configure_channel', 'enable_irq', 'irq_ack']);
  });

  test('actionsOf: ラベルの無い矢印と同名の重複は数えない', () => {
    var dsl = '@startuml\nA -> B\nA -> B : Go\nA -> B : go\n@enduml';
    expect(fa.actionsOf(dsl).length).toBe(1);
    expect(fa.actionsOf('').length).toBe(0);
  });

  test('groupFamilies: 2 枚以上ある系統だけを束ねる', () => {
    var g = fa.groupFamilies([
      { name: 'Adc_Seq', dsl: '' },
      { name: 'Adc_State', dsl: '' },
      { name: 'Uart_Seq', dsl: '' },
    ]);
    expect(g.length).toBe(1);
    expect(g[0].key).toBe('adc');
    expect(g[0].docs.length).toBe(2);
  });

  test('compareFamily: 綴りが違っても揃っていれば食い違い 0 件', () => {
    var r = fa.compareFamily([
      { name: 'Adc_Seq', diagramType: 'plantuml-sequence', dsl: ADC_SEQ },
      { name: 'Adc_State', diagramType: 'plantuml-state', dsl: ADC_STATE },
    ]);
    expect(r.comparable).toBe(true);
    expect(r.rows.length).toBe(3);
    expect(r.mismatches.length).toBe(0);
    expect(r.rows[0].present).toEqual([true, true]);
  });

  // BLK-reviewer-20260907-1803: この組は「手順のシーケンス (4 ステップ)」と
  // 「状態遷移 (1 本)」で、意図して粒度が違う。以前はここで
  // ConfigureChannel / SetSrcDst / EnableDmaReq の 3 件を食い違いとして出しており、
  // 実際の監査ではこの形の過検出が指摘の大半を占めていた。図種が違い語彙も
  // ほとんど重ならない組は突き合わせず、外したことを skipped で言う。
  test('compareFamily: 図種が違い語彙も重ならない組は突き合わせない (DMA の実例)', () => {
    var r = fa.compareFamily([
      { name: 'Dma_Seq', diagramType: 'plantuml-sequence', dsl: DMA_SEQ },
      { name: 'Dma_State', diagramType: 'plantuml-state', dsl: DMA_STATE },
    ]);
    expect(r.mismatches).toEqual([]);
    expect(r.comparable).toBe(false);
    expect(r.skipped.length).toBe(1);
    expect(r.skipped[0].reason).toContain('粒度が違う');
    // 行そのものは残る (表は見られる)。判定だけを止めている。
    var arm = r.rows.filter(function(x) { return x.key === 'armchannel'; })[0];
    expect(arm.count).toBe(2);
    expect(arm.onlyIn).toBe(null);
  });

  test('compareFamily: 図種が違っても語彙がほぼ一致していれば突き合わせる', () => {
    // 状態遷移側も同じ手順名で書かれている = 同じ粒度で書き分けている。
    var stateSameWords = [
      '@startuml',
      'Idle --> Configured : ConfigureChannel',
      'Configured --> Armed : SetSrcDst',
      'Armed --> Active : EnableDmaReq',
      '@enduml',
    ].join('\n');
    var r = fa.compareFamily([
      { name: 'Dma_Seq', diagramType: 'plantuml-sequence', dsl: DMA_SEQ },
      { name: 'Dma_State', diagramType: 'plantuml-state', dsl: stateSameWords },
    ]);
    expect(r.comparable).toBe(true);
    expect(r.skipped).toEqual([]);
    // 手順側にしか無い ArmChannel だけが食い違いとして残る。
    expect(r.mismatches.map(function(m) { return m.label; })).toEqual(['ArmChannel']);
    expect(r.mismatches[0].onlyIn).toBe('Dma_Seq');
  });

  test('compareFamily: 同じ図種どうしは 1 語共有していれば突き合わせる', () => {
    // 状態遷移の写しに 1 本足りない = 書き漏らし。粒度違いで黙ってはいけない。
    var stateA = '@startuml\nIdle --> Run : Start\nRun --> Idle : Stop\n@enduml';
    var stateB = '@startuml\nIdle --> Run : Start\n@enduml';
    var r = fa.compareFamily([
      { name: 'Gpio_State', diagramType: 'plantuml-state', dsl: stateA },
      { name: 'Gpio_State_copy', diagramType: 'plantuml-state', dsl: stateB },
    ]);
    expect(r.comparable).toBe(true);
    expect(r.skipped).toEqual([]);
    expect(r.mismatches.map(function(m) { return m.label; })).toEqual(['Stop']);
    expect(r.mismatches[0].onlyIn).toBe('Gpio_State');
  });

  test('familyKeyOf: フォルダ名は系統に含めない', () => {
    // BLK-reviewer-20260907-1803: `primary/adc_state.puml` の頭の 1 語が
    // 'primary' になり、そのフォルダの図が全部 1 系統に落ちていた。
    expect(fa.familyKeyOf('primary/adc_state.puml')).toBe('adc');
    expect(fa.familyKeyOf('primary\\uart_init_sequence.puml')).toBe('uart');
    expect(fa.familyKeyOf('a/b/c/Adc_Init.puml')).toBe('adc');
    expect(fa.familyKeyOf('adc_state.puml')).toBe('adc');
  });

  test('groupFamilies: フォルダが同じでも系統は分かれる', () => {
    var groups = fa.groupFamilies([
      { name: 'primary/adc_init_sequence.puml', dsl: ADC_SEQ },
      { name: 'primary/adc_state.puml', dsl: ADC_STATE },
      { name: 'primary/dma_transfer_sequence.puml', dsl: DMA_SEQ },
      { name: 'primary/dma_state.puml', dsl: DMA_STATE },
    ]);
    expect(groups.map(function(g) { return g.key; })).toEqual(['adc', 'dma']);
    groups.forEach(function(g) { expect(g.docs.length).toBe(2); });
  });

  test('summaryLine: 全部外したときは「揃っている」と言わない', () => {
    var r = fa.compareFamily([
      { name: 'Dma_Seq', diagramType: 'plantuml-sequence', dsl: DMA_SEQ },
      { name: 'Dma_State', diagramType: 'plantuml-state', dsl: DMA_STATE },
    ]);
    var line = fa.summaryLine(r);
    expect(line).toContain('粒度が違うため突き合わせていません');
    expect(line).not.toContain('揃っています');
  });

  test('compareFamily: 図へ飛ぶための id を持ち回る', () => {
    var r = fa.compareFamily([
      { id: 'd1', name: 'Adc_Seq', dsl: ADC_SEQ },
      { id: 'd2', name: 'Adc_State', dsl: ADC_STATE },
    ]);
    expect(r.docs.map(function(d) { return d.id; })).toEqual(['d1', 'd2']);
  });

  test('compareFamily: 動作名を持つ図が 1 枚しか無ければ突合は成立しない', () => {
    var r = fa.compareFamily([
      { name: 'Adc_Seq', dsl: ADC_SEQ },
      { name: 'Adc_Class', dsl: '@startuml\nclass Adc\n@enduml' },
    ]);
    expect(r.comparable).toBe(false);
  });

  test('audit: 系統ごとの結果を返し、キーを持つ', () => {
    var res = fa.audit([
      { name: 'Adc_Seq', dsl: ADC_SEQ },
      { name: 'Adc_State', dsl: ADC_STATE },
      { name: 'Dma_Seq', dsl: DMA_SEQ },
      { name: 'Dma_State', dsl: DMA_STATE },
      { name: 'Scratch', dsl: '' },
    ]);
    expect(res.map(function(r) { return r.key; })).toEqual(['adc', 'dma']);
    expect(res[0].mismatches.length).toBe(0);
    expect(res[1].mismatches.length).toBe(3);
  });

  test('summaryLine: 0 件は「揃っています」と言い切る', () => {
    var ok = fa.compareFamily([
      { name: 'Adc_Seq', dsl: ADC_SEQ },
      { name: 'Adc_State', dsl: ADC_STATE },
    ]);
    expect(fa.summaryLine(ok)).toContain('揃っています');
    var ng = fa.compareFamily([
      { name: 'Dma_Seq', dsl: DMA_SEQ },
      { name: 'Dma_State', dsl: DMA_STATE },
    ]);
    expect(fa.summaryLine(ng)).toBe('片方にしか無い動作名 3 件');
    var few = fa.compareFamily([
      { name: 'Adc_Seq', dsl: ADC_SEQ },
      { name: 'Adc_Class', dsl: '@startuml\nclass Adc\n@enduml' },
    ]);
    expect(fa.summaryLine(few)).toContain('揃っていません');
  });
});
