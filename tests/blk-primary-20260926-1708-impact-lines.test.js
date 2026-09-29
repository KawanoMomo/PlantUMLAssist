'use strict';
// BLK-primary-20260926-1708-wish / -friction: ▤ 影響を見る の影響先 (直接・連鎖) の、その図で部品名に当たった行を
// 図を開かずに読む。連鎖で届いた図は元の部品名を持たないので、経由した部品名の行を読む (impactScan.linesFor)。
// 部品名が遷移ラベルや note にだけ出る図も「直接」の影響先に入れる (depGraph.withMentions)。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['../src/core/impact-scan.js', '../src/core/dep-graph.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var IS = global.window.MA.impactScan;
var DG = global.window.MA.depGraph;

function uml(lines) { return ['@startuml'].concat(lines, ['@enduml']).join('\n'); }

describe('impactScan.linesFor — 影響先 1 枚の当たり行', function() {
  var CLS = uml(['class Driver_Common', 'class Spi_Driver', 'Driver_Common <|-- Spi_Driver',
    'Spi_Driver ..> Dma_Ctrl', "note right of Spi_Driver : 転送は Dma_Ctrl 経由"]);

  test('行番号・本文・役割 (継承 / 依存 / ノート) を出し、同じ行は 1 度だけ', function() {
    var lines = IS.linesFor(CLS, ['Spi_Driver', 'Dma_Ctrl']);
    expect(lines.map(function(l) { return l.line; })).toEqual([3, 4, 5, 6]);
    expect(lines[1].label).toBe('継承');
    expect(lines[2].label).toBe('依存');
    expect(lines[2].names).toEqual(['Spi_Driver', 'Dma_Ctrl']);
    expect(lines[3].label).toBe('ノート');
  });

  test('語の途中 (Spi_Driver_Init の Spi_Driver) は数えない。名前が空なら空', function() {
    expect(IS.linesFor(uml(['A -> B : Spi_Driver_Init']), ['Spi_Driver'])).toEqual([]);
    expect(IS.linesFor(CLS, [])).toEqual([]);
  });
});

describe('depGraph.withMentions — ラベルにだけ名前が出る図も直接の影響先', function() {
  var SEQ = uml(['participant Irq_Controller', 'participant Cpu', 'Cpu -> Irq_Controller : Enable']);
  var ST = uml(['state Idle', 'state Busy', 'Idle --> Busy : Irq_Controller.Raise()']);
  var OTHER = uml(['state A', 'A --> B : Irq_Controller_Init']);
  var docs = [{ name: 'irq_seq', dsl: SEQ }, { name: 'irq_state', dsl: ST }, { name: 'other_state', dsl: OTHER }];

  test('矢印・宣言で辿れない irq_state を hop 0 で足し、語の途中だけの図は足さない', function() {
    var g = DG.build(docs);
    var base = DG.impactDocs(g, 'Irq_Controller', 2);
    expect(base.map(function(r) { return r.doc; })).not.toContain('irq_state');
    var all = DG.withMentions(base, docs, 'Irq_Controller');
    var st = all.filter(function(r) { return r.doc === 'irq_state'; })[0];
    expect(st.hop).toBe(0);
    expect(st.via).toEqual(['Irq_Controller']);
    expect(all.map(function(r) { return r.doc; })).not.toContain('other_state');
  });

  test('既にある図は重ねず、並びは段の浅い順・名前順', function() {
    var g = DG.build(docs);
    var all = DG.withMentions(DG.impactDocs(g, 'Irq_Controller', 2), docs, 'Irq_Controller');
    expect(all.filter(function(r) { return r.doc === 'irq_seq'; }).length).toBe(1);
    for (var i = 1; i < all.length; i++) expect(all[i - 1].hop <= all[i].hop).toBe(true);
  });
});
