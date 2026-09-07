'use strict';
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var window = global.window;
try { delete require.cache[require.resolve('../src/core/family-audit.js')]; } catch (e) {}
try { delete require.cache[require.resolve('../src/core/driver-map.js')]; } catch (e) {}
require('../src/core/family-audit.js');
require('../src/core/driver-map.js');

var DM = window.MA.driverMap;

function doc(name, type, dsl) {
  return { id: name, name: name, diagramType: type, dsl: dsl || '' };
}

var SPI_SEQ = doc('spi_init_sequence', 'plantuml-sequence', [
  '@startuml',
  'participant Drv',
  'participant Spi',
  'Drv -> Spi : Configure Channel',
  'Drv -> Spi : Enable Clock',
  '@enduml',
].join('\n'));

var SPI_STATE = doc('spi_state', 'plantuml-state', [
  '@startuml',
  '[*] -> Idle',
  'Idle -> Ready : configure_channel',
  'Ready -> Running : enable_clock',
  '@enduml',
].join('\n'));

// enable_clock がこちらには無い = 対応が崩れている状態遷移図
var SPI_STATE_BROKEN = doc('spi_state', 'plantuml-state', [
  '@startuml',
  '[*] -> Idle',
  'Idle -> Ready : configure_channel',
  'Ready -> Halted : shutdown',
  '@enduml',
].join('\n'));

var DMA_SEQ = doc('dma_transfer_sequence', 'plantuml-sequence', [
  '@startuml',
  'A -> B : Start Transfer',
  '@enduml',
].join('\n'));

var DMA_STATE = doc('dma_state', 'plantuml-state', [
  '@startuml',
  'Idle -> Busy : start_transfer',
  '@enduml',
].join('\n'));

describe('driverMap.stemOf — 図の名前から系統名を取り出す', function() {
  test('役どころの語を落とした先頭のトークンが系統名', function() {
    expect(DM.stemOf('spi_init_sequence')).toBe('spi');
    expect(DM.stemOf('dma_transfer_sequence')).toBe('dma');
    expect(DM.stemOf('spi_state')).toBe('spi');
  });
  test('大小と区切りは問わない', function() {
    expect(DM.stemOf('SPI-State')).toBe('spi');
    expect(DM.stemOf('SPI Class Diagram')).toBe('spi');
  });
  test('拡張子は落とす', function() {
    expect(DM.stemOf('spi_state.puml')).toBe('spi');
  });
  test('役どころの語しか無ければ空', function() {
    expect(DM.stemOf('sequence')).toBe('');
    expect(DM.stemOf('')).toBe('');
  });
});

describe('driverMap.roleOf — 図の役どころ', function() {
  test('diagramType があればそれを使う', function() {
    expect(DM.roleOf(SPI_SEQ)).toBe('sequence');
    expect(DM.roleOf(SPI_STATE)).toBe('state');
  });
  test('diagramType が無ければ名前の語から拾う', function() {
    expect(DM.roleOf({ name: 'spi_state' })).toBe('state');
    expect(DM.roleOf({ name: 'spi_class_diagram' })).toBe('class');
  });
  test('手掛かりが無ければ空', function() {
    expect(DM.roleOf({ name: 'spi' })).toBe('');
    expect(DM.roleOf(null)).toBe('');
  });
});

describe('driverMap.suggest — 開いている図から宣言の下書きを作る', function() {
  var docs = [SPI_SEQ, SPI_STATE, DMA_SEQ, DMA_STATE, doc('lonely_usecase', 'plantuml-usecase')];

  test('系統名を共有する 2 枚以上を 1 系統にする', function() {
    var d = DM.suggest(docs);
    expect(d.families.length).toBe(2);
    expect(d.families[0].key).toBe('spi');
    expect(d.families[0].members).toEqual(['spi_init_sequence', 'spi_state']);
    expect(d.families[1].members).toEqual(['dma_transfer_sequence', 'dma_state']);
  });

  test('1 枚しかない系統は対応関係を持たないので出さない', function() {
    var names = DM.suggest(docs).families.map(function(f) { return f.key; });
    expect(names.indexOf('lonely')).toBe(-1);
  });

  test('前の宣言で付け直した系統名は作り直しても残る', function() {
    var prev = { families: [{ key: 'spi', label: 'SPI ドライバ', members: ['spi_state'] }] };
    expect(DM.suggest(docs, prev).families[0].label).toBe('SPI ドライバ');
  });
});

describe('driverMap.normalize / parse / serialize — 宣言の持ち回り', function() {
  test('壊れた入力でも空の宣言になる (画面が開けなくならない)', function() {
    expect(DM.normalize(null).families).toEqual([]);
    expect(DM.parse('{{{').families).toEqual([]);
    expect(DM.parse('').families).toEqual([]);
  });
  test('相手のいない系統は落とす', function() {
    expect(DM.normalize({ families: [{ key: 'x', members: [] }] }).families).toEqual([]);
  });
  test('同じ図を 2 回書いても 1 枚として扱う', function() {
    var d = DM.normalize({ families: [{ key: 'spi', members: ['a', 'a', 'b'] }] });
    expect(d.families[0].members).toEqual(['a', 'b']);
  });
  test('serialize して parse すると同じ宣言に戻る', function() {
    var d = DM.suggest([SPI_SEQ, SPI_STATE]);
    expect(DM.parse(DM.serialize(d))).toEqual(d);
  });
  test('label が無ければ系統名の大文字を使う', function() {
    expect(DM.normalize({ families: [{ key: 'spi', members: ['a', 'b'] }] }).families[0].label).toBe('SPI');
  });
});

describe('driverMap.partnersOf — 1 枚を開いたときに並べる相手', function() {
  var decl = DM.suggest([SPI_SEQ, SPI_STATE, DMA_SEQ, DMA_STATE]);
  test('同じ系統の他の図を返す', function() {
    expect(DM.partnersOf(decl, 'spi_init_sequence')).toEqual(['spi_state']);
    expect(DM.partnersOf(decl, 'spi_state')).toEqual(['spi_init_sequence']);
  });
  test('宣言に無い図には相手がいない', function() {
    expect(DM.partnersOf(decl, 'unknown')).toEqual([]);
  });
  test('familyOf はその図の系統を返す', function() {
    expect(DM.familyOf(decl, 'dma_state').key).toBe('dma');
    expect(DM.familyOf(decl, 'unknown')).toBe(null);
  });
});

describe('driverMap.check — 宣言された対応が崩れていないか', function() {
  var decl = DM.suggest([SPI_SEQ, SPI_STATE, DMA_SEQ, DMA_STATE]);

  test('宣言どおりに揃っていれば ok', function() {
    var r = DM.check(decl, [SPI_SEQ, SPI_STATE, DMA_SEQ, DMA_STATE]);
    expect(r.red).toBe(0);
    expect(r.families[0].status).toBe('ok');
  });

  test('宣言された図が開かれていなければ赤にし、名前を出す', function() {
    var r = DM.check(decl, [SPI_SEQ, DMA_SEQ, DMA_STATE]);
    expect(r.families[0].status).toBe('red');
    expect(r.families[0].missing).toEqual(['spi_state']);
    expect(r.families[0].reasons[0]).toContain('開かれていません');
  });

  test('片方にしか無い動作名を赤にし、どの図に無いかを言う', function() {
    var r = DM.check(decl, [SPI_SEQ, SPI_STATE_BROKEN, DMA_SEQ, DMA_STATE]);
    var spi = r.families[0];
    expect(spi.status).toBe('red');
    var labels = spi.mismatch.map(function(m) { return m.label; }).sort();
    expect(labels).toEqual(['Enable Clock', 'shutdown']);
    var enable = spi.mismatch.filter(function(m) { return m.label === 'Enable Clock'; })[0];
    expect(enable.onlyIn).toBe('spi_init_sequence');
    expect(enable.missingIn).toEqual(['spi_state']);
    expect(enable.line).toBe(5);
  });

  test('宣言した組は「粒度が違う」で外さない (系統チェックが黙って落とす組を拾う)', function() {
    // 語彙がまったく重ならない 2 枚。familyAudit の突合対象からは外れる。
    var a = doc('adc_init_sequence', 'plantuml-sequence', '@startuml\nA -> B : Foo\n@enduml');
    var b = doc('adc_state', 'plantuml-state', '@startuml\nX -> Y : bar\n@enduml');
    expect(window.MA.familyAudit.compareFamily([a, b]).comparable).toBe(false);
    var d = DM.suggest([a, b]);
    var r = DM.check(d, [a, b]);
    expect(r.families[0].status).toBe('red');
    expect(r.families[0].mismatch.length).toBe(2);
  });

  test('宣言に入っていない図を挙げる', function() {
    var extra = doc('gpio_usecase', 'plantuml-usecase');
    var r = DM.check(decl, [SPI_SEQ, SPI_STATE, DMA_SEQ, DMA_STATE, extra]);
    expect(r.undeclared).toEqual(['gpio_usecase']);
  });

  test('member の role は開いている図から取る', function() {
    var r = DM.check(decl, [SPI_SEQ, SPI_STATE]);
    expect(r.families[0].members[0].role).toBe('sequence');
    expect(r.families[0].members[1].role).toBe('state');
  });
});

describe('driverMap.summaryLine', function() {
  test('宣言が無ければ作り方を言う', function() {
    expect(DM.summaryLine(DM.check(null, []))).toContain('宣言されていません');
  });
  test('全部揃っていれば言い切る', function() {
    var decl = DM.suggest([SPI_SEQ, SPI_STATE]);
    expect(DM.summaryLine(DM.check(decl, [SPI_SEQ, SPI_STATE]))).toBe('1 系統すべてで、宣言された対応どおりに揃っています');
  });
  test('崩れている系統の数を出す', function() {
    var decl = DM.suggest([SPI_SEQ, SPI_STATE]);
    expect(DM.summaryLine(DM.check(decl, [SPI_SEQ]))).toBe('1 系統のうち 1 系統で対応が崩れています');
  });
});
