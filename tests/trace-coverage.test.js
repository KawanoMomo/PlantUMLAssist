'use strict';
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['../src/core/html-utils.js', '../src/core/dsl-utils.js', '../src/core/regex-parts.js',
 '../src/core/parser-utils.js', '../src/core/state-transition.js',
 '../src/core/family-audit.js', '../src/core/trace-coverage.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var tc = global.window.MA.traceCoverage;

// BLK-reviewer-20260907-1903-wish の実例。dma_state の `Error --> Idle : Spi_Reset`
// だけが dma_transfer_sequence のどのメッセージにも現れない。
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
  'participant Drv',
  'participant Dma',
  "note over Drv : StartTransfer の前に Spi_Reset は呼ばない",
  'Drv -> Dma : StartTransfer',
  'Dma --> Drv : TransferComplete',
  'Dma --> Drv : TransferError',
  '@enduml',
].join('\n');

describe('trace-coverage', () => {
  test('transitionsOf: ラベル付きの遷移だけを行番号つきで拾う', () => {
    var rows = tc.transitionsOf(DMA_STATE);
    expect(rows.length).toBe(4);
    expect(rows[0].from).toBe('Idle');
    expect(rows[0].to).toBe('Transferring');
    expect(rows[0].label).toBe('StartTransfer');
    expect(rows[0].line).toBe(3);
    expect(rows[3].label).toBe('Spi_Reset');
  });

  test('transitionsOf: ラベル無しの遷移とタイトル行は拾わない', () => {
    var rows = tc.transitionsOf('@startuml\ntitle A --> B : x\n[*] --> Idle\nIdle --> Done\n@enduml');
    expect(rows.length).toBe(0);
  });

  test('labelKeys: trigger と action を別々の候補にし、ガードは候補にしない', () => {
    var keys = tc.labelKeys('StartTransfer [ready] / arm_channel');
    expect(keys.indexOf('starttransfer') >= 0).toBe(true);
    expect(keys.indexOf('armchannel') >= 0).toBe(true);
    expect(keys.indexOf('ready') >= 0).toBe(false);
  });

  test('coverFamily: どのシーケンスにも現れない遷移だけを missing にする', () => {
    var f = tc.coverFamily([
      { id: 's', name: 'dma_state.puml', dsl: DMA_STATE },
      { id: 'q', name: 'dma_transfer_sequence.puml', dsl: DMA_SEQ },
    ]);
    expect(f.comparable).toBe(true);
    expect(f.rows.length).toBe(4);
    expect(f.missing.length).toBe(1);
    expect(f.missing[0].label).toBe('Spi_Reset');
    expect(f.missing[0].docName).toBe('dma_state.puml');
    expect(f.rows[0].status).toBe('covered');
    expect(f.rows[0].seenIn).toEqual(['dma_transfer_sequence.puml']);
  });

  test('coverFamily: note の中の名前はメッセージとして数えない', () => {
    // Spi_Reset は note に書かれているだけ。矢印のラベルではないので漏れのまま。
    var f = tc.coverFamily([
      { name: 'dma_state.puml', dsl: DMA_STATE },
      { name: 'dma_transfer_sequence.puml', dsl: DMA_SEQ },
    ]);
    expect(f.missing.length).toBe(1);
  });

  test('coverFamily: 綴りの違い (Configure Channel / configure_channel) は現れている扱い', () => {
    var f = tc.coverFamily([
      { name: 'adc_state.puml', dsl: '@startuml\n[*] --> Idle\nIdle --> Configured : configure_channel\n@enduml' },
      { name: 'adc_init_sequence.puml', dsl: '@startuml\nDrv -> Adc : 1. Configure Channel()\n@enduml' },
    ]);
    expect(f.missing.length).toBe(0);
    expect(f.rows[0].status).toBe('covered');
  });

  test('coverFamily: シーケンス図が無い系統は comparable=false で漏れ 0 と言わない', () => {
    var f = tc.coverFamily([{ name: 'dma_state.puml', dsl: DMA_STATE }]);
    expect(f.comparable).toBe(false);
    expect(f.missing.length).toBe(0);
    expect(f.rows[0].status).toBe('unknown');
    expect(tc.summaryLine(f)).toContain('シーケンス図が無い');
  });

  test('coverFamily: 部分一致は missing にせず partial として分ける', () => {
    var f = tc.coverFamily([
      { name: 'spi_state.puml', dsl: '@startuml\n[*] --> Idle\nIdle --> Armed : ArmChannel\n@enduml' },
      { name: 'spi_seq.puml', dsl: '@startuml\nDrv -> Spi : ArmChannelFast\n@enduml' },
    ]);
    expect(f.missing.length).toBe(0);
    expect(f.partial.length).toBe(1);
    expect(tc.summaryLine(f)).toContain('部分一致 1 件');
  });

  test('audit: 状態遷移図を持つ系統だけを系統キーごとに返す', () => {
    var res = tc.audit([
      { name: 'dma_state.puml', dsl: DMA_STATE },
      { name: 'dma_transfer_sequence.puml', dsl: DMA_SEQ },
      { name: 'adc_init_sequence.puml', dsl: '@startuml\nDrv -> Adc : EnableClock\n@enduml' },
      { name: 'notes.puml', dsl: '' },
    ]);
    expect(res.map(function(r) { return r.key; })).toEqual(['dma']);
    expect(tc.totalMissing(res)).toBe(1);
  });

  test('audit: フォルダ名は系統キーにしない', () => {
    var res = tc.audit([
      { name: 'reviewer/dma_state.puml', dsl: DMA_STATE },
      { name: 'reviewer/dma_transfer_sequence.puml', dsl: DMA_SEQ },
    ]);
    expect(res.length).toBe(1);
    expect(res[0].key).toBe('dma');
    expect(res[0].missing.length).toBe(1);
  });

  test('summaryLine: 漏れ 0 件は言い切る', () => {
    var f = tc.coverFamily([
      { name: 'adc_state.puml', dsl: '@startuml\n[*] --> Idle\nIdle --> On : EnableClock\n@enduml' },
      { name: 'adc_seq.puml', dsl: '@startuml\nDrv -> Adc : EnableClock\n@enduml' },
    ]);
    expect(tc.summaryLine(f)).toBe('遷移 1 件はすべてシーケンスに現れています (漏れ 0 件)');
  });
});
