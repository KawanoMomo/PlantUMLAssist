'use strict';
// BLK-primary-20260914-1306-friction: 置換の組 (SpiDrv → Spi_Driver) を保存フォルダ側に
// 残す。localStorage の改名履歴は「当たった置換」しか増えないので、ヒット 0 件を
// 確かめるためだけの空打ちは何度打っても組が残らず、毎回打ち直しになっていた。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/rename-pairs.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var RP = global.window.MA.renamePairs;

function p(from, to, at) { return { from: from, to: to, at: at }; }

describe('rename-pairs: 置換の組はフォルダの持ち物', function() {

  test('normalize は {from,to,at} に揃え、片側が欠けた行は組ではないので落とす', function() {
    var rows = RP.normalize([
      { from: 'SpiDrv', to: 'Spi_Driver', at: '2026-09-14T13:06:00Z' },
      { from: 'CanDrv' },                    // to が無い
      { to: 'Adc_Driver' },                  // from が無い
      { from: 'TimerDrv', to: 'Timer_Driver' },
      null,
    ]);
    expect(rows.map(function(r) { return r.from; })).toEqual(['SpiDrv', 'TimerDrv']);
    expect(rows[1].at).toBe('');
  });

  test('normalize は配列でないものを空として扱う', function() {
    expect(RP.normalize(null)).toEqual([]);
    expect(RP.normalize(undefined)).toEqual([]);
    expect(RP.normalize({ from: 'a', to: 'b' })).toEqual([]);
  });

  test('merge は同じ組を 1 行にまとめ、新しい日時を残す', function() {
    var rows = RP.merge(
      [p('SpiDrv', 'Spi_Driver', '2026-09-14T12:06:00Z')],
      [p('SpiDrv', 'Spi_Driver', '2026-09-14T13:06:00Z')]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].at).toBe('2026-09-14T13:06:00Z');
  });

  test('merge は日時の新しい順に並べる', function() {
    var rows = RP.merge(
      [p('SpiDrv', 'Spi_Driver', '2026-09-14T10:00:00Z')],
      [p('CanDrv', 'Can_Driver', '2026-09-14T13:00:00Z'),
       p('AdcDrv', 'Adc_Driver', '2026-09-14T11:00:00Z')]
    );
    expect(rows.map(function(r) { return r.from; })).toEqual(['CanDrv', 'AdcDrv', 'SpiDrv']);
  });

  test('日時を持たない組も落とさず、最後尾に置く', function() {
    var rows = RP.merge(
      [p('SpiDrv', 'Spi_Driver', '')],
      [p('CanDrv', 'Can_Driver', '2026-09-14T13:00:00Z')]
    );
    expect(rows.length).toBe(2);
    expect(rows[1].from).toBe('SpiDrv');
  });

  test('from と to が同じ組と空の組は覚えない', function() {
    expect(RP.shouldRemember('SpiDrv', 'SpiDrv')).toBe(false);
    expect(RP.shouldRemember('', 'Spi_Driver')).toBe(false);
    expect(RP.shouldRemember('SpiDrv', '  ')).toBe(false);
    expect(RP.shouldRemember(null, null)).toBe(false);
  });

  test('当たらなかった組でも覚える (0 件と分かったこと自体が次回の手数を減らす)', function() {
    // 件数は shouldRemember の判断材料ではない。組として成立していれば覚える。
    expect(RP.shouldRemember('SpiDrv', 'Spi_Driver')).toBe(true);
    expect(RP.shouldRemember(' SpiDrv ', ' Spi_Driver ')).toBe(true);
  });

  test('フォルダ側の組は履歴に無くても残る (別ブラウザで打った組が引き継がれる)', function() {
    var rows = RP.merge([p('SpiDrv', 'Spi_Driver', '2026-09-14T13:06:00Z')], []);
    expect(rows.length).toBe(1);
    expect(rows[0].to).toBe('Spi_Driver');
  });

  // BLK-primary-20260914-1106-friction: [置換] で当てた日時は、打っただけの記録と
  // 混ざっても消えない (開いた時に欄へ入れる組の見分けに使う)。
  test('当てた日時 (appliedAt / applied_at) を読み、同じ組では新しい方を残す', function() {
    var rows = RP.merge(
      [{ from: 'SpiDrv', to: 'Spi_Driver', at: '2026-09-29T12:00:00Z' }],
      [{ from: 'SpiDrv', to: 'Spi_Driver', at: '2026-09-29T11:00:00Z', applied_at: '2026-09-29T11:00:00Z' }]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].at).toBe('2026-09-29T12:00:00Z');
    expect(rows[0].appliedAt).toBe('2026-09-29T11:00:00Z');
    expect(RP.normalize([{ from: 'A', to: 'B' }])[0].appliedAt).toBe('');
  });
});
