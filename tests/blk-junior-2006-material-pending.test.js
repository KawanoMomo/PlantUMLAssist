'use strict';
// BLK-junior-20260914-2006: 「1 枚を資料化」の部品欄は先頭の部品で開き、図種欄には
// その部品の図種しか出ない。ほぼ資料化済みの部品 (GPIO) が先頭に来ていると、実際に
// 手を付けるべき部品 (TIMER、全図種未着手) は部品欄を 1 つずつ選び直して図種欄を
// 見るまで分からなかった。部品ごとの残りを数え、開いた時点で並べて出す。
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

// 起票時の形。GPIO は 3 図種のうち 2 図種が済み・1 図種が作り直し、
// TIMER は 2 図種とも資料用なし (全図種未着手)。
var ENTRIES = [
  { name: 'GPIOドライバ状態遷移.puml', mtime: at('2026-09-14T10:00:00Z') },
  { name: 'GPIOドライバ状態遷移(資料用).puml', mtime: at('2026-09-14T11:00:00Z') },
  { name: 'GPIOドライバ初期化シーケンス.puml', mtime: at('2026-09-14T12:00:00Z') },
  { name: 'GPIOドライバ初期化シーケンス(資料用).puml', mtime: at('2026-09-14T09:00:00Z') },
  { name: 'GPIOドライバ派生クラス.puml', mtime: at('2026-09-14T08:00:00Z') },
  { name: 'GPIOドライバ派生クラス(資料用).puml', mtime: at('2026-09-14T13:00:00Z') },
  { name: 'TIMERドライバ初期化シーケンス.puml', mtime: at('2026-09-14T08:00:00Z') },
  { name: 'TIMERドライバ状態遷移.puml', mtime: at('2026-09-14T08:00:00Z') },
];

function byName(list) {
  var out = {};
  list.forEach(function(r) { out[r.component] = r; });
  return out;
}

describe('資料化 — 部品をまたいだ残り (BLK-junior-20260914-2006)', function() {

  test('componentProgress は部品ごとに「残り / 全図種」を数える', function() {
    var m = byName(MB.componentProgress(ENTRIES));
    expect(m['TIMERドライバ'].total).toBe(2);
    expect(m['TIMERドライバ'].pending).toBe(2);
    expect(m['TIMERドライバ'].none).toBe(2);
    expect(m['GPIOドライバ'].total).toBe(3);
    // 状態遷移は最新、クラスは最新、シーケンスだけ元が新しい
    expect(m['GPIOドライバ'].pending).toBe(1);
    expect(m['GPIOドライバ'].stale).toBe(1);
    expect(m['GPIOドライバ'].fresh).toBe(2);
  });

  test('componentProgress の数え方は 1 部品の表 (rows) と食い違わない', function() {
    MB.componentProgress(ENTRIES).forEach(function(r) {
      var rows = MB.rows(ENTRIES, r.component);
      expect(r.total).toBe(rows.length);
      expect(r.pending).toBe(MB.pendingKinds(rows).length);
    });
  });

  test('firstPending は残りの多い部品を選ぶ (先頭の GPIO で開かない)', function() {
    expect(MB.firstPending(ENTRIES)).toBe('TIMERドライバ');
  });

  test('残りがどこにも無ければ先頭の部品のまま (選び直す理由が無い)', function() {
    var done = [
      { name: 'GPIOドライバ状態遷移.puml', mtime: at('2026-09-14T10:00:00Z') },
      { name: 'GPIOドライバ状態遷移(資料用).puml', mtime: at('2026-09-14T11:00:00Z') },
    ];
    expect(MB.firstPending(done)).toBe('GPIOドライバ');
    expect(MB.componentProgress(done)[0].pending).toBe(0);
  });

  test('図が 1 枚も無ければ選ぶ部品も無い (空文字を返して落ちない)', function() {
    expect(MB.firstPending([])).toBe('');
    expect(MB.componentProgress([])).toEqual([]);
    expect(MB.progressSummary([])).toBe('');
  });

  test('pendingComponents は残りのある部品だけを、多い順に並べる', function() {
    var list = MB.pendingComponents(ENTRIES);
    expect(list.map(function(r) { return r.component; })).toEqual(['TIMERドライバ', 'GPIOドライバ']);
  });

  test('progressLabel は部品欄の行に残りを書く', function() {
    var m = byName(MB.componentProgress(ENTRIES));
    expect(MB.progressLabel(m['TIMERドライバ'])).toBe('TIMERドライバ（資料化が要る 2 / 2 図種）');
  });

  test('progressLabel は残り 0 でも黙らない (済んでいると言い切る)', function() {
    var m = byName(MB.componentProgress([
      { name: 'UARTドライバ状態遷移.puml', mtime: at('2026-09-14T08:00:00Z') },
      { name: 'UARTドライバ状態遷移(資料用).puml', mtime: at('2026-09-14T09:00:00Z') },
    ]));
    expect(MB.progressLabel(m['UARTドライバ'])).toBe('UARTドライバ（1 図種すべて最新）');
  });

  test('progressSummary は全部品を見渡した残りを 1 行で言う', function() {
    expect(MB.progressSummary(ENTRIES))
      .toBe('2 部品／資料化が要るのは 2 部品（TIMERドライバ 2・GPIOドライバ 1）');
  });

  test('progressSummary は全部済んでいれば「すべて最新」と言う', function() {
    expect(MB.progressSummary([
      { name: 'UARTドライバ状態遷移.puml', mtime: at('2026-09-14T08:00:00Z') },
      { name: 'UARTドライバ状態遷移(資料用).puml', mtime: at('2026-09-14T09:00:00Z') },
    ])).toBe('1 部品すべて最新');
  });

  test('日時が取れない一覧でも落ちず、資料用があれば最新に倒さない', function() {
    var noTime = ['GPIOドライバ状態遷移.puml', 'GPIOドライバ状態遷移(資料用).puml'];
    var m = byName(MB.componentProgress(noTime));
    expect(m['GPIOドライバ'].total).toBe(1);
    expect(m['GPIOドライバ'].fresh).toBe(1);
    expect(MB.firstPending(noTime)).toBe('GPIOドライバ');
  });
});
