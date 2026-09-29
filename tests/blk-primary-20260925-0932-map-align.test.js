'use strict';
// BLK-primary-20260925-0932-wish: junior と primary の spi シーケンス図は部品名が総入れ替えで、
// 名前の形では組が 1 つもできず「揃える」行が出なかった。対応表をシーケンス図にも効かせ、
// 機械の組も手で結んだ組も同じ「揃える」の組にし、複数の組を 1 回で当てる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['dsl-utils', 'regex-parts', 'line-resolver', 'text-updater', 'dsl-updater', 'parser-utils',
  'note-edit', 'note-block', 'state-map', 'seq-map', 'map-align', 'bulk-rename'].forEach(function(n) {
  require('../src/core/' + n + '.js');
});
require('../src/modules/sequence.js');

var SEQ = window.MA.modules.plantumlSequence;
var SM = window.MA.seqMap;
var MAL = window.MA.mapAlign;
var BR = window.MA.bulkRename;

var PRIMARY = ['@startuml', 'title SPI_Init_Sequence', 'actor App',
  'participant Spi_Driver', 'participant SpiRegs', 'participant Clock_Controller', 'participant Irq_Controller',
  'App -> Spi_Driver : Spi_Init()', 'Spi_Driver -> Clock_Controller : EnableClock()',
  'Spi_Driver -> Irq_Controller : EnableIrq()', 'Irq_Controller --> Spi_Driver : Ack', '@enduml'].join('\n');
var JUNIOR = ['@startuml', 'title SPIドライバ初期化シーケンス', 'actor App',
  'participant SpiDrv', 'participant SpiRegs', 'participant Clock_Ctrl', 'participant IRQCtrl',
  'App -> SpiDrv : Spi_Init()', 'SpiDrv -> Clock_Ctrl : EnableClock()',
  'SpiDrv -> IRQCtrl : EnableIrq()', 'IRQCtrl --> SpiDrv : Ack', '@enduml'].join('\n');

function build(ov) { return SM.build(SEQ.parse(JUNIOR), SEQ.parse(PRIMARY), ov); }

describe('seq-map: シーケンス図の対応表 (参加者 = 部品名)', function() {
  test('参加者を部品名として組み、名前の形が似た組は機械が結ぶ', function() {
    var map = build(null);
    var byMine = {};
    map.states.forEach(function(r) { if (r.mine) byMine[r.mine] = r; });
    expect(byMine.App.match).toBe('exact');
    expect(byMine.Clock_Controller.ref).toBe('Clock_Ctrl');
    expect(byMine.Spi_Driver.ref).toBe('SpiDrv');
    // 形の似ていない Irq_Controller は機械では結べない
    expect(byMine.Irq_Controller.match).toBe('mine-only');
  });

  test('手で決めた組 (対応を選ぶ) は状態遷移図と同じ道具で決められる', function() {
    var ov = SM.withPair(SM.overrides(null), 'state', 'IRQCtrl', 'Irq_Controller');
    var map = build(ov);
    var row = map.states.filter(function(r) { return r.mine === 'Irq_Controller'; })[0];
    expect(row.match).toBe('manual');
    expect(row.ref).toBe('IRQCtrl');
  });

  test('参照図だけの行を自分の図に足す道は持たない (＋この図にも足す を出さない)', function() {
    expect(SM.supportsAdopt).toBe(false);
    expect(SM.supportsOverrides).toBe(true);
  });
});

describe('map-align: 組を相手の綴りに揃える', function() {
  test('機械の組も手で結んだ組も、揃える組に並ぶ (自分の綴り → 相手の綴り)', function() {
    var ov = SM.withPair(SM.overrides(null), 'state', 'IRQCtrl', 'Irq_Controller');
    var cands = MAL.candidates(build(ov));
    var froms = cands.map(function(c) { return c.from + '>' + c.to; }).sort();
    expect(froms).toEqual(['Clock_Controller>Clock_Ctrl', 'Irq_Controller>IRQCtrl', 'Spi_Driver>SpiDrv']);
    var manual = cands.filter(function(c) { return c.from === 'Irq_Controller'; })[0];
    expect(manual.decided).toBe(true);
    expect(MAL.rowText(manual)).toContain('手で対応');
  });

  test('一致している組と片方だけの行は揃える組にしない', function() {
    var cands = MAL.candidates(build(null));
    expect(cands.some(function(c) { return c.from === 'App' || c.from === 'Irq_Controller'; })).toBe(false);
  });

  test('外した組は揃えずに残す (覚えの無い組は既定で入る)', function() {
    var ov = SM.withPair(SM.overrides(null), 'state', 'IRQCtrl', 'Irq_Controller');
    var cands = MAL.candidates(build(ov));
    var pairs = MAL.pairsOf(cands, { 'state:Spi_Driver': false });
    expect(pairs.map(function(p) { return p.from; }).sort()).toEqual(['Clock_Controller', 'Irq_Controller']);
    expect(MAL.buttonLabel('junior', 2)).toBe('junior の綴りに揃える (2 組)');
  });
});

describe('bulk-rename: 複数の組を 1 回で当てる', function() {
  test('3 組を 1 回で当て、識別子の途中には当てない', function() {
    var out = BR.replaceManyIn(PRIMARY, [
      { from: 'Spi_Driver', to: 'SpiDrv' }, { from: 'Clock_Controller', to: 'Clock_Ctrl' },
      { from: 'Irq_Controller', to: 'IRQCtrl' }]);
    expect(out).toContain('participant SpiDrv');
    expect(out).toContain('SpiDrv -> Clock_Ctrl : EnableClock()');
    expect(out).toContain('IRQCtrl --> SpiDrv : Ack');
    expect(out).not.toContain('Irq_Controller');
    expect(out).toContain('title SPI_Init_Sequence');
  });

  test('組を順に当てると起きる連鎖 (A→B, B→C で A が C になる) を起こさない', function() {
    var out = BR.replaceManyIn('A -> B : x', [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }]);
    expect(out).toBe('B -> C : x');
  });

  test('applyMany は apply と同じ形で、当たった図だけを返す', function() {
    var res = BR.applyMany([{ id: 1, name: 'p', dsl: PRIMARY }, { id: 2, name: 'q', dsl: 'A -> B' }],
      [{ from: 'Spi_Driver', to: 'SpiDrv' }, { from: 'Irq_Controller', to: 'IRQCtrl' }]);
    expect(res.docs).toBe(1);
    expect(res.changed[0].id).toBe(1);
    expect(res.total).toBe(8);
  });

  test('識別子にならない綴りへは当てない (bulk-rename と同じ条件)', function() {
    expect(BR.replaceManyIn('A -> B', [{ from: 'A', to: 'bad name' }])).toBe('A -> B');
  });
});
