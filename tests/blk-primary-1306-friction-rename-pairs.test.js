'use strict';
// BLK-primary-20260914-1306-friction: 置換の組 (SpiDrv → Spi_Driver) を保存フォルダ側に
// 残す。「当たった置換」しか残さない記録では、ヒット 0 件を
// 確かめるためだけの空打ちは何度打っても組が残らず、毎回打ち直しになっていた。
// TICKET-owner-20261116-0621-prune: 保存フォルダを使わない運用でも、組はこのブラウザに保存先ごとに残す
// (改名の時系列を外し、過去の置換の組 1 つに寄せた)。
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

describe('rename-pairs: 保存フォルダを使わない運用の組 (このブラウザに残す)', function() {
  function memStore(init) {
    var m = Object.assign({}, init || {});
    return {
      getItem: function(k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function(k, v) { m[k] = String(v); },
      raw: m,
    };
  }

  test('当てた組を覚え、開き直して読むと同じ組が出る。保存先ごとに分かれる', function() {
    var s = memStore();
    RP.rememberLocal(s, './autosave', { from: 'SpiDrv', to: 'Spi_Driver', at: '2026-11-16T12:00:00Z',
      appliedAt: '2026-11-16T12:00:00Z' });
    var rows = RP.loadLocal(s, './autosave');
    expect(rows.length).toBe(1);
    expect(rows[0].from + '>' + rows[0].to).toBe('SpiDrv>Spi_Driver');
    expect(rows[0].appliedAt).toBe('2026-11-16T12:00:00Z');
    expect(RP.loadLocal(s, './other')).toEqual([]);
  });

  test('同じ組は 1 行のまま日時だけ進み、新しい組が先頭に来る', function() {
    var s = memStore();
    RP.rememberLocal(s, 'd', { from: 'A', to: 'B', at: '2026-11-16T10:00:00Z' });
    RP.rememberLocal(s, 'd', { from: 'C', to: 'D', at: '2026-11-16T11:00:00Z' });
    RP.rememberLocal(s, 'd', { from: 'A', to: 'B', at: '2026-11-16T12:00:00Z' });
    var rows = RP.loadLocal(s, 'd');
    expect(rows.map(function(r) { return r.from; })).toEqual(['A', 'C']);
    expect(rows[0].at).toBe('2026-11-16T12:00:00Z');
  });

  test('組でないもの (同名・空) は覚えない', function() {
    var s = memStore();
    RP.rememberLocal(s, 'd', { from: 'A', to: 'A', at: '2026-11-16T10:00:00Z' });
    RP.rememberLocal(s, 'd', { from: '', to: 'B' });
    expect(RP.loadLocal(s, 'd')).toEqual([]);
  });

  test('壊れた値・読めない入れ物・外した道具の控えが残っていても、空として扱い止まらない', function() {
    expect(RP.loadLocal(memStore({ 'plantuml-rename-pairs': '{broken' }), 'd')).toEqual([]);
    expect(RP.loadLocal(memStore({ 'plantuml-rename-pairs': '[1,2]' }), 'd')).toEqual([]);
    expect(RP.loadLocal(null, 'd')).toEqual([]);
    var throwing = { getItem: function() { throw new Error('denied'); }, setItem: function() { throw new Error('denied'); } };
    expect(RP.loadLocal(throwing, 'd')).toEqual([]);
    expect(RP.rememberLocal(throwing, 'd', { from: 'A', to: 'B', at: 'x' }).length).toBe(1);
    // 外した改名の時系列が残した控え (別の鍵) は読まない・書かない。
    var old = '{"./autosave":[{"from":"CanDrv","to":"Can_Driver","docs":[]}]}';
    var s = memStore({ 'plantuml-rename-history': old });
    expect(RP.loadLocal(s, './autosave')).toEqual([]);
    RP.rememberLocal(s, './autosave', { from: 'A', to: 'B', at: '2026-11-16T10:00:00Z' });
    expect(s.raw['plantuml-rename-history']).toBe(old);
    expect(RP.LOCAL_KEY).toBe('plantuml-rename-pairs');
  });
});
