'use strict';
// BLK-junior-20260915-0106-wish: 部品単位の一括資料化。
// 表で「TIMER に N 図種残っている」と読めても、資料化は 1 マスずつしかできず、
// 図種を選び直して同じ往復を N 回繰り返していた。行まるごとに出せるように、
// 「その行で出す図種」と「押す前に読めるボタンの言葉」「流したあとの 1 行」を固定する。
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
var MB = global.window.MA.materialBoard;

function at(s) { return new Date(s).toISOString(); }

// GPIO は 2 図種とも資料用あり (シーケンスだけ元が新しい)。TIMER は 2 図種とも未着手。
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

describe('部品単位の一括資料化', function() {
  test('行で出す図種は、その行の未/古のマスだけ (最新は出し直さない)', function() {
    var sc = MM.scan(ENTRIES);
    expect(MM.todoKinds(rowOf(sc, 'TIMERドライバ')).sort())
      .toEqual(['シーケンス図', '状態遷移図'].sort());
    expect(MM.todoKinds(rowOf(sc, 'GPIOドライバ'))).toEqual(['シーケンス図']);
  });

  test('図種の並びは表の列と同じ (資料を作る順がそのまま図番号の順)', function() {
    var sc = MM.scan(ENTRIES);
    var kinds = MM.todoKinds(rowOf(sc, 'TIMERドライバ'));
    var order = sc.kinds.filter(function(k) { return kinds.indexOf(k) >= 0; });
    expect(kinds).toEqual(order);
  });

  test('押す前に何枚出るかがボタンの言葉から読める', function() {
    var sc = MM.scan(ENTRIES);
    expect(MM.rowRunLabel(rowOf(sc, 'TIMERドライバ'))).toBe('残り 2 図種をまとめて資料化');
    expect(MM.rowRunLabel(rowOf(sc, 'GPIOドライバ'))).toBe('残り 1 図種をまとめて資料化');
  });

  test('残りが無い部品は押せる言葉にしない', function() {
    var sc = MM.scan([
      { name: 'UARTドライバ状態遷移.puml', mtime: at('2026-09-14T08:00:00Z') },
      { name: 'UARTドライバ状態遷移(資料用).puml', mtime: at('2026-09-14T09:00:00Z') },
    ]);
    expect(MM.todoKinds(rowOf(sc, 'UARTドライバ'))).toEqual([]);
    expect(MM.rowRunLabel(rowOf(sc, 'UARTドライバ'))).toBe('すべて最新');
  });

  test('行の計画は 1 枚の資料化と同じ決まり (形式・題名) で作られる', function() {
    var sc = MM.scan(ENTRIES);
    var kinds = MM.todoKinds(rowOf(sc, 'TIMERドライバ'));
    var plans = MB.plans(ENTRIES, 'TIMERドライバ', kinds);
    expect(plans.length).toBe(2);
    plans.forEach(function(p) { expect(p.filename).toContain('(資料用)'); });
    var byKind = {};
    plans.forEach(function(p) { byKind[p.kind] = p; });
    // 状態遷移図は SVG、他は PNG — 決まりは materialExport が 1 か所で持つ。
    expect(byKind['状態遷移図'].filename.slice(-4)).toBe('.svg');
    expect(byKind['シーケンス図'].filename.slice(-4)).toBe('.png');
  });

  test('流している最中は、今どれを出しているかが読める', function() {
    expect(MM.rowProgressText('TIMERドライバ', '状態遷移図', 1, 2))
      .toBe('(1/2) TIMERドライバ の 状態遷移図 を資料化しています…');
  });

  test('終わったら、何図種出たかが 1 行で読める', function() {
    var msg = MM.rowDoneText('TIMERドライバ', [
      { ok: true, kind: '状態遷移図' }, { ok: true, kind: 'シーケンス図' },
    ]);
    expect(msg).toContain('TIMERドライバ');
    expect(msg).toContain('2 図種');
  });

  test('1 図種が落ちても残りは数え、どれが落ちたかまで言う', function() {
    var msg = MM.rowDoneText('TIMERドライバ', [
      { ok: true, kind: '状態遷移図' }, { ok: false, kind: 'シーケンス図' },
    ]);
    expect(msg).toContain('1 図種を資料化しました');
    expect(msg).toContain('シーケンス図');
  });

  test('出す図種が無ければ、そう言う (黙って何も起きない画面にしない)', function() {
    expect(MM.rowDoneText('UARTドライバ', [])).toContain('資料化の要る図種はありません');
  });
});
