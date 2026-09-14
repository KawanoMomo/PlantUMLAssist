'use strict';
// BLK-primary-20260914-1206: 手順5.5 (🔖 指摘から選ぶの [適用])・手順2 (⇄ 一括置換) で
// 直した図を「± 差分」で並べようとしても「まだ保存していない (基準なし)」としか出なかった。
// どちらも保存フォルダへ直接書くので、書いた後を基準にすると「変更なし」になり、
// 後から開くと基準ごと今の状態になって変更前が消える。
// 基準がまだ無い図は「書く前」を基準に据え、外から渡した基準とも比べられるようにする。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/save-diff.js')]; } catch (e) {}
require('../src/core/save-diff.js');
var SD = global.window.MA.saveDiff;

var BEFORE = '@startuml\nclass SpiDrv\n@enduml';
var AFTER = '@startuml\nclass Spi_Driver\n@enduml';

describe('save-diff — 保存フォルダへ直接書いた図の基準', () => {
  beforeEach(() => { SD.reset(); });

  test('markIfAbsent: 基準が無い図は渡した本文が基準になる', () => {
    SD.markIfAbsent('driver_common_class', BEFORE, '2026-09-14T12:30:00.000Z');
    expect(SD.baselineOf('driver_common_class').dsl).toBe(SD.normalize(BEFORE));
    // 書いた後の本文を今の中身とすれば、その置換がそのまま差分として読める。
    expect(SD.statusOf('driver_common_class', AFTER)).toBe('changed');
    expect(SD.changedLines('driver_common_class', AFTER)).toEqual({ added: 1, removed: 1 });
  });

  test('markIfAbsent: 既にある基準は動かさない (前回保存時点の意味を壊さない)', () => {
    SD.mark('spi_state', BEFORE, '2026-09-14T10:00:00.000Z');
    SD.markIfAbsent('spi_state', AFTER, '2026-09-14T12:30:00.000Z');
    expect(SD.baselineOf('spi_state').dsl).toBe(SD.normalize(BEFORE));
    expect(SD.markedAt('spi_state')).toBe('2026-09-14T10:00:00.000Z');
  });

  test('markIfAbsent: 名前が無ければ何もしない', () => {
    expect(SD.markIfAbsent('', BEFORE)).toBe(null);
  });

  test('countBetween: 外から渡した基準と比べられる (書き込み履歴の回を基準にする)', () => {
    expect(SD.countBetween(BEFORE, AFTER)).toEqual({ added: 1, removed: 1 });
    expect(SD.countBetween(BEFORE, BEFORE)).toEqual({ added: 0, removed: 0 });
    // 基準が無いときは全行が追加 (従来の changedLines と同じ答えにする)。
    expect(SD.countBetween('', AFTER).removed).toBe(0);
    expect(SD.countBetween(null, AFTER).added).toBe(3);
  });

  test('diffBetween: 外から渡した基準との行差分が出る', () => {
    var rows = SD.diffBetween(BEFORE, AFTER);
    expect(rows.filter(function(r) { return r.mark === '-'; })[0].text).toBe('class SpiDrv');
    expect(rows.filter(function(r) { return r.mark === '+'; })[0].text).toBe('class Spi_Driver');
    expect(SD.diffBetween(BEFORE, BEFORE)).toEqual([]);
  });

  test('diffBetween: 行末の空白・改行コードの違いは差分にしない', () => {
    expect(SD.diffBetween(BEFORE, BEFORE.replace(/\n/g, '\r\n') + '\n')).toEqual([]);
  });

  test('従来の changedLines / diffLines はこの図の基準を使う (呼び方は変わらない)', () => {
    SD.mark('spi_init_sequence', BEFORE);
    expect(SD.changedLines('spi_init_sequence', AFTER)).toEqual({ added: 1, removed: 1 });
    expect(SD.diffLines('spi_init_sequence', AFTER).length).toBeGreaterThan(0);
    // 基準の無い図は全行が追加 (基準なしの表示と食い違わない)。
    expect(SD.diffLines('いない図', AFTER).filter(function(r) { return r.mark === '-'; }).length).toBe(0);
  });
});
