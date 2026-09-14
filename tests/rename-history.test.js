'use strict';
// BLK-primary-20260908-2103-wish: 部品名の改名履歴タイムライン。
// 「ヒット 0 件」が置換済みなのか元から無いのかを、図を開かずに区別できること。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/rename-history.js')]; } catch (e) {}
require('../src/core/rename-history.js');
var RH = global.window.MA.renameHistory;

// localStorage の代わり。setItem が投げる環境も試せるようにしてある。
function fakeStore(broken) {
  var data = {};
  return {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function(k, v) { if (broken) throw new Error('quota'); data[k] = v; },
    _data: data,
  };
}

var DIR = './autosave';

function entry(from, to, docs, at) { return RH.makeEntry(from, to, docs, at); }

describe('renameHistory.record / load', function() {
  test('置換 1 回が 1 件として残り、新しいものが先頭に来る', function() {
    var s = fakeStore();
    RH.record(s, DIR, entry('SpiDrv', 'Spi_Driver', [{ name: 'spi_init_sequence', count: 3 }], '2026-09-07T10:00:00'));
    RH.record(s, DIR, entry('Spi_Driver', 'SpiDriver', [{ name: 'spi_state', count: 2 }], '2026-09-08T09:30:00'));
    var list = RH.load(s, DIR);
    expect(list.length).toBe(2);
    expect(list[0].from).toBe('Spi_Driver');
    expect(list[1].from).toBe('SpiDrv');
  });

  test('件数 0 の図は履歴に残さない（当たっていないので改名ではない）', function() {
    var e = entry('SpiDrv', 'Spi_Driver', [
      { name: 'spi_init_sequence', count: 3 },
      { name: 'adc_state', count: 0 },
    ], '2026-09-08T09:00:00');
    expect(e.docs.length).toBe(1);
    expect(e.total).toBe(3);
  });

  test('当たった図が 0 枚なら何も残さない', function() {
    var s = fakeStore();
    RH.record(s, DIR, entry('SpiDrv', 'Spi_Driver', [], '2026-09-08T09:00:00'));
    expect(RH.load(s, DIR).length).toBe(0);
  });

  test('保存フォルダごとに別の履歴になる', function() {
    var s = fakeStore();
    RH.record(s, DIR, entry('A', 'B', [{ name: 'x', count: 1 }], '2026-09-08T09:00:00'));
    RH.record(s, './other', entry('C', 'D', [{ name: 'y', count: 2 }], '2026-09-08T09:00:00'));
    expect(RH.load(s, DIR).length).toBe(1);
    expect(RH.load(s, './other')[0].from).toBe('C');
  });

  test('localStorage が使えなくても例外を投げない', function() {
    var s = fakeStore(true);
    expect(RH.record(s, DIR, entry('A', 'B', [{ name: 'x', count: 1 }], '2026-09-08T09:00:00')).length).toBe(1);
    expect(RH.load(null, DIR)).toEqual([]);
  });
});

describe('renameHistory.forName', function() {
  var s = fakeStore();
  RH.record(s, DIR, entry('SpiDrv', 'Spi_Driver', [{ name: 'spi_init_sequence', count: 3 }], '2026-09-07T10:00:00'));
  RH.record(s, DIR, entry('AdcDrv', 'Adc_Driver', [{ name: 'adc_state', count: 1 }], '2026-09-08T08:00:00'));
  var list = RH.load(s, DIR);

  test('旧称でも新称でも同じ改名に当たる', function() {
    expect(RH.forName(list, 'SpiDrv').length).toBe(1);
    expect(RH.forName(list, 'Spi_Driver').length).toBe(1);
  });

  test('関係のない名前には当たらない', function() {
    expect(RH.forName(list, 'CanDrv')).toEqual([]);
  });

  test('部分一致では拾わない（SpiDrvTest は別の部品）', function() {
    expect(RH.forName(list, 'SpiDrvTest')).toEqual([]);
  });

  test('改名が起きた図の名前だけを返す', function() {
    expect(RH.docNames(RH.forName(list, 'SpiDrv'))).toEqual(['spi_init_sequence']);
  });

  test('履歴に出てくる部品名を旧称・新称の両方から集める', function() {
    expect(RH.names(list)).toEqual(['AdcDrv', 'Adc_Driver', 'SpiDrv', 'Spi_Driver']);
  });
});

describe('renameHistory.summary', function() {
  var s = fakeStore();
  RH.record(s, DIR, entry('SpiDrv', 'Spi_Driver', [
    { name: 'spi_init_sequence', count: 3 },
    { name: 'spi_state', count: 2 },
  ], '2026-09-08T09:30:00'));
  var list = RH.load(s, DIR);

  test('回数・枚数・件数と最新日時を言う', function() {
    var t = RH.summary(list, 'SpiDrv');
    expect(t.indexOf('1 回・2 枚・5 件') >= 0).toBe(true);
    expect(t.indexOf('2026-09-08 09:30') >= 0).toBe(true);
    expect(RH.summaryClass(list, 'SpiDrv')).toBe('rh-found');
  });

  test('記録が無い名前は「置換されていない」と言い切る（黙らない）', function() {
    var t = RH.summary(list, 'CanDrv');
    expect(t.indexOf('置換されていません') >= 0).toBe(true);
    expect(RH.summaryClass(list, 'CanDrv')).toBe('rh-none');
  });

  test('名前を入れる前は全体の件数を出す', function() {
    expect(RH.summary(list, '').indexOf('1 件あります') >= 0).toBe(true);
    expect(RH.summary([], '').indexOf('まだありません') >= 0).toBe(true);
  });
});

describe('renameHistory.line / text', function() {
  var s = fakeStore();
  RH.record(s, DIR, entry('SpiDrv', 'Spi_Driver', [{ name: 'spi_init_sequence', count: 3 }], '2026-09-08T09:30:00'));
  var list = RH.load(s, DIR);

  test('1 行で いつ・何から何へ・何枚・何件 が読める', function() {
    expect(RH.line(list[0])).toBe('2026-09-08 09:30  SpiDrv → Spi_Driver  1 枚 / 3 件');
  });

  test('不具合票に貼れる表になる', function() {
    var t = RH.text(list, 'SpiDrv');
    expect(t.indexOf('| 2026-09-08 09:30 | SpiDrv | Spi_Driver | spi_init_sequence(3) | 3 |') >= 0).toBe(true);
  });

  test('記録の無い名前でも表の見出しと理由は出す', function() {
    expect(RH.text(list, 'CanDrv').indexOf('置換されていません') >= 0).toBe(true);
  });

  test('壊れた日時は空文字にする（NaN を画面に出さない）', function() {
    expect(RH.formatAt('not-a-date')).toBe('');
  });
});
