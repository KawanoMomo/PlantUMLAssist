'use strict';
// BLK-junior-20260914-2206: 「1 枚を資料化…」の部品欄に「TIMERドライバ（資料化が要る
// 2/5 図種）」と「TimerDrv派生クラス図（資料化が要る 1/1 図種）」が並び、先頭が
// 似ている (ローマ字表記かカナ表記かの差しかない) ので上を選んでしまった。図種欄に
// 目当ての「クラス図」が出ず、資料化する寸前で別部品と気付く。選び間違えたまま
// 進めば無関係な画像を上書き書き出しするところだった。
//
// 部品欄の行にその部品の図種を並べれば、選ぶ前に「クラス図を持つのはどちらか」が
// 読める。並びは図種欄と同じ (手当ての要るものが先) にして、選び直しても目が迷わない。
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

// 起票時の形。TIMERドライバ はユースケースだけ資料化済みで、クラス図は持たない。
// TimerDrv (派生クラス図) はクラス図 1 枚だけ。
var ENTRIES = [
  { name: 'TIMERドライバユースケース.puml', mtime: at('2026-09-14T08:00:00Z') },
  { name: 'TIMERドライバユースケース(資料用).puml', mtime: at('2026-09-14T09:00:00Z') },
  { name: 'TIMERドライバ初期化シーケンス.puml', mtime: at('2026-09-14T08:00:00Z') },
  { name: 'TIMERドライバ状態遷移.puml', mtime: at('2026-09-14T08:00:00Z') },
  { name: 'TimerDrv派生クラス.puml', mtime: at('2026-09-14T08:00:00Z') },
];

function byName(list) {
  var out = {};
  list.forEach(function(r) { out[r.component] = r; });
  return out;
}

describe('資料化 — 部品欄でその部品の図種が読める (BLK-junior-20260914-2206)', function() {

  test('componentProgress は部品ごとの図種を、図種欄と同じ並びで持つ', function() {
    var m = byName(MB.componentProgress(ENTRIES));
    // 並びは rows と同じ (設計書に貼る図番号順)。
    expect(m['TIMERドライバ'].kinds).toEqual(['ユースケース図', 'シーケンス図', '状態遷移図']);
    expect(m['TIMERドライバ'].pendingKinds).toEqual(['シーケンス図', '状態遷移図']);
    expect(m['TimerDrv'].kinds).toEqual(['クラス図']);
  });

  test('数えた図種は 1 部品の表 (rows) と食い違わない', function() {
    MB.componentProgress(ENTRIES).forEach(function(r) {
      var rows = MB.rows(ENTRIES, r.component);
      expect(r.kinds).toEqual(rows.map(function(x) { return x.kind; }));
      expect(r.pendingKinds).toEqual(MB.pendingKinds(rows));
    });
  });

  test('kindsLabel は図種欄の並び (手当ての要るものが先) で並べる', function() {
    var m = byName(MB.componentProgress(ENTRIES));
    expect(MB.kindsLabel(m['TIMERドライバ'])).toBe('シーケンス図・状態遷移図・ユースケース図');
    var rows = MB.rows(ENTRIES, 'TIMERドライバ');
    expect(MB.kindsLabel(m['TIMERドライバ']).split('・')).toEqual(MB.kindOrder(rows));
  });

  test('到達条件: 選ぶ前に「クラス図を持つのはどちらか」が部品欄で読める', function() {
    var m = byName(MB.componentProgress(ENTRIES));
    var timer = MB.progressLabel(m['TIMERドライバ']);
    var drv = MB.progressLabel(m['TimerDrv']);
    expect(timer).toBe('TIMERドライバ（資料化が要る 2 / 3 図種：シーケンス図・状態遷移図・ユースケース図）');
    expect(drv).toBe('TimerDrv（資料化が要る 1 / 1 図種：クラス図）');
    // 先頭が似ていても、クラス図の在り処は行を読むだけで分かれる。
    expect(timer.indexOf('クラス図')).toBe(-1);
    expect(drv.indexOf('クラス図') > 0).toBe(true);
  });

  test('残り 0 の部品も図種名を出す (開いて確かめ直さない)', function() {
    var m = byName(MB.componentProgress([
      { name: 'UARTドライバ状態遷移.puml', mtime: at('2026-09-14T08:00:00Z') },
      { name: 'UARTドライバ状態遷移(資料用).puml', mtime: at('2026-09-14T09:00:00Z') },
    ]));
    expect(MB.progressLabel(m['UARTドライバ'])).toBe('UARTドライバ（1 図種すべて最新：状態遷移図）');
  });

  test('図種が取れない行でも落ちず、今までどおりの文面に戻る', function() {
    expect(MB.kindsLabel(null)).toBe('');
    expect(MB.kindsLabel({ component: 'X', kinds: [] })).toBe('');
    expect(MB.progressLabel({ component: 'X', total: 2, pending: 1, kinds: [] }))
      .toBe('X（資料化が要る 1 / 2 図種）');
  });
});
