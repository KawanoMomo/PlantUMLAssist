'use strict';
// BLK-primary-20260914-1006-friction: 部品名の統一が済んでいるかを下端のバッジで言う。
// 「済」なら ⇄ 一括置換を開いて空打ちする手順が要らない、と読めることが要件。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/bulk-rename.js', '../src/core/rename-redo.js', '../src/core/rename-badge.js']
  .forEach(function(m) {
    try { delete require.cache[require.resolve(m)]; } catch (e) {}
    require(m);
  });
var RR = global.window.MA.renameRedo;
var RB = global.window.MA.renameBadge;

function hist(from, to) { return { from: from, to: to, at: '2026-09-14T10:06:00' }; }

var DONE_DOCS = [
  { name: 'spi_init_sequence', dsl: 'participant Spi_Driver\nSpi_Driver -> Hw_Ctrl : init\n' },
  { name: 'driver_common_class', dsl: 'class Spi_Driver\n' },
];
var PENDING_DOCS = [
  { name: 'spi_init_sequence', dsl: 'participant SpiDrv\nSpiDrv -> Hw_Ctrl : init\n' },
  { name: 'spi_state', dsl: 'Uninit --> Ready : SpiDrv_Init\nReady --> Busy : SpiDrv\n' },
  { name: 'driver_common_class', dsl: 'class Spi_Driver\n' },
];

describe('rename-badge: 部品名の統一バッジ', function() {

  test('組が残っていなければ「統一 済」で、開かなくてよいと言う', function() {
    var sum = RB.summarize(RR.pairs([hist('SpiDrv', 'Spi_Driver')], DONE_DOCS));
    expect(sum.pairs).toBe(1);
    expect(sum.pending).toBe(0);
    expect(sum.remaining).toBe(0);
    expect(sum.next).toBe(null);
    expect(RB.badgeText(sum)).toBe('統一 済 SpiDrv→Spi_Driver');
    expect(RB.tone(sum)).toBe('done');
    expect(RB.isActive(sum)).toBe(false);
    expect(RB.titleText(null, sum)).toContain('開く必要はありません');
  });

  test('旧称が残っていれば残件数を出し、次に当てる組を名指しする', function() {
    var sum = RB.summarize(RR.pairs([hist('SpiDrv', 'Spi_Driver')], PENDING_DOCS));
    expect(sum.pending).toBe(1);
    expect(sum.remaining).toBe(3);      // 1 枚目 2 件 + 2 枚目 1 件 (SpiDrv_Init は語の途中なので数えない)
    expect(sum.docs).toBe(2);
    expect(sum.next).toEqual({ from: 'SpiDrv', to: 'Spi_Driver' });
    expect(RB.badgeText(sum)).toBe('統一 残3');
    expect(RB.tone(sum)).toBe('open');
    expect(RB.isActive(sum)).toBe(true);
    expect(RB.titleText(null, sum)).toContain('SpiDrv');
  });

  test('組を 1 つも知らないときは「済」と言わず「−」にする', function() {
    var sum = RB.summarize([]);
    expect(RB.badgeText(sum)).toBe('統一 −');
    expect(RB.tone(sum)).toBe('idle');
    expect(RB.isActive(sum)).toBe(false);
    expect(RB.titleText(null, sum)).toContain('まだありません');
  });

  test('複数の組のうち残っているものだけを数え、古い組から当てる', function() {
    var rows = RR.pairs([hist('SpiDrv', 'Spi_Driver'), hist('CanDrv', 'Can_Driver')], [
      { name: 'a', dsl: 'participant Spi_Driver\nparticipant CanDrv\n' },
    ]);
    var sum = RB.summarize(rows);
    expect(sum.pairs).toBe(2);
    expect(sum.pending).toBe(1);
    expect(sum.next.from).toBe('CanDrv');
    expect(RB.badgeText(sum)).toBe('統一 残1');
  });


  test('逆向きの古い組は数えない (A→B を当てた後の B→A は直す先がない)', function() {
    // 新しい順。SpiDrv → Spi_Driver が新しく、その逆が古い。
    var rows = RR.pairs([hist('SpiDrv', 'Spi_Driver'), hist('Spi_Driver', 'SpiDrv')], DONE_DOCS);
    expect(rows.filter(function(r) { return r.state === 'pending'; }).length).toBe(1);
    var sum = RB.summarize(rows);
    expect(sum.pairs).toBe(1);
    expect(sum.pending).toBe(0);
    expect(RB.badgeText(sum)).toBe('統一 済 SpiDrv→Spi_Driver');
  });

  // BLK-primary-20260917-0123-friction: 「済」だけでは確かめたい組が済んだ組の
  // 中にあるかが分からず、組を読むためだけにパネルを開いていた (clicks=2)。
  test('済んだ組を開かずに名指しする (組ごとの状態を text / title / data で出す)', function() {
    var one = RB.summarize(RR.pairs([hist('SpiDrv', 'Spi_Driver')], DONE_DOCS));
    expect(RB.pairStates(one)).toBe('SpiDrv→Spi_Driver=done');
    expect(RB.titleText(null, one)).toContain('SpiDrv → Spi_Driver : 適用済み');
    var two = RB.summarize(RR.pairs([hist('SpiDrv', 'Spi_Driver'), hist('Spi_Driver', 'SPI_DRV')], DONE_DOCS));
    expect(two.pending).toBe(1);
    expect(RB.titleText(null, two)).toContain('SpiDrv → Spi_Driver : 適用済み');
    expect(RB.pairStates(two)).toContain('Spi_Driver→SPI_DRV=pending');
    var many = RB.summarize(RR.pairs([hist('SpiDrv', 'Spi_Driver'), hist('HwCtl', 'Hw_Ctrl')], DONE_DOCS));
    expect(many.pending).toBe(0);
    expect(RB.badgeText(many)).toBe('統一 済 2組');
    expect(RB.pairStates(null)).toBe('');
  });

  test('引数が無くても壊れない (数える前の描画でも呼ばれる)', function() {
    expect(RB.badgeText(null)).toBe('統一 −');
    expect(RB.tone(null)).toBe('idle');
    expect(RB.isActive(null)).toBe(false);
    expect(RB.summarize(null).pairs).toBe(0);
    expect(typeof RB.titleText(null, null)).toBe('string');
  });
});
