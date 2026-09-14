'use strict';
// BLK-primary-20260909-0403-wish 「引き継ぎの対象に未確定のファイルが混ざる」。
//
// 願望: 📦引き継ぎ の対象一覧に `spi_init_sequence-編集中` のようなスクラッチが
// 正式な図と同格の行で並び、渡された新人はどちらを読めばいいか分からない。
// 名前の規則から「未確定」を見分け、印を出し、既定で対象から外す。
//
// ここでは判定の純関数を検証する (パネルの結線は app.js、E2E は blk-primary-1303-wish-handoff)。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;

var depPaths = ['../src/core/export-target.js'];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var ET = global.window.MA.exportTarget;

function folderDocs() {
  return [
    { name: 'spi_init_sequence', dsl: '@startuml\n@enduml' },
    { name: 'spi_init_sequence-編集中', dsl: '@startuml\n@enduml' },
    { name: 'dma_state', dsl: '@startuml\n@enduml' },
    { name: 'dma_state-作業中2', dsl: '@startuml\n@enduml' },
  ];
}

describe('export-target — 未確定 (スクラッチ) の同梱防止 (BLK-primary-20260909-0403-wish)', function() {

  test('スクラッチ命名規則を末尾でだけ見分ける', function() {
    expect(ET.isScratchName('spi_init_sequence-編集中')).toBe(true);
    expect(ET.isScratchName('dma_state-作業中2')).toBe(true);
    expect(ET.isScratchName('gpio_seq_wip')).toBe(true);
    expect(ET.isScratchName('adc_state のコピー')).toBe(true);
    expect(ET.isScratchName('spi_init_sequence')).toBe(false);
    // 本名の途中にある語は拾わない (正式な図を落とさない)。
    expect(ET.isScratchName('編集中画面_state')).toBe(false);
    expect(ET.isScratchName('temp_sensor_sequence')).toBe(false);
  });

  test('フォルダ全体でも未確定は既定で対象から外れ、外した旨が 1 行に出る', function() {
    var m = ET.model({
      openDocs: [], folderDocs: folderDocs(), folderAvailable: true,
    });
    expect(m.mode).toBe(ET.MODE_FOLDER);
    expect(m.count).toBe(2);
    expect(m.scratch).toBe(2);
    expect(m.includeScratch).toBe(false);
    expect(m.warn).toBe(true);
    expect(m.line).toContain('未確定 2 枚は対象から外しました');
    expect(m.line).toContain('spi_init_sequence-編集中');
    expect(m.targets.map(function(d) { return d.name; }))
      .toEqual(['spi_init_sequence', 'dma_state']);
  });

  test('タブで開いていても未確定は既定で入らない (うっかり開いた事故を防ぐ)', function() {
    var m = ET.model({
      openDocs: [
        { id: 'd1', name: 'spi_init_sequence-編集中', dsl: '@startuml\n@enduml' },
        { id: 'd2', name: 'spi_init_sequence', dsl: '@startuml\n@enduml' },
      ],
      folderDocs: [], folderAvailable: false, mode: ET.MODE_OPEN,
    });
    expect(m.count).toBe(1);
    expect(m.targets[0].name).toBe('spi_init_sequence');
    expect(m.scratch).toBe(1);
  });

  test('意図して入れたときは同梱され、入れている旨に変わる', function() {
    var m = ET.model({
      openDocs: [], folderDocs: folderDocs(), folderAvailable: true, includeScratch: true,
    });
    expect(m.count).toBe(4);
    expect(m.includeScratch).toBe(true);
    expect(m.warn).toBe(true);
    expect(m.line).toContain('未確定 2 枚を入れています');
  });

  test('一覧の行には未確定の印が付く (正式版と同格に見せない)', function() {
    var m = ET.model({ openDocs: [], folderDocs: folderDocs(), folderAvailable: true });
    var row = m.all.filter(function(d) { return d.name === 'spi_init_sequence-編集中'; })[0];
    expect(row.scratch).toBe(true);
    expect(m.all.filter(function(d) { return d.name === 'dma_state'; })[0].scratch).toBe(false);
  });

  test('書き出し後の 1 行にも、外した／入れたが残る', function() {
    var off = ET.model({ openDocs: [], folderDocs: folderDocs(), folderAvailable: true });
    expect(ET.resultLine(off)).toContain('未確定 2 枚を除外');
    var on = ET.model({
      openDocs: [], folderDocs: folderDocs(), folderAvailable: true, includeScratch: true,
    });
    expect(ET.resultLine(on)).toContain('未確定 2 枚を同梱');
  });

  test('未確定が無ければ 1 行も警告も出ない (偽の警告を出さない)', function() {
    var m = ET.model({
      openDocs: [], folderAvailable: true,
      folderDocs: [{ name: 'spi_init_sequence', dsl: '@startuml\n@enduml' }],
    });
    expect(m.scratch).toBe(0);
    expect(m.scratchLine).toBe('');
    expect(m.warn).toBe(false);
  });
});

// 走り終えたら差し替えた global を戻す (他のテストの window を汚さない)。
global.window = prevWindow;
global.document = prevDocument;
