'use strict';
// BLK-primary-20260915-0506-wish: 不具合の混入点 (この部品名がいつの版から入ったか)。
// server が全図・全版から「語が当たった行」だけを返すので、ここはその並びを
// 版と版で突き合わせて、増減した版・混在が始まった版に直す部分を見る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/version-history.js')]; } catch (e) {}
require('../src/core/version-history.js');
try { delete require.cache[require.resolve('../src/core/blame-point.js')]; } catch (e) {}
require('../src/core/blame-point.js');
var bp = global.window.MA.blamePoint;

function v(stamp, counts, lines, current) {
  return {
    stamp: stamp, current: !!current, counts: counts,
    lines: (lines || []).map(function(t, i) { return { no: i + 1, text: t }; }),
  };
}

describe('blamePoint.terms', () => {
  test('空白区切りで語を取る', () => {
    expect(bp.terms(' SpiDrv  Spi_Driver ')).toEqual(['SpiDrv', 'Spi_Driver']);
  });

  test('同じ語を 2 回書いても 1 語', () => {
    expect(bp.terms('SpiDrv SpiDrv')).toEqual(['SpiDrv']);
  });

  test('空なら 0 語', () => {
    expect(bp.terms('   ')).toEqual([]);
    expect(bp.terms(null)).toEqual([]);
  });
});

describe('blamePoint.lineDelta', () => {
  test('行番号がずれただけの行は変更に数えない', () => {
    var before = [{ no: 3, text: 'participant SpiDrv' }];
    var after = [{ no: 9, text: 'participant SpiDrv' }];
    var d = bp.lineDelta(before, after);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  test('足された行と消えた行を分けて出す', () => {
    var before = [{ no: 3, text: 'participant SpiDrv' }];
    var after = [{ no: 3, text: 'participant Spi_Driver' }];
    var d = bp.lineDelta(before, after);
    expect(d.added.map(function(l) { return l.text; })).toEqual(['participant Spi_Driver']);
    expect(d.removed.map(function(l) { return l.text; })).toEqual(['participant SpiDrv']);
  });
});

describe('blamePoint.fileChanges', () => {
  test('出現数が変わった版だけを出す (変わらない版は出さない)', () => {
    var file = { name: 'spi_seq', versions: [
      v('20260910-100000', [0, 0], []),
      v('20260911-100000', [1, 0], ['participant SpiDrv']),
      v('20260912-100000', [1, 0], ['participant SpiDrv']),
      v('', [1, 1], ['participant SpiDrv', 'participant Spi_Driver'], true),
    ] };
    var ch = bp.fileChanges(file, 2);
    expect(ch.length).toBe(2);
    expect(ch[0].stamp).toBe('20260911-100000');
    expect(ch[1].current).toBe(true);
  });

  test('最古の版に既に居る語は first を立てる (増えた瞬間は見ていない)', () => {
    var file = { name: 'spi_seq', versions: [
      v('20260910-100000', [2], ['participant SpiDrv', 'SpiDrv -> X: init']),
      v('20260911-100000', [2], ['participant SpiDrv', 'SpiDrv -> X: init']),
    ] };
    var ch = bp.fileChanges(file, 1);
    expect(ch.length).toBe(1);
    expect(ch[0].first).toBe(true);
    expect(ch[0].added.length).toBe(2);
  });

  test('2 語が同時に居る版に混在の印が付き、始まった版だけが mixStart', () => {
    var file = { name: 'spi_seq', versions: [
      v('20260910-100000', [1, 0], ['participant SpiDrv']),
      v('20260911-100000', [1, 1], ['participant SpiDrv', 'participant Spi_Driver']),
      v('20260912-100000', [1, 2], ['participant SpiDrv', 'participant Spi_Driver', 'Spi_Driver -> X: a']),
    ] };
    var ch = bp.fileChanges(file, 2);
    expect(ch[0].mixStart).toBe(false);
    expect(ch[1].mixStart).toBe(true);
    expect(ch[2].mixed).toBe(true);
    expect(ch[2].mixStart).toBe(false);
  });
});

describe('blamePoint.rows', () => {
  var payload = {
    terms: ['SpiDrv', 'Spi_Driver'],
    scanned: 6,
    files: [
      { name: 'spi_state', versions: [
        v('20260911-120000', [0, 0], []),
        v('20260913-090000', [0, 1], ['state Spi_Driver_Idle']),
      ] },
      { name: 'spi_seq', versions: [
        v('20260910-100000', [0, 0], []),
        v('20260912-100000', [1, 0], ['participant SpiDrv']),
        v('20260914-100000', [1, 1], ['participant SpiDrv', 'participant Spi_Driver']),
      ] },
    ],
  };

  test('図をまたいで刻印の古い順に 1 本になる', () => {
    var rows = bp.rows(payload);
    expect(rows.map(function(r) { return r.file; }))
      .toEqual(['spi_seq', 'spi_state', 'spi_seq']);
    expect(rows.map(function(r) { return r.stamp; }))
      .toEqual(['20260912-100000', '20260913-090000', '20260914-100000']);
  });

  test('いまの中身の行はどの刻印より後ろ', () => {
    var rows = bp.rows({ terms: ['SpiDrv'], scanned: 2, files: [
      { name: 'a', versions: [v('', [1], ['participant SpiDrv'], true)] },
      { name: 'b', versions: [v('20260914-100000', [1], ['participant SpiDrv'])] },
    ] });
    expect(rows[rows.length - 1].file).toBe('a');
    expect(rows[rows.length - 1].label).toBe('いま');
  });

  test('語が 0 件なら行も出ない', () => {
    expect(bp.rows({ terms: [], files: payload.files })).toEqual([]);
  });

  test('deltaText は語ごとの増減を出す (置換を「変化なし」にしない)', () => {
    var rows = bp.rows(payload);
    var last = rows[rows.length - 1];
    expect(bp.deltaText(last, payload.terms)).toBe('Spi_Driver +1');
  });

  test('origin は語ごとに最初に増えた版を指す', () => {
    var rows = bp.rows(payload);
    var o = bp.origin(rows, payload.terms);
    expect(o[0].term).toBe('SpiDrv');
    expect(o[0].file).toBe('spi_seq');
    expect(o[0].stamp).toBe('20260912-100000');
    expect(o[0].reason).toBe('added');
    expect(o[1].file).toBe('spi_state');
    expect(o[1].stamp).toBe('20260913-090000');
  });

  test('どの版にも無い語は none', () => {
    var o = bp.origin(bp.rows(payload), ['SpiDrv', 'Spi_Driver', 'Nowhere']);
    expect(o[2].reason).toBe('none');
    expect(bp.originText(o[2])).toBe('Nowhere: どの版にも無い');
  });

  test('混在の始まりは 2 語が同時に居る最初の版', () => {
    var mix = bp.mixOrigin(bp.rows(payload));
    expect(mix.file).toBe('spi_seq');
    expect(mix.stamp).toBe('20260914-100000');
  });

  test('headline は見た版の数と混在の始まりを言う', () => {
    var rows = bp.rows(payload);
    var head = bp.headline(payload, rows);
    expect(head.indexOf('3 件の変化')).toBe(0);
    expect(head.indexOf('6 版を見ました') >= 0).toBe(true);
    expect(head.indexOf('混在の始まり') >= 0).toBe(true);
  });

  test('1 件も当たらなければ、見た版の数を言って空だと伝える', () => {
    var head = bp.headline({ terms: ['Nowhere'], scanned: 12, files: [] }, []);
    expect(head.indexOf('どの版にも出てきません') >= 0).toBe(true);
    expect(head.indexOf('12 版') >= 0).toBe(true);
  });
});
