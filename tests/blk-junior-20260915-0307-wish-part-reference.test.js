'use strict';
// BLK-junior-20260915-0307-wish: SPI を「部品を起こす」で開くと 6 図種とも汎用ひな形
// (init/config/read/write/irqSetup/irqNotify) で埋まり、先輩 (primary) が既に持っている
// SPI のシーケンス図を手で打ち直すことになっていた。
// 隣のフォルダに同じ部品名の実図があれば、その図種はひな形ではなく実図を写すことを守る。

if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
[
  '../src/core/dsl-utils.js',
  '../src/core/parser-utils.js',
  '../src/core/name-audit.js',
  '../src/core/component-deps.js',
  '../src/core/component-starter.js',
  '../src/core/driver-usecase-starter.js',
  '../src/core/part-reference.js',
  '../src/core/part-starter.js',
].forEach(function(f) {
  try { delete require.cache[require.resolve(f)]; } catch (e) {}
  require(f);
});
var PR = global.window.MA.partReference;
var PS = global.window.MA.partStarter;

// 先輩の SPI シーケンス図 (汎用ひな形とは参加者も並びも違う)。
var SENIOR_SEQ = [
  '@startuml',
  'title SPI ドライバ 初期化シーケンス',
  'participant "SPI_Driver" as Spi',
  'participant "ClockCtrl" as Clk',
  'participant "IRQCtrl" as Irq',
  'Spi -> Clk : EnableClock()',
  'Clk --> Spi : Ack',
  'Spi -> Irq : Register()',
  'Irq --> Spi : Ack',
  '@enduml',
].join('\n');

var SENIOR_CLASS = [
  '@startuml',
  'class SPI_Driver {',
  '  +SPI_Init() : Std_ReturnType',
  '}',
  '@enduml',
].join('\n');

function folders() {
  return [{
    folder: 'primary',
    dir: 'E:/01_Loop/persona-data/primary',
    entries: [
      { name: 'spi_init_sequence', kind: 'sequence', text: SENIOR_SEQ },
      { name: 'driver_common_class', kind: 'class', text: 'class Foo {}' },
      { name: 'spi_class', kind: 'class', text: SENIOR_CLASS },
    ],
  }];
}

describe('part-reference の照合', function() {
  test('部品名がファイル名に入っている図だけを手本にする', function() {
    var refs = PR.collect('SPI', folders());
    expect(refs.list.length).toBe(2);
    expect(PR.pick(refs, 'sequence').name).toBe('spi_init_sequence');
    expect(PR.pick(refs, 'class').name).toBe('spi_class');
    expect(PR.pick(refs, 'state')).toBe(null);
  });

  test('本文の無い一覧行と図種の分からない図は手本にしない', function() {
    var refs = PR.collect('SPI', [{ folder: 'primary', entries: [
      { name: 'spi_sequence', kind: 'sequence', text: '' },
      { name: 'spi_memo', kind: '', text: '@startuml\n@enduml' },
    ] }]);
    expect(refs.list.length).toBe(0);
  });

  test('1 文字の部品名では照合しない', function() {
    expect(PR.matches('S', 'spi_sequence')).toBe(false);
    expect(PR.matches('SPI', 'SPI_Sequence.puml')).toBe(true);
  });

  test('同じ図種に複数あれば部品名に近い短い名前を先に出す', function() {
    var refs = PR.collect('spi', [{ folder: 'primary', entries: [
      { name: 'spi_dma_bridge_sequence', kind: 'sequence', text: SENIOR_SEQ },
      { name: 'spi_sequence', kind: 'sequence', text: SENIOR_SEQ },
    ] }]);
    expect(PR.pick(refs, 'sequence').name).toBe('spi_sequence');
  });

  test('図種を返さない古い保存は本文から当てる', function() {
    expect(PR.kindOf({ kind: '', text: SENIOR_SEQ })).toBe('sequence');
    expect(PR.kindOf({ kind: '', text: SENIOR_CLASS })).toBe('class');
  });
});

describe('部品を起こす下書きの出所', function() {
  test('手本のある図種は実図を写し、無い図種はひな形のまま', function() {
    var p = PS.plan('SPI', [], PR.collect('SPI', folders()));
    var by = {};
    p.sheets.forEach(function(s) { by[s.key] = s; });

    expect(by.sequence.source).toBe('reference');
    expect(by.sequence.dsl).toBe(SENIOR_SEQ);
    expect(by.sequence.dsl).toContain('ClockCtrl');
    expect(by.sequence.ref.folder).toBe('primary');
    // 名前は自分の名前のまま (写すのは中身だけ)。
    expect(by.sequence.name).toBe('spi_sequence');

    expect(by['class'].source).toBe('reference');
    expect(by.state.source).toBe('template');
    expect(by.state.dsl).toContain('SPI_Init');
    expect(p.refCount).toBe(2);
  });

  test('手本が無ければ今までどおり 6 図種ともひな形', function() {
    var p = PS.plan('TIMER', [], PR.collect('TIMER', folders()));
    expect(p.refCount).toBe(0);
    p.sheets.forEach(function(s) { expect(s.source).toBe('template'); });
    expect(p.sheets[0].dsl).toContain('TIMER_Init');
  });

  test('refs を渡さない呼び出しは今までどおり動く', function() {
    var p = PS.plan('SPI', []);
    expect(p.refCount).toBe(0);
    expect(p.sheets[0].dsl).toContain('SPI_Init');
  });

  test('要約が写す枚数を言う', function() {
    var p = PS.plan('SPI', [], PR.collect('SPI', folders()));
    expect(PS.summary(p)).toContain('2 図種は先輩の実図を写します');
  });
});
