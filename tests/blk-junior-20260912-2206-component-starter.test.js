'use strict';
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/dsl-utils.js', '../src/core/parser-utils.js',
  '../src/modules/component.js', '../src/core/sequence-participant-zone.js', '../src/modules/sequence.js', '../src/modules/state.js',
  '../src/core/component-deps.js', '../src/core/component-starter.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  try { require(p); } catch (e) { /* 依存が無い環境でも starter 単体は読める */ }
});
var CS = global.window.MA.componentStarter;

// この部品のシーケンス図 (実績の出所)。Timer_Driver が呼んでいる相手が 2 件。
var TIMER_SEQ = [
  '@startuml',
  'participant Timer_Driver',
  'participant Clock_Ctrl',
  'participant Det',
  'Timer_Driver -> Clock_Ctrl : 分周設定',
  'Timer_Driver -> Det : 引数異常',
  '@enduml',
].join('\n');

// 別部品の図。ここの相手は TIMER の下書きに入ってはいけない。
var SPI_COMPONENT = [
  '@startuml',
  'component Spi_Driver',
  'component Dma_Ctrl',
  'Spi_Driver ..> Dma_Ctrl : 転送',
  '@enduml',
].join('\n');

var DOCS = [
  { id: 'd1', name: 'timer_init_sequence', diagramType: 'plantuml-sequence', dsl: TIMER_SEQ },
  { id: 'd2', name: 'spi_component', diagramType: 'plantuml-component', dsl: SPI_COMPONENT },
];

describe('component-starter — 部品名 1 語でコンポーネント図の下書きを作る (BLK-junior-20260912-2206-wish)', () => {
  test('部品名は打ち方の揺れを吸収する', () => {
    expect(CS.normalizeSubject('TIMER')).toBe('TIMER');
    expect(CS.normalizeSubject(' TIMER ドライバ ')).toBe('TIMER');
    expect(CS.normalizeSubject('timer_drv.puml')).toBe('timer');
    expect(CS.normalizeSubject('   ')).toBe('');
  });

  test('本体と図の名前は部品名から決まる', () => {
    expect(CS.bodyName('TIMER')).toBe('TIMER_Driver');
    expect(CS.docName('TIMER')).toBe('timer_component');
    expect(CS.bodyName('')).toBe('');
    expect(CS.plan('  ', DOCS)).toBe(null);
    expect(CS.dsl('  ', DOCS)).toBe('');
  });

  test('図が 1 枚も無くても定石 6 件の下書きが出る', () => {
    var p = CS.plan('TIMER', []);
    expect(p.body).toBe('TIMER_Driver');
    expect(p.catalogCount).toBe(6);
    expect(p.usageCount).toBe(0);
    expect(p.rows.map((r) => r.name)).toContain('Power_Ctrl');
  });

  test('この部品のシーケンス図に出てくる相手が実績として先に並ぶ', () => {
    var p = CS.plan('TIMER', DOCS);
    expect(p.usageCount).toBe(2);
    // 実績が先頭。定石と同じ相手 (Clock_Ctrl / Det) は 1 行にまとまる。
    expect(p.rows.slice(0, 2).map((r) => r.name).sort()).toEqual(['Clock_Ctrl', 'Det']);
    expect(p.rows.slice(0, 2).every((r) => r.source === 'usage')).toBe(true);
    // 同じ相手が実績と定石で 2 行に割れない。
    expect(p.rows.filter((r) => r.name === 'Clock_Ctrl').length).toBe(1);
    expect(p.rows.length).toBe(6);
  });

  test('別部品の図の依存先は下書きに入れない', () => {
    var p = CS.plan('TIMER', DOCS);
    expect(p.rows.map((r) => r.name)).not.toContain('Dma_Ctrl');
    expect(p.rows.every((r) => r.source !== 'peer')).toBe(true);
  });

  test('DSL は本体の宣言が先、依存の矢印が後', () => {
    var t = CS.dsl('TIMER', DOCS);
    var lines = t.split('\n');
    expect(lines[0]).toBe('@startuml');
    expect(lines[1]).toBe('title TIMER ドライバ コンポーネント図');
    expect(lines[2]).toBe('component TIMER_Driver');
    expect(lines[lines.length - 1]).toBe('@enduml');
    expect(t).toContain('component Clock_Ctrl');
    expect(t).toContain('TIMER_Driver ..> Clock_Ctrl : クロック制御');
    // 宣言は全部、最初の矢印より前に出る。
    expect(t.lastIndexOf('component ')).toBeLessThan(t.indexOf('..>'));
  });

  test('作った下書きは、そのまま依存チェックが「全部ある」と言う形', () => {
    var CD = global.window.MA.componentDeps;
    var res = CD.check(CS.dsl('TIMER', DOCS), [], null, 'TIMER_Driver');
    expect(res.catalogMissing).toBe(0);
  });

  test('同じ部品のコンポーネント図が既にあるかを言える', () => {
    expect(CS.existingDocs('TIMER', DOCS).length).toBe(0);
    expect(CS.existingDocs('SPI', DOCS).map((d) => d.name)).toEqual(['spi_component']);
    expect(CS.existingDocs('', DOCS).length).toBe(0);
  });

  test('見出しは何件入るかを言う', () => {
    expect(CS.summary(null)).toBe('部品名を入れてください');
    expect(CS.summary(CS.plan('TIMER', DOCS)))
      .toBe('TIMER_Driver と依存 6 本 (この部品の図に出てくる相手 2 件 / 定石 4 件) の下書きを作ります');
  });
});
