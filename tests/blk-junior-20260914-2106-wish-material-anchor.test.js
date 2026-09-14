'use strict';
// BLK-junior-20260914-2106-wish: 資料化したマス (部品 × 図種) に「設計書のどの
// 見出しに貼るか」を 1 回登録すると、以後その対応が残り、設計書側から
// 「この見出しの最新画像はどれか」を逆引きできること。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/component-pack.js', '../src/core/material-export.js',
 '../src/core/material-board.js', '../src/core/material-matrix.js',
 '../src/core/material-anchor.js']
  .forEach(function(m) {
    try { delete require.cache[require.resolve(m)]; } catch (e) {}
    require(m);
  });
var MM = global.window.MA.materialMatrix;
var MA = global.window.MA.materialAnchor;

function at(s) { return new Date(s).toISOString(); }

// GPIO: 状態遷移は資料用が最新、シーケンスは元のほうが新しい。
// TIMER: 状態遷移は資料用なし。
var ENTRIES = [
  { name: 'GPIOドライバ状態遷移.puml', mtime: at('2026-09-14T10:00:00Z') },
  { name: 'GPIOドライバ状態遷移(資料用).puml', mtime: at('2026-09-14T11:00:00Z') },
  { name: 'GPIOドライバ初期化シーケンス.puml', mtime: at('2026-09-14T12:00:00Z') },
  { name: 'GPIOドライバ初期化シーケンス(資料用).puml', mtime: at('2026-09-14T09:00:00Z') },
  { name: 'TIMERドライバ状態遷移.puml', mtime: at('2026-09-14T08:00:00Z') },
];

function scan(ledger) {
  return MA.annotate(MM.scan(ENTRIES), ledger || {});
}

function cellOf(sc, component, kind) {
  var row = sc.rows.filter(function(r) { return r.component === component; })[0];
  return row.cells.filter(function(c) { return c.kind === kind; })[0];
}

describe('貼付先の見出し — 登録', function() {
  test('マスに登録した見出しがそのマスから読める', function() {
    var l = MA.set({}, 'TIMERドライバ', '状態遷移図', '4.3 状態遷移');
    expect(MA.get(l, 'TIMERドライバ', '状態遷移図')).toBe('4.3 状態遷移');
    // 別のマスには波及しない (部品ごと図種ごとに貼付先は違う)。
    expect(MA.get(l, 'GPIOドライバ', '状態遷移図')).toBe('');
  });

  test('空文字で登録を消せる (書き間違いが残り続けない)', function() {
    var l = MA.set(MA.set({}, 'GPIO', '状態遷移図', '4.3 状態遷移'), 'GPIO', '状態遷移図', '  ');
    expect(MA.get(l, 'GPIO', '状態遷移図')).toBe('');
    expect(Object.keys(l).length).toBe(0);
  });

  test('前後・連続の空白は揃える (同じ見出しが 2 行に割れない)', function() {
    var l = MA.set({}, 'GPIO', '状態遷移図', '  4.3\t 状態遷移 ');
    expect(MA.get(l, 'GPIO', '状態遷移図')).toBe('4.3 状態遷移');
  });

  test('壊れた台帳を読んでも空の見出しの行を作らない', function() {
    var l = MA.normalize({ 'こわれた鍵': '4.3', 'AB': '', 'CD': { heading: '5.1 構成' } });
    expect(Object.keys(l)).toEqual(['CD']);
    expect(MA.get(l, 'C', 'D')).toBe('5.1 構成');
  });

  test('候補の見出しは章番号の順に出る (4.10 が 4.3 の前に来ない)', function() {
    var l = MA.set(MA.set(MA.set({}, 'A', '状態遷移図', '4.10 異常系'),
      'B', '状態遷移図', '4.3 状態遷移'), 'C', 'クラス図', '4.3 状態遷移');
    expect(MA.headings(l)).toEqual(['4.3 状態遷移', '4.10 異常系']);
  });
});

describe('貼付先の見出し — 表への反映', function() {
  test('登録済みのマスに印が付き、何マス残っているかが 1 行で出る', function() {
    var l = MA.set({}, 'TIMERドライバ', '状態遷移図', '4.3 状態遷移');
    var sc = scan(l);
    expect(cellOf(sc, 'TIMERドライバ', '状態遷移図').anchored).toBe(true);
    expect(cellOf(sc, 'TIMERドライバ', '状態遷移図').heading).toBe('4.3 状態遷移');
    expect(cellOf(sc, 'GPIOドライバ', '状態遷移図').anchored).toBe(false);
    expect(sc.anchored).toBe(1);
    expect(sc.anchorTotal).toBe(3);
    expect(MA.summaryText(sc)).toContain('1 / 3 マス登録済み');
    expect(MA.summaryText(sc)).toContain('未登録 2');
  });

  test('元の図が無い図種のマスは数に入らない (資料化しようがない)', function() {
    var sc = scan({});
    var timerSeq = cellOf(sc, 'TIMERドライバ', 'シーケンス図');
    expect(timerSeq.absent).toBe(true);
    expect(timerSeq.anchored).toBe(false);
    expect(sc.anchorTotal).toBe(3);
  });

  test('未登録のマスは、押す前に未登録と読める', function() {
    expect(MA.cellText('TIMERドライバ', '状態遷移図', '')).toContain('未登録');
    expect(MA.cellText('TIMERドライバ', '状態遷移図', '4.3 状態遷移')).toContain('4.3 状態遷移');
  });
});

describe('貼付先の見出し — 設計書からの逆引き', function() {
  function ledger() {
    var l = MA.set({}, 'GPIOドライバ', '状態遷移図', '4.3 状態遷移');
    l = MA.set(l, 'GPIOドライバ', 'シーケンス図', '4.10 初期化シーケンス');
    l = MA.set(l, 'TIMERドライバ', '状態遷移図', '4.2 タイマ状態遷移');
    return l;
  }

  test('見出しの順 (章番号順) に、そこへ貼る画像が並ぶ', function() {
    var l = ledger();
    var rows = MA.lookup(scan(l), l);
    expect(rows.map(function(r) { return r.heading; }))
      .toEqual(['4.2 タイマ状態遷移', '4.3 状態遷移', '4.10 初期化シーケンス']);
    expect(rows[1].filename).toBe('GPIOドライバ状態遷移(資料用).svg');
  });

  test('画像がまだ無い・古い見出しはそう読める (貼ってから気付かない)', function() {
    var l = ledger();
    var rows = MA.lookup(scan(l), l);
    var byHead = {};
    rows.forEach(function(r) { byHead[r.heading] = r; });
    expect(byHead['4.2 タイマ状態遷移'].status).toBe('none');
    expect(MA.lookupText(byHead['4.2 タイマ状態遷移'])).toContain('まだありません');
    expect(byHead['4.10 初期化シーケンス'].status).toBe('stale');
    expect(MA.lookupText(byHead['4.10 初期化シーケンス'])).toContain('元の図のほうが新しい');
    expect(byHead['4.3 状態遷移'].status).toBe('fresh');
  });

  test('貼れる見出しと手当ての要る見出しの数が 1 行で出る', function() {
    var l = ledger();
    var rows = MA.lookup(scan(l), l);
    expect(MA.lookupSummary(rows)).toBe('3 見出し（貼れる 1・手当てが要る 2）');
    expect(MA.lookupSummary([])).toContain('まだ登録されていません');
  });

  test('登録が無ければ逆引きは空 (登録済みのマスだけが並ぶ)', function() {
    expect(MA.lookup(scan({}), {})).toEqual([]);
  });
});
