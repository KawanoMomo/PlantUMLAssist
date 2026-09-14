'use strict';
// BLK-junior-20260909-0003-wish: 「部品の資料一式」— 部品を選ぶと図種が全部並び、
// 資料用がまだ無い図種・元のほうが新しい図種が一目で分かり、手当ての要るものだけを
// まとめて書き出せる。形式の決まりは materialExport の 1 か所のままであることも固定する。
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

// GPIO は 3 図種。状態遷移は資料用が最新、シーケンスは元のほうが新しい (作り直し)、
// クラスは資料用がまだ無い。
var ENTRIES = [
  { name: 'GPIOドライバ状態遷移.puml', mtime: at('2026-09-08T10:00:00Z') },
  { name: 'GPIOドライバ状態遷移(資料用).puml', mtime: at('2026-09-08T11:00:00Z') },
  { name: 'GPIOドライバ初期化シーケンス.puml', mtime: at('2026-09-08T12:00:00Z') },
  { name: 'GPIOドライバ初期化シーケンス(資料用).puml', mtime: at('2026-09-08T09:00:00Z') },
  { name: 'GPIOドライバ派生クラス.puml', mtime: at('2026-09-08T08:00:00Z') },
  { name: 'UARTドライバ状態遷移.puml', mtime: at('2026-09-08T08:00:00Z') },
];

function byKind(list) {
  var out = {};
  list.forEach(function(r) { out[r.kind] = r; });
  return out;
}

describe('資料一式 — 図種ごとの状態', function() {
  test('部品を選ぶと、その部品の図種が全部並ぶ', function() {
    var r = MB.rows(ENTRIES, 'GPIOドライバ');
    expect(r.map(function(x) { return x.kind; })).toEqual(['クラス図', 'シーケンス図', '状態遷移図']);
  });

  test('資料用がまだ無い図種は「資料用なし」', function() {
    var r = byKind(MB.rows(ENTRIES, 'GPIOドライバ'))['クラス図'];
    expect(r.status).toBe('none');
    expect(r.statusLabel).toBe('資料用なし');
    expect(r.material).toBe('');
    expect(r.needsWork).toBe(true);
  });

  test('元のほうが新しい図種は「元が新しい」（古い資料を最新と言わない）', function() {
    var r = byKind(MB.rows(ENTRIES, 'GPIOドライバ'))['シーケンス図'];
    expect(r.status).toBe('stale');
    expect(r.material).toBe('GPIOドライバ初期化シーケンス(資料用).puml');
    expect(r.needsWork).toBe(true);
    expect(MB.rowText(r)).toContain('新しい');
  });

  test('資料用のほうが新しい図種は「最新」で、作り直しの対象にならない', function() {
    var r = byKind(MB.rows(ENTRIES, 'GPIOドライバ'))['状態遷移図'];
    expect(r.status).toBe('fresh');
    expect(r.needsWork).toBe(false);
  });

  test('日時が分からないときは「最新」に倒さない', function() {
    var noTime = ENTRIES.map(function(e) { return e.name; });
    var r = byKind(MB.rows(noTime, 'GPIOドライバ'));
    expect(r['クラス図'].status).toBe('none');
    expect(r['状態遷移図'].status).toBe('fresh');
    expect(r['シーケンス図'].status).toBe('fresh');
  });

  test('元の版が無く資料用しか残っていなくても行は消えない', function() {
    var only = [{ name: 'GPIOドライバ派生クラス(資料用).puml', mtime: at('2026-09-08T08:00:00Z') }];
    var r = MB.rows(only, 'GPIOドライバ');
    expect(r.length).toBe(1);
    expect(r[0].kind).toBe('クラス図');
    expect(r[0].source).toBe('GPIOドライバ派生クラス(資料用).puml');
  });

  test('他の部品の図は混ざらない', function() {
    var r = MB.rows(ENTRIES, 'UARTドライバ');
    expect(r.map(function(x) { return x.kind; })).toEqual(['状態遷移図']);
  });
});

describe('資料一式 — 形式は 1 枚の資料化と同じ決まり', function() {
  test('状態遷移図は SVG、他は PNG（透過背景）', function() {
    var r = byKind(MB.rows(ENTRIES, 'GPIOドライバ'));
    expect(r['状態遷移図'].format).toBe('svg');
    expect(r['状態遷移図'].filename).toBe('GPIOドライバ状態遷移(資料用).svg');
    expect(r['シーケンス図'].format).toBe('png-transparent');
    expect(r['シーケンス図'].filename).toBe('GPIOドライバ初期化シーケンス(資料用).png');
  });
});

describe('資料一式 — まとめて書き出す', function() {
  test('既定で選ばれるのは手当ての要る図種だけ', function() {
    var r = MB.rows(ENTRIES, 'GPIOドライバ');
    expect(MB.pendingKinds(r).sort()).toEqual(['クラス図', 'シーケンス図']);
  });

  test('計画は資料の並び順で、選んだ図種のぶんだけ出る', function() {
    var ps = MB.plans(ENTRIES, 'GPIOドライバ', ['状態遷移図', 'クラス図']);
    expect(ps.map(function(p) { return p.kind; })).toEqual(['クラス図', '状態遷移図']);
    expect(ps[0].filename).toBe('GPIOドライバ派生クラス(資料用).png');
    expect(ps[1].filename).toBe('GPIOドライバ状態遷移(資料用).svg');
  });

  test('その部品に無い図種を渡しても計画にならない', function() {
    expect(MB.plans(ENTRIES, 'UARTドライバ', ['クラス図']).length).toBe(0);
    expect(MB.plans(ENTRIES, '無い部品', ['状態遷移図']).length).toBe(0);
  });

  test('ボタンの文言に選んだ枚数が出る', function() {
    expect(MB.runText([1, 2])).toContain('2 図種');
  });
});

describe('資料一式 — 画面の見出しと結果', function() {
  test('見出しに内訳と「何図種の資料化が要るか」が出る', function() {
    var t = MB.summaryText(MB.rows(ENTRIES, 'GPIOドライバ'));
    expect(t).toContain('3 図種');
    expect(t).toContain('資料用なし 1');
    expect(t).toContain('元が新しい 1');
    expect(t).toContain('2 図種の資料化が要ります');
  });

  test('全部最新ならそう言う', function() {
    var e = [
      { name: 'CANドライバ状態遷移.puml', mtime: at('2026-09-08T08:00:00Z') },
      { name: 'CANドライバ状態遷移(資料用).puml', mtime: at('2026-09-08T09:00:00Z') },
    ];
    expect(MB.summaryText(MB.rows(e, 'CANドライバ'))).toContain('すべて最新');
  });

  test('図が 1 枚も無ければその旨を言う', function() {
    expect(MB.emptyText([])).toContain('図がありません');
    expect(MB.emptyText(ENTRIES)).toBe('');
  });

  test('結果は成功枚数と失敗した図種を 1 行で言う', function() {
    expect(MB.doneMessage([{ ok: true, kind: 'クラス図' }, { ok: true, kind: 'シーケンス図' }]))
      .toContain('2 図種を資料化しました');
    var m = MB.doneMessage([{ ok: true, kind: 'クラス図' }, { ok: false, kind: 'シーケンス図' }]);
    expect(m).toContain('1 図種が失敗');
    expect(m).toContain('シーケンス図');
    expect(MB.doneMessage([])).toContain('選ばれていません');
  });
});
