'use strict';
// BLK-reviewer-20260907-1803-wish: 変更図の旧DSL/新DSLを並べて出す。
var fs = require('fs');
var path = require('path');
var win = {};
new Function('window', fs.readFileSync(path.join(__dirname, '../src/core/review-diff.js'), 'utf-8'))(win);
var RD = win.MA.reviewDiff;

function kinds(rows) { return rows.map(function(r) { return r.kind; }); }

function fakeStorage(initial) {
  var store = initial || {};
  return {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function(k, v) { store[k] = String(v); },
    _store: store,
  };
}

describe('reviewDiff.normalize', function() {
  test('CRLF と行末空白と末尾の空行は差分にしない', function() {
    expect(RD.normalize('a \r\nb\t\n\n\n')).toBe('a\nb');
  });
  test('null は空文字', function() {
    expect(RD.normalize(null)).toBe('');
  });
});

describe('reviewDiff.align', function() {
  test('同じ本文なら全行 same', function() {
    expect(kinds(RD.align('a\nb\nc', 'a\nb\nc'))).toEqual(['same', 'same', 'same']);
  });
  test('行を足したら add が並ぶ', function() {
    var rows = RD.align('a\nc', 'a\nb\nc');
    expect(kinds(rows)).toEqual(['same', 'add', 'same']);
    expect(rows[1].right).toBe('b');
    expect(rows[1].left).toBe(null);
  });
  test('行を消したら del が並ぶ', function() {
    var rows = RD.align('a\nb\nc', 'a\nc');
    expect(kinds(rows)).toEqual(['same', 'del', 'same']);
    expect(rows[1].left).toBe('b');
  });
  test('1 行の書き換えは change として左右に並ぶ', function() {
    var rows = RD.align('a\nold\nc', 'a\nnew\nc');
    expect(kinds(rows)).toEqual(['same', 'change', 'same']);
    expect(rows[1].left).toBe('old');
    expect(rows[1].right).toBe('new');
  });
  test('行番号は左右それぞれ 1 始まり、無い側は null', function() {
    var rows = RD.align('a\nc', 'a\nb\nc');
    expect(rows[1].leftNo).toBe(null);
    expect(rows[1].rightNo).toBe(2);
    expect(rows[2].leftNo).toBe(2);
    expect(rows[2].rightNo).toBe(3);
  });
  test('旧版が空なら全行 add', function() {
    expect(kinds(RD.align('', 'a\nb'))).toEqual(['add', 'add']);
  });
  test('新版が空なら全行 del', function() {
    expect(kinds(RD.align('a\nb', ''))).toEqual(['del', 'del']);
  });
  test('両方空なら行なし', function() {
    expect(RD.align('', '').length).toBe(0);
  });
  test('削除が多く追加が少ないときは余った削除が del で残る', function() {
    var rows = RD.align('x\ny\nz', 'w');
    expect(kinds(rows)).toEqual(['change', 'del', 'del']);
  });
});

describe('reviewDiff.stats / statsText', function() {
  test('種類ごとに数える', function() {
    var s = RD.stats(RD.align('a\nb\nold', 'a\nnew\nb\nc'));
    expect(s.same).toBe(2);
    expect(s.added).toBe(1);
    expect(s.changed).toBe(1);
  });
  test('差分が無ければ「差分なし」', function() {
    expect(RD.statsText(RD.stats(RD.align('a', 'a')))).toBe('差分なし');
  });
  test('件数を日本語 1 行にする', function() {
    var s = { same: 1, added: 2, removed: 3, changed: 4 };
    expect(RD.statsText(s)).toBe('書換 4 行 / 追加 2 行 / 削除 3 行');
  });
});

describe('reviewDiff.fold', function() {
  test('変更行の前後 context だけ残して間を skip に畳む', function() {
    var rows = RD.align('1\n2\n3\n4\n5\n6\n7\n8\n9', '1\n2\n3\n4\n5\n6\n7\n8\nX');
    var folded = RD.fold(rows, 1);
    expect(kinds(folded)).toEqual(['skip', 'same', 'change']);
    expect(folded[0].count).toBe(7);
  });
  test('context を 0 にすると変更行だけ残る', function() {
    var folded = RD.fold(RD.align('1\n2\n3', '1\nX\n3'), 0);
    expect(kinds(folded)).toEqual(['skip', 'change', 'skip']);
  });
  test('全部同じなら 1 つの skip になる', function() {
    var folded = RD.fold(RD.align('a\nb', 'a\nb'), 2);
    expect(kinds(folded)).toEqual(['skip']);
    expect(folded[0].count).toBe(2);
  });
});

describe('reviewDiff の控え', function() {
  test('保存フォルダごとに鍵が分かれる', function() {
    expect(RD.storageKey('./out')).toBe('pua.review.body:./out');
    expect(RD.storageKey(null)).toBe('pua.review.body:./autosave');
  });
  test('save した本文を load で取り戻せる (正規化されて入る)', function() {
    var st = fakeStorage();
    RD.save(st, './autosave', { 'a.puml': 'x \r\ny\n\n' });
    expect(RD.load(st, './autosave')['a.puml']).toBe('x\ny');
  });
  test('壊れた控えは空として扱う', function() {
    var st = fakeStorage({ 'pua.review.body:./autosave': '{[' });
    expect(RD.load(st, './autosave')).toEqual({});
  });
  test('控えの無いフォルダは空', function() {
    expect(RD.load(fakeStorage(), './autosave')).toEqual({});
  });
});

describe('reviewDiff.compare', function() {
  test('控えのある図は旧版と突き合わせる', function() {
    var r = RD.compare({ 'a.puml': 'a\nold' }, 'a.puml', 'a\nnew');
    expect(r.hasBefore).toBe(true);
    expect(kinds(r.rows)).toEqual(['same', 'change']);
    expect(r.stats.changed).toBe(1);
  });
  test('控えの無い図は旧版なしとして全行 add', function() {
    var r = RD.compare({}, 'b.puml', 'a\nb');
    expect(r.hasBefore).toBe(false);
    expect(kinds(r.rows)).toEqual(['add', 'add']);
  });
});
