'use strict';
// label-colors は DOM に触らない純関数だけを持つ。ここでは require せず
// 自前の window に読み込む (rich-label.test.js の require キャッシュと干渉させない)。
var fs = require('fs');
var path = require('path');
var win = {};
new Function('window', fs.readFileSync(path.join(__dirname, '../src/core/label-colors.js'), 'utf-8'))(win);
var LC = win.MA.labelColors;

function fakeStorage(initial) {
  var store = initial || {};
  return {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function(k, v) { store[k] = String(v); },
    _store: store,
  };
}

describe('labelColors.isColor', function() {
  test('accepts #rgb and #rrggbb', function() {
    expect(LC.isColor('#f00')).toBe(true);
    expect(LC.isColor('#f74a4a')).toBe(true);
  });
  test('accepts color names', function() {
    expect(LC.isColor('red')).toBe(true);
  });
  test('rejects empty, non-string and broken hex', function() {
    expect(LC.isColor('')).toBe(false);
    expect(LC.isColor(null)).toBe(false);
    expect(LC.isColor('#12345')).toBe(false);
    expect(LC.isColor('red;background:url(x)')).toBe(false);
  });
});

describe('labelColors.push', function() {
  test('puts the used color first', function() {
    expect(LC.push(['#f00'], '#0f0', 5)).toEqual(['#0f0', '#f00']);
  });
  test('folds a repeated color into one entry', function() {
    expect(LC.push(['#f00', '#0f0'], '#f00', 5)).toEqual(['#f00', '#0f0']);
  });
  test('caps at max', function() {
    expect(LC.push(['a', 'b', 'c'], 'd', 2)).toEqual(['d', 'a']);
  });
  test('does not mutate the given array', function() {
    var recent = ['#f00'];
    LC.push(recent, '#0f0', 5);
    expect(recent).toEqual(['#f00']);
  });
  test('ignores an invalid color', function() {
    expect(LC.push(['#f00'], '', 5)).toEqual(['#f00']);
  });
});

describe('labelColors.load / save', function() {
  test('round-trips through storage', function() {
    var st = fakeStorage();
    LC.save(st, LC.RECENT_KEY, ['#f00', '#0f0']);
    expect(LC.load(st, LC.RECENT_KEY)).toEqual(['#f00', '#0f0']);
  });
  test('returns [] for broken JSON', function() {
    var st = fakeStorage({ 'pua.label.recentColors': '{not json' });
    expect(LC.load(st, LC.RECENT_KEY)).toEqual([]);
  });
  test('drops invalid and duplicated entries', function() {
    var st = fakeStorage({ 'pua.label.recentColors': '["#f00","#f00","<script>"]' });
    expect(LC.load(st, LC.RECENT_KEY)).toEqual(['#f00']);
  });
  test('returns [] without storage', function() {
    expect(LC.load(null, LC.RECENT_KEY)).toEqual([]);
  });
  test('save without storage does not throw', function() {
    expect(function() { LC.save(null, LC.RECENT_KEY, ['#f00']); }).not.toThrow();
  });
});

describe('labelColors.stripColor', function() {
  test('removes color tags but keeps the text', function() {
    expect(LC.stripColor('<color:#f00>ab</color>cd')).toBe('abcd');
  });
  test('keeps other creole tags', function() {
    expect(LC.stripColor('<b><color:red>x</color></b>')).toBe('<b>x</b>');
  });
  test('handles null', function() {
    expect(LC.stripColor(null)).toBe('');
  });
});
