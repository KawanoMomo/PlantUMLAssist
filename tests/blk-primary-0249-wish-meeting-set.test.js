'use strict';
// BLK-primary-20260918-0249-wish: レビュー会議で見せる図はその場で 3〜5 枚選ぶ。
// 「会議セット」は選んだ図の名前の並びだけを持ち、ボードはその並びに載っている図を
// 選んだ順に (変わっていなくても) 並べる。ここは並びの持ち方だけを守る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
  global.window = dom.window;
  global.document = dom.window.document;
}

// 共有 window の localStorage は無い (run-tests.js の素の object) か、opaque origin の
// jsdom で参照すると例外を投げる。どちらでも動くよう、素の実装を必ず差し込む。
var _store = {};
Object.defineProperty(global.window, 'localStorage', {
  configurable: true,
  value: {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
    setItem: function(k, v) { _store[k] = String(v); },
    removeItem: function(k) { delete _store[k]; },
    clear: function() { _store = {}; },
  },
});

try { delete require.cache[require.resolve('../src/core/meeting-set.js')]; } catch (e) {}
require('../src/core/meeting-set.js');
var ms = global.window.MA.meetingSet;

beforeEach(() => {
  _store = {};
  ms._reset();
});

describe('meetingSet の並び', () => {
  test('選んだ順に並び、同じ図を二度選んでも増えない', () => {
    ms.add('spi_init_sequence');
    ms.add('spi_state');
    ms.add('driver_common_class');
    ms.add('spi_state');
    expect(ms.list()).toEqual(['spi_init_sequence', 'spi_state', 'driver_common_class']);
    expect(ms.count()).toBe(3);
  });

  test('toggle は入れる / 外すを返し、外すと並びから消える', () => {
    expect(ms.toggle('spi_state')).toBe(true);
    expect(ms.has('spi_state')).toBe(true);
    expect(ms.toggle('spi_state')).toBe(false);
    expect(ms.has('spi_state')).toBe(false);
    expect(ms.list()).toEqual([]);
  });

  test('上限 5 枚を超える分は入れず、既に選んだ 5 枚を落とさない', () => {
    ['a', 'b', 'c', 'd', 'e'].forEach(function(n) { ms.add(n); });
    expect(ms.toggle('f')).toBe(false);
    expect(ms.list()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(ms.has('f')).toBe(false);
    expect(ms.fullText()).toContain('5');
  });

  test('空白だけの名前は選べない', () => {
    expect(ms.toggle('   ')).toBe(false);
    expect(ms.count()).toBe(0);
  });

  test('clear で空になる', () => {
    ms.add('a'); ms.add('b');
    ms.clear();
    expect(ms.list()).toEqual([]);
  });
});

describe('meetingSet.pickDocs / missing', () => {
  var docs = [
    { name: 'driver_common_class', dsl: 'c' },
    { name: 'other', dsl: 'x' },
    { name: 'spi_init_sequence', dsl: 'a' },
    { name: 'spi_state', dsl: 'b' },
  ];

  test('選んだ順に絞る (図の一覧の順ではない)', () => {
    ms.add('spi_init_sequence');
    ms.add('spi_state');
    ms.add('driver_common_class');
    expect(ms.pickDocs(docs).map(function(d) { return d.name; }))
      .toEqual(['spi_init_sequence', 'spi_state', 'driver_common_class']);
  });

  test('会議セットが空なら 1 枚も返さない (ボードは通常の見せ方に残る)', () => {
    expect(ms.pickDocs(docs)).toEqual([]);
  });

  test('見つからない図は落とし、missing で名前を返す', () => {
    ms.add('spi_state');
    ms.add('gone_diagram');
    expect(ms.pickDocs(docs).map(function(d) { return d.name; })).toEqual(['spi_state']);
    expect(ms.missing(docs)).toEqual(['gone_diagram']);
    expect(ms.summaryText(ms.missing(docs))).toContain('gone_diagram');
  });
});

describe('meetingSet の保存形式', () => {
  test('壊れた保存は空として読む', () => {
    expect(ms.parse('{{')).toEqual([]);
    expect(ms.parse(null)).toEqual([]);
    expect(ms.parse('{"names":"x"}')).toEqual([]);
  });

  test('配列でも { names } でも読める。重複と上限はここで落とす', () => {
    expect(ms.parse('["a","a","b"]')).toEqual(['a', 'b']);
    expect(ms.parse({ names: ['a', 'b', 'c', 'd', 'e', 'f'] })).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('書き出したものを読み戻せる', () => {
    expect(ms.parse(ms.serialize(['a', 'b']))).toEqual(['a', 'b']);
  });

  test('localStorage に残り、読み直しても同じ並びになる', () => {
    ms.add('spi_init_sequence');
    ms.add('spi_state');
    ms._reset();
    expect(ms.list()).toEqual(['spi_init_sequence', 'spi_state']);
  });
});

describe('meetingSet.summaryText', () => {
  test('空なら選び方を言う', () => {
    expect(ms.summaryText([])).toContain('会議セットは空です');
  });

  test('3 枚未満ならあと何枚選べるかを言う', () => {
    ms.add('a');
    expect(ms.summaryText([])).toContain('あと 2 枚');
  });

  test('3 枚そろったら枚数と並びを言う', () => {
    ms.add('a'); ms.add('b'); ms.add('c');
    var t = ms.summaryText([]);
    expect(t).toContain('会議セット 3 枚');
    expect(t).toContain('a → b → c');
    expect(t).not.toContain('あと');
  });
});
