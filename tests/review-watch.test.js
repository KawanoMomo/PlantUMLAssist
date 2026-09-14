'use strict';
// BLK-reviewer-20260907-1403: 保存フォルダの図が「前回見た版」から変わったかを憶える。
var fs = require('fs');
var path = require('path');
var win = {};
new Function('window', fs.readFileSync(path.join(__dirname, '../src/core/review-watch.js'), 'utf-8'))(win);
var RW = win.MA.reviewWatch;

function entry(name, hash, mtime) {
  return { name: name, hash: hash, mtime: mtime || '2026-09-07T05:00:00Z' };
}

function fakeStorage(initial) {
  var store = initial || {};
  return {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function(k, v) { store[k] = String(v); },
    _store: store,
  };
}

describe('reviewWatch.snapshot', function() {
  test('図名 → 指紋 の控えにする', function() {
    expect(RW.snapshot([entry('a', 'h1'), entry('b', 'h2')])).toEqual({ a: 'h1', b: 'h2' });
  });
  test('名前だけの一覧 (古い server) でも落ちない', function() {
    expect(RW.snapshot(['a'])).toEqual({ a: null });
  });
  test('空・null は空の控え', function() {
    expect(RW.snapshot(null)).toEqual({});
  });
});

describe('reviewWatch.diff', function() {
  test('控えに無い図は new', function() {
    expect(RW.diff({}, [entry('a', 'h1')])[0].status).toBe('new');
  });
  test('指紋が同じなら unchanged', function() {
    expect(RW.diff({ a: 'h1' }, [entry('a', 'h1')])[0].status).toBe('unchanged');
  });
  test('指紋が違えば changed', function() {
    expect(RW.diff({ a: 'h1' }, [entry('a', 'h2')])[0].status).toBe('changed');
  });
  test('保存し直しただけで中身が同じなら unchanged のまま', function() {
    var rows = RW.diff({ a: 'h1' }, [entry('a', 'h1', '2026-09-07T09:00:00Z')]);
    expect(rows[0].status).toBe('unchanged');
    expect(rows[0].mtime).toBe('2026-09-07T09:00:00Z');
  });
  test('指紋が取れない図は changed に倒す (見落とすより読み直す)', function() {
    expect(RW.diff({ a: 'h1' }, [entry('a', null)])[0].status).toBe('changed');
  });
  test('一覧の並びを保つ', function() {
    var rows = RW.diff({}, [entry('b', 'h'), entry('a', 'h')]);
    expect(rows.map(function(r) { return r.name; })).toEqual(['b', 'a']);
  });
});

describe('reviewWatch.removed', function() {
  test('控えにあって今は無い図を挙げる', function() {
    expect(RW.removed({ a: 'h', b: 'h' }, [entry('a', 'h')])).toEqual(['b']);
  });
  test('消えた図が無ければ空', function() {
    expect(RW.removed({ a: 'h' }, [entry('a', 'h')])).toEqual([]);
  });
});

describe('reviewWatch.summary', function() {
  test('全部そのままなら読むものが無いと言い切る', function() {
    var rows = RW.diff({ a: 'h', b: 'h' }, [entry('a', 'h'), entry('b', 'h')]);
    expect(RW.summary(rows)).toBe('2 枚すべて前回見た版のままです');
  });
  test('変更と新規の枚数を出す', function() {
    var rows = RW.diff({ a: 'h1', b: 'h' }, [entry('a', 'h2'), entry('b', 'h'), entry('c', 'h')]);
    expect(RW.summary(rows)).toContain('変更 1 枚');
    expect(RW.summary(rows)).toContain('新規 1 枚');
    expect(RW.summary(rows)).toContain('残り 1 枚');
  });
  test('図が無ければそう言う', function() {
    expect(RW.summary([])).toBe('保存フォルダに図がありません');
  });
});

describe('reviewWatch.toReview', function() {
  test('読むべき図だけを名前で返す', function() {
    var rows = RW.diff({ a: 'h1', b: 'h' }, [entry('a', 'h2'), entry('b', 'h'), entry('c', 'h')]);
    expect(RW.toReview(rows)).toEqual(['a', 'c']);
  });
  test('変更が無い日は空 (機械監査を回す必要が無い)', function() {
    expect(RW.toReview(RW.diff({ a: 'h' }, [entry('a', 'h')]))).toEqual([]);
  });
});

describe('reviewWatch.formatMtime', function() {
  test('MM/DD HH:MM にする', function() {
    var d = new Date('2026-09-07T05:04:00Z');
    function p(n) { return (n < 10 ? '0' : '') + n; }
    var want = p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    expect(RW.formatMtime('2026-09-07T05:04:00Z')).toBe(want);
  });
  test('壊れた値・null は空文字', function() {
    expect(RW.formatMtime(null)).toBe('');
    expect(RW.formatMtime('not a date')).toBe('');
  });
});

describe('reviewWatch の控えの出し入れ', function() {
  test('保存フォルダごとに別の鍵を使う', function() {
    expect(RW.storageKey('./a')).not.toBe(RW.storageKey('./b'));
  });
  test('鍵の既定は ./autosave', function() {
    expect(RW.storageKey(null)).toBe(RW.storageKey('./autosave'));
  });
  test('往復する', function() {
    var st = fakeStorage();
    RW.save(st, './autosave', { a: 'h1' });
    expect(RW.load(st, './autosave')).toEqual({ a: 'h1' });
  });
  test('壊れた控えは空として読む (一覧は出す)', function() {
    var st = fakeStorage();
    st.setItem(RW.storageKey('./autosave'), '{not json');
    expect(RW.load(st, './autosave')).toEqual({});
  });
  test('控えが無ければ hasSeen は false (初回は全部 new)', function() {
    var st = fakeStorage();
    expect(RW.hasSeen(st, './autosave')).toBe(false);
    RW.save(st, './autosave', {});
    expect(RW.hasSeen(st, './autosave')).toBe(true);
  });
  test('localStorage が使えなくても例外を投げない', function() {
    expect(RW.load(null, './autosave')).toEqual({});
    expect(RW.save(null, './autosave', { a: 'h' })).toBe(false);
    expect(RW.hasSeen(null, './autosave')).toBe(false);
  });
});

describe('reviewWatch.badge', function() {
  test('変更と新規には印が付き、変更なしには付かない', function() {
    expect(RW.badge('changed').mark).not.toBe('');
    expect(RW.badge('new').mark).not.toBe('');
    expect(RW.badge('unchanged').mark).toBe('');
  });
  test('知らない status でも落ちない', function() {
    expect(RW.badge('???').mark).toBe('');
  });
});
