'use strict';
// BLK-junior-20260914-2006-wish: 資料化の残りを部品をまたいで 1 枚に出す。
// 部品欄を選び直さなくても「TIMER は 1 枚も済んでいない / GPIO は残り 1 図種」が
// 読めること、次に着手する 1 マスが表の上から決まることを固定する。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/component-pack.js', '../src/core/material-export.js',
 '../src/core/material-board.js', '../src/core/material-matrix.js']
  .forEach(function(m) {
    try { delete require.cache[require.resolve(m)]; } catch (e) {}
    require(m);
  });
var MM = global.window.MA.materialMatrix;

function at(s) { return new Date(s).toISOString(); }

// GPIO は 2 図種とも資料用あり (1 つは元のほうが新しい)。TIMER は 2 図種とも未着手。
var ENTRIES = [
  { name: 'GPIOドライバ状態遷移.puml', mtime: at('2026-09-14T10:00:00Z') },
  { name: 'GPIOドライバ状態遷移(資料用).puml', mtime: at('2026-09-14T11:00:00Z') },
  { name: 'GPIOドライバ初期化シーケンス.puml', mtime: at('2026-09-14T12:00:00Z') },
  { name: 'GPIOドライバ初期化シーケンス(資料用).puml', mtime: at('2026-09-14T09:00:00Z') },
  { name: 'TIMERドライバ状態遷移.puml', mtime: at('2026-09-14T08:00:00Z') },
  { name: 'TIMERドライバ初期化シーケンス.puml', mtime: at('2026-09-14T08:00:00Z') },
];

function rowOf(sc, component) {
  return sc.rows.filter(function(r) { return r.component === component; })[0];
}

function cellOf(sc, component, kind) {
  var row = rowOf(sc, component);
  return row.cells.filter(function(c) { return c.kind === kind; })[0];
}

describe('資料化の残り — 部品 × 図種', function() {
  test('部品を選ばなくても全部品の行が出る', function() {
    var sc = MM.scan(ENTRIES);
    expect(sc.rows.map(function(r) { return r.component; }).sort())
      .toEqual(['GPIOドライバ', 'TIMERドライバ']);
    expect(sc.kinds.length).toBe(2);
  });

  test('残りの多い部品が上に来る (次に着手する順)', function() {
    var sc = MM.scan(ENTRIES);
    expect(sc.rows[0].component).toBe('TIMERドライバ');
    expect(sc.rows[0].todo).toBe(2);
    expect(rowOf(sc, 'GPIOドライバ').todo).toBe(1);
  });

  test('セルの印は materialBoard の状態と一致する', function() {
    var sc = MM.scan(ENTRIES);
    expect(cellOf(sc, 'TIMERドライバ', '状態遷移図').status).toBe('none');
    expect(cellOf(sc, 'GPIOドライバ', '状態遷移図').status).toBe('fresh');
    expect(cellOf(sc, 'GPIOドライバ', 'シーケンス図').status).toBe('stale');
    expect(MM.cellMark(cellOf(sc, 'TIMERドライバ', '状態遷移図'))).toBe('未');
    expect(MM.cellMark(cellOf(sc, 'GPIOドライバ', '状態遷移図'))).toBe('済');
    expect(MM.cellMark(cellOf(sc, 'GPIOドライバ', 'シーケンス図'))).toBe('古');
  });

  test('元の図が無い図種は空のセル (未着手にしない)', function() {
    var sc = MM.scan(ENTRIES.concat([{ name: 'UARTドライバ派生クラス.puml', mtime: at('2026-09-14T08:00:00Z') }]));
    var c = cellOf(sc, 'GPIOドライバ', 'クラス図');
    expect(c.absent).toBe(true);
    expect(c.todo).toBe(false);
    expect(MM.cellMark(c)).toBe('');
  });

  test('見出しに残り件数と部品数が出る', function() {
    var t = MM.summaryText(MM.scan(ENTRIES));
    expect(t).toContain('残り 3 件');
    expect(t).toContain('2 部品');
  });

  test('行の説明でその部品に手を付けるべきか読める', function() {
    var sc = MM.scan(ENTRIES);
    expect(MM.rowText(rowOf(sc, 'TIMERドライバ'))).toContain('2 図種の資料化が要ります');
    expect(MM.rowText(rowOf(sc, 'GPIOドライバ'))).toContain('1 図種の資料化が要ります');
  });

  test('次の 1 マスは資料用なしを先に返す', function() {
    var n = MM.nextCell(MM.scan(ENTRIES));
    expect(n.component).toBe('TIMERドライバ');
    expect(n.cell.status).toBe('none');
  });

  test('全部最新なら次の 1 マスは無い', function() {
    var done = [
      { name: 'GPIOドライバ状態遷移.puml', mtime: at('2026-09-14T10:00:00Z') },
      { name: 'GPIOドライバ状態遷移(資料用).puml', mtime: at('2026-09-14T11:00:00Z') },
    ];
    var sc = MM.scan(done);
    expect(sc.todo).toBe(0);
    expect(MM.nextCell(sc)).toBe(null);
    expect(MM.summaryText(sc)).toContain('残り 0 件');
  });

  test('図がなければ見出しがそう言う', function() {
    var sc = MM.scan([]);
    expect(sc.rows.length).toBe(0);
    expect(MM.summaryText(sc)).toContain('図がありません');
  });

  test('凡例が 3 つの印を説明する', function() {
    expect(MM.legend()).toContain('未');
    expect(MM.legend()).toContain('古');
    expect(MM.legend()).toContain('済');
  });
});
