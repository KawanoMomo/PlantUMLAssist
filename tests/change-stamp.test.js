'use strict';
// BLK-reviewer-20260916-0426-wish: 前回控えから 1 バイトも変わっていない図の「変化なし」印。
var fs = require('fs');
var path = require('path');
var win = {};
new Function('window', fs.readFileSync(path.join(__dirname, '../src/core/review-watch.js'), 'utf-8'))(win);
new Function('window', fs.readFileSync(path.join(__dirname, '../src/core/change-stamp.js'), 'utf-8'))(win);
var RW = win.MA.reviewWatch;
var CS = win.MA.changeStamp;

function entry(name, hash) { return { name: name, hash: hash, mtime: '2026-09-16T04:00:00Z' }; }

function fakeStorage(initial) {
  var store = initial || {};
  return {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function(k, v) { store[k] = String(v); },
    _store: store,
  };
}

describe('changeStamp.advance', function() {
  test('初回の控えは全部 1 回目 (前回が無いので連続とは言わない)', function() {
    var rows = RW.diff({}, [entry('a', 'h1')]);
    var next = CS.advance({}, rows, '2026-09-16T04:00:00Z');
    expect(next.a.runs).toBe(1);
    expect(next.a.since).toBe('2026-09-16T04:00:00Z');
  });
  test('中身が同じまま控えを取り直すと連続回数が増え、since は最初のまま', function() {
    var first = CS.advance({}, RW.diff({}, [entry('a', 'h1')]), '2026-09-16T04:00:00Z');
    var rows = RW.diff({ a: 'h1' }, [entry('a', 'h1')]);
    expect(rows[0].status).toBe('unchanged');
    var second = CS.advance(first, rows, '2026-09-16T05:00:00Z');
    expect(second.a.runs).toBe(2);
    expect(second.a.since).toBe('2026-09-16T04:00:00Z');
  });
  test('中身が変わったら数え直す', function() {
    var first = CS.advance({}, RW.diff({}, [entry('a', 'h1')]), '2026-09-16T04:00:00Z');
    var second = CS.advance(first, RW.diff({ a: 'h1' }, [entry('a', 'h2')]), '2026-09-16T05:00:00Z');
    expect(second.a.runs).toBe(1);
    expect(second.a.since).toBe('2026-09-16T05:00:00Z');
  });
  test('指紋の取れない図は控えに入れない (変化なしと言い切れない)', function() {
    var next = CS.advance({}, RW.diff({}, [{ name: 'a' }]), '2026-09-16T04:00:00Z');
    expect(next).toEqual({});
  });
});

describe('changeStamp.stamp', function() {
  var store = { a: { hash: 'h1', runs: 3, since: '2026-09-16T04:00:00Z' } };
  test('unchanged の図にだけ印が付く', function() {
    var row = RW.diff({ a: 'h1' }, [entry('a', 'h1')])[0];
    var st = CS.stamp(store, row);
    expect(st.mark).toBe('＝');
    expect(st.text).toBe('変化なし ×3');
    expect(st.short).toBe('＝3');
    expect(st.runs).toBe(3);
    expect(st.title).toContain('1 バイトも変わっていません');
    expect(st.title).toContain('3 回連続');
  });
  test('1 回だけなら回数を出さない', function() {
    var st = CS.stamp({ a: { hash: 'h1', runs: 1, since: '' } },
                      RW.diff({ a: 'h1' }, [entry('a', 'h1')])[0]);
    expect(st.text).toBe('変化なし');
    expect(st.short).toBe('＝');
  });
  test('変わった図・新しい図には出さない', function() {
    expect(CS.stamp(store, RW.diff({ a: 'h0' }, [entry('a', 'h1')])[0])).toBe(null);
    expect(CS.stamp(store, RW.diff({}, [entry('b', 'h9')])[0])).toBe(null);
  });
  test('控えの無い図には出さない (今回の控えと同じ、までしか言えない)', function() {
    expect(CS.stamp({}, RW.diff({ a: 'h1' }, [entry('a', 'h1')])[0])).toBe(null);
  });
  test('控えの指紋が今と食い違えば出さない', function() {
    expect(CS.stamp({ a: { hash: 'hX', runs: 5, since: '' } },
                    RW.diff({ a: 'h1' }, [entry('a', 'h1')])[0])).toBe(null);
  });
  test('時刻の見せ方は呼ぶ側に任せる', function() {
    var st = CS.stamp(store, RW.diff({ a: 'h1' }, [entry('a', 'h1')])[0], RW.formatMtime);
    expect(st.title).toContain('09/16');
  });
});

describe('changeStamp.summary / stampedNames', function() {
  var store = { a: { hash: 'h1', runs: 2, since: '' }, b: { hash: 'h2', runs: 1, since: '' } };
  var rows = RW.diff({ a: 'h1', b: 'h9' }, [entry('a', 'h1'), entry('b', 'h2'), entry('c', 'h3')]);
  test('印の付く図だけを名前で返す', function() {
    expect(CS.stampedNames(store, rows)).toEqual(['a']);
  });
  test('要約は読む枚数を言う', function() {
    expect(CS.summary(store, rows)).toBe('変化なし 1 枚（前回の指摘を転記可）/ 読むのは 2 枚');
  });
  test('1 枚も無ければ全部読み直しと言い切る', function() {
    expect(CS.summary({}, rows)).toContain('3 枚とも読み直しが要ります');
  });
  test('図が無ければ何も言わない', function() {
    expect(CS.summary(store, [])).toBe('');
  });
});

describe('changeStamp の控えの出し入れ', function() {
  test('保存フォルダごとに分かれる', function() {
    expect(CS.storageKey('E:/a')).not.toBe(CS.storageKey('E:/b'));
    expect(CS.storageKey('')).toBe(CS.storageKey(null));
  });
  test('書いたものが読める', function() {
    var s = fakeStorage();
    CS.save(s, './autosave', { a: { hash: 'h1', runs: 2, since: 'T' } });
    expect(CS.load(s, './autosave')).toEqual({ a: { hash: 'h1', runs: 2, since: 'T' } });
  });
  test('壊れた控え・形の違う控えは空として読む', function() {
    expect(CS.load(fakeStorage({ 'pua.review.stamp:./autosave': '{' }), './autosave')).toEqual({});
    expect(CS.load(fakeStorage({ 'pua.review.stamp:./autosave': '[1,2]' }), './autosave')).toEqual({});
    expect(CS.load(fakeStorage({ 'pua.review.stamp:./autosave': '{"a":1}' }), './autosave')).toEqual({});
  });
  test('storage が無くても落ちない', function() {
    expect(CS.load(null, './autosave')).toEqual({});
    expect(CS.save(null, './autosave', {})).toBe(false);
  });
});
