'use strict';
// BLK-junior-20260914-2106: 図種欄に［未］／［古］／［済］の印は付いたが、並びは
// 図番号順のままだった。欲しい図種を上から目で探して印を読み比べることになるので、
// 手当ての要る図種を先頭にまとめる。同じ状態の中は図番号順 (資料を作る順) を保つ。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/component-pack.js', '../src/core/material-export.js', '../src/core/material-board.js']
  .forEach(function(m) {
    try { delete require.cache[require.resolve(m)]; } catch (e) {}
    require(m);
  });
var MB = global.window.MA.materialBoard;

function at(s) { return new Date(s).toISOString(); }

// 起票時の TIMER に近い形。シーケンスだけ資料化済み、クラスは元が新しくなって
// いて作り直し、残り (状態遷移・コンポーネント) は資料用がまだ無い。
var ENTRIES = [
  { name: 'TIMERドライバ初期化シーケンス.puml', mtime: at('2026-09-14T08:00:00Z') },
  { name: 'TIMERドライバ初期化シーケンス(資料用).puml', mtime: at('2026-09-14T09:00:00Z') },
  { name: 'TIMERドライバ派生クラス.puml', mtime: at('2026-09-14T12:00:00Z') },
  { name: 'TIMERドライバ派生クラス(資料用).puml', mtime: at('2026-09-14T10:00:00Z') },
  { name: 'TIMERドライバ状態遷移.puml', mtime: at('2026-09-14T08:00:00Z') },
];

describe('資料化 — 図種欄の並び (BLK-junior-20260914-2106)', function() {

  test('表 (資料一式ボード) の並びは図番号順のまま変えない', function() {
    var rows = MB.rows(ENTRIES, 'TIMERドライバ');
    var kinds = rows.map(function(r) { return r.kind; });
    // componentPack の KIND_ORDER 順であること (状態で並べ替えていない)。
    var cp = global.window.MA.componentPack;
    var ranks = kinds.map(function(k) { return cp.KIND_ORDER.indexOf(k); });
    for (var i = 1; i < ranks.length; i++) expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
  });

  test('kindOrder は［未］→［古］→［済］の順にまとめる', function() {
    var rows = MB.rows(ENTRIES, 'TIMERドライバ');
    var byKind = {};
    rows.forEach(function(r) { byKind[r.kind] = r.status; });
    var order = MB.kindOrder(rows);
    expect(order.length).toBe(rows.length);
    var rank = { none: 0, stale: 1, fresh: 2 };
    var seq = order.map(function(k) { return rank[byKind[k]]; });
    for (var i = 1; i < seq.length; i++) expect(seq[i] >= seq[i - 1]).toBe(true);
    // 起票者が探していた状態遷移図 (資料用なし) が先頭側に来る。
    expect(order.indexOf('状態遷移図')).toBeLessThan(order.indexOf('シーケンス図'));
    // 済んだ図種は最後尾。
    expect(order[order.length - 1]).toBe('シーケンス図');
  });

  test('同じ状態の中は元の並び (図番号順) を保つ', function() {
    var rows = [
      { kind: 'コンポーネント図', status: 'none' },
      { kind: 'アクティビティ図', status: 'none' },
      { kind: 'シーケンス図', status: 'fresh' },
      { kind: 'ユースケース図', status: 'none' },
      { kind: '状態遷移図', status: 'stale' },
    ];
    expect(MB.kindOrder(rows)).toEqual(
      ['コンポーネント図', 'アクティビティ図', 'ユースケース図', '状態遷移図', 'シーケンス図']);
  });

  test('状態を持たない行・空の入力でも壊れない', function() {
    expect(MB.kindOrder(null)).toEqual([]);
    expect(MB.kindOrder([{ kind: 'A' }, { kind: '', status: 'none' }, null])).toEqual(['A']);
  });
});
