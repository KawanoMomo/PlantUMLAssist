'use strict';
// BLK-primary-20260914-1306-wish: 指摘.md が毎回「can_init_sequence-編集中 が本体と
// byte 単位で同一のまま」の整理を求めるのに、📂一覧には開く・名前を変えるしか無く、
// 重複を消すには保存フォルダを直接触るしかなかった。一覧が既に持っている hash で
// 束ね、残す 1 枚と消せる写しをここで決める。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
try { delete require.cache[require.resolve('../src/core/dupe-merge.js')]; } catch (e) {}
require('../src/core/dupe-merge.js');
var dm = global.window.MA.dupeMerge;

// 指摘.md が挙げている実際の形。
var REAL = [
  { name: 'can_init_sequence', hash: 'aaa' },
  { name: 'can_init_sequence-編集中', hash: 'aaa' },
  { name: 'spi_init_sequence', hash: 'bbb' },
  { name: 'spi_init_sequence-編集中', hash: 'bbb' },
  { name: 'driver_common_class', hash: 'ccc' },
];

describe('dupeMerge.scan', () => {
  test('中身が同じ図だけを束ね、本体を残して写しを消す側に置く', () => {
    var g = dm.scan(REAL);
    expect(g.length).toBe(2);
    expect(g[0].keep).toBe('can_init_sequence');
    expect(g[0].drop).toEqual(['can_init_sequence-編集中']);
    expect(g[1].keep).toBe('spi_init_sequence');
    expect(g[1].drop).toEqual(['spi_init_sequence-編集中']);
  });

  test('1 枚しかない図は束ねない', () => {
    expect(dm.scan([{ name: 'driver_common_class', hash: 'ccc' }])).toEqual([]);
  });

  test('中身が違えば名前が似ていても束ねない', () => {
    var g = dm.scan([
      { name: 'can_init_sequence', hash: 'aaa' },
      { name: 'can_init_sequence-編集中', hash: 'zzz' },
    ]);
    expect(g).toEqual([]);
  });

  test('hash の無い図は束ねない（読めないものを同じと言わない）', () => {
    var g = dm.scan([
      { name: 'a', hash: null },
      { name: 'b', hash: '' },
      { name: 'c' },
    ]);
    expect(g).toEqual([]);
  });

  test('3 枚以上でも残すのは 1 枚だけ', () => {
    var g = dm.scan([
      { name: 'gpio_state', hash: 'k' },
      { name: 'gpio_state-編集中', hash: 'k' },
      { name: 'gpio_state-copy', hash: 'k' },
    ]);
    expect(g.length).toBe(1);
    expect(g[0].keep).toBe('gpio_state');
    expect(g[0].drop.sort()).toEqual(['gpio_state-copy', 'gpio_state-編集中']);
  });

  test('接尾辞が無い同士なら短い方・辞書順で毎回同じ答えになる', () => {
    var a = dm.scan([{ name: 'zzz_long_name', hash: 'k' }, { name: 'abc', hash: 'k' }]);
    var b = dm.scan([{ name: 'abc', hash: 'k' }, { name: 'zzz_long_name', hash: 'k' }]);
    expect(a[0].keep).toBe('abc');
    expect(b[0].keep).toBe('abc');
  });

  test('名前の重複した entry は 1 枚として数える', () => {
    var g = dm.scan([{ name: 'a', hash: 'k' }, { name: 'a', hash: 'k' }]);
    expect(g).toEqual([]);
  });

  test('entries が無くても落ちない', () => {
    expect(dm.scan(null)).toEqual([]);
    expect(dm.scan([])).toEqual([]);
  });
});

describe('dupeMerge.summary / label / badge', () => {
  test('summary は組数と消せる枚数を出す', () => {
    expect(dm.summary(dm.scan(REAL))).toBe('中身が同じ図が 2 組（消せる写し 2 枚）');
  });

  test('重複が無ければ summary は空 (何も出さない)', () => {
    expect(dm.summary([])).toBe('');
    expect(dm.summary(null)).toBe('');
  });

  test('label は残す名前と消す名前をそのまま読ませる', () => {
    expect(dm.label(dm.scan(REAL)[0]))
      .toBe('can_init_sequence ← can_init_sequence-編集中（中身が同じ）');
  });

  test('badge は行ごとに本体 / 写しを言い分ける', () => {
    var g = dm.scan(REAL);
    expect(dm.badge(g, 'can_init_sequence').kind).toBe('keep');
    expect(dm.badge(g, 'can_init_sequence-編集中').kind).toBe('copy');
    expect(dm.badge(g, 'can_init_sequence-編集中').title)
      .toBe('can_init_sequence と中身が同じです（消しても失うものはありません）');
    expect(dm.badge(g, 'driver_common_class')).toBe(null);
  });
});
