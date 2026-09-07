'use strict';
// BLK-primary-20260908-0823-wish: 変更サマリボードの差分行に「済 / 要修正」を付けて残す。
// 会議で付けた印が保存され、次にその図を開いた人に帯で出ることを確かめる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
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
  },
});

try { delete require.cache[require.resolve('../src/core/review-verdicts.js')]; } catch (e) {}
require('../src/core/review-verdicts.js');
var RV = global.window.MA.reviewVerdicts;

function fresh() {
  for (var k in _store) { if (Object.prototype.hasOwnProperty.call(_store, k)) delete _store[k]; }
  RV._reset();
}

describe('reviewVerdicts.rowKey', () => {
  test('追加行は変更後の文字列で識別する', () => {
    expect(RV.rowKey({ kind: 'add', before: null, after: '  Adc_Ack()' })).toBe('add|Adc_Ack()');
  });

  test('削除行は変更前の文字列で識別する', () => {
    expect(RV.rowKey({ kind: 'del', before: 'Adc_Init()', after: null })).toBe('del|Adc_Init()');
  });

  test('同じ行・省略行には印を付けない', () => {
    expect(RV.rowKey({ kind: 'same', before: 'x', after: 'x' })).toBe('');
    expect(RV.rowKey({ kind: 'gap', count: 3 })).toBe('');
  });

  test('インデントだけ違う行は同じ印を指す (行がずれても外れない)', () => {
    expect(RV.rowKey({ kind: 'add', after: 'Adc_Ack()' }))
      .toBe(RV.rowKey({ kind: 'add', after: '    Adc_Ack()' }));
  });
});

describe('reviewVerdicts.set / toggle', () => {
  test('付けた印は読み戻せる', () => {
    fresh();
    RV.set('adc_state', 'add|Adc_Ack()', RV.FIX);
    expect(RV.verdictOf('adc_state', 'add|Adc_Ack()')).toBe('要修正');
  });

  test('同じ印をもう一度押すと外れる', () => {
    fresh();
    RV.toggle('adc_state', 'add|Adc_Ack()', RV.DONE);
    RV.toggle('adc_state', 'add|Adc_Ack()', RV.DONE);
    expect(RV.verdictOf('adc_state', 'add|Adc_Ack()')).toBe('');
  });

  test('違う印を押すと上書きされる', () => {
    fresh();
    RV.toggle('adc_state', 'add|Adc_Ack()', RV.DONE);
    RV.toggle('adc_state', 'add|Adc_Ack()', RV.FIX);
    expect(RV.verdictOf('adc_state', 'add|Adc_Ack()')).toBe('要修正');
  });

  test('未知の値を渡すと印を外す', () => {
    fresh();
    RV.set('adc_state', 'add|x', RV.FIX);
    RV.set('adc_state', 'add|x', 'なんとなく');
    expect(RV.get('adc_state', 'add|x')).toBe(null);
  });

  test('図の名前か行の識別子が空なら何もしない', () => {
    fresh();
    expect(RV.set('', 'add|x', RV.FIX)).toBe(null);
    expect(RV.set('adc_state', '', RV.FIX)).toBe(null);
    expect(RV.totals().done + RV.totals().fix).toBe(0);
  });
});

describe('reviewVerdicts の集計', () => {
  function seed() {
    fresh();
    RV.set('adc_state', 'add|a', RV.FIX, '2026-09-08T09:00:00.000Z');
    RV.set('adc_state', 'del|b', RV.DONE, '2026-09-08T09:01:00.000Z');
    RV.set('dma_state', 'add|c', RV.DONE, '2026-09-08T09:02:00.000Z');
  }

  test('図ごとに済と要修正を数える', () => {
    seed();
    expect(RV.counts('adc_state')).toEqual({ done: 1, fix: 1 });
    expect(RV.counts('dma_state')).toEqual({ done: 1, fix: 0 });
    expect(RV.counts('無い図')).toEqual({ done: 0, fix: 0 });
  });

  test('要修正が残っている図を先に並べる', () => {
    seed();
    expect(RV.docs().map(function(d) { return d.name; })).toEqual(['adc_state', 'dma_state']);
  });

  test('その図の印は新しい順に出す', () => {
    seed();
    expect(RV.listFor('adc_state').map(function(r) { return r.key; })).toEqual(['del|b', 'add|a']);
  });

  test('印の行は元の文字列を持つ (会議の記録として読めるように)', () => {
    seed();
    expect(RV.listFor('adc_state')[0].text).toBe('b');
  });

  test('見出しの 1 行に総数が出る', () => {
    seed();
    expect(RV.summaryText()).toBe('レビュー結果 要修正 1 件 / 済 2 件');
  });

  test('印が 1 つも無ければ見出しには何も足さない', () => {
    fresh();
    expect(RV.summaryText()).toBe('');
  });
});

describe('reviewVerdicts.bannerText', () => {
  test('要修正が残っている図には帯を出す', () => {
    fresh();
    RV.set('adc_state', 'add|a', RV.FIX);
    RV.set('adc_state', 'del|b', RV.DONE);
    expect(RV.bannerText('adc_state')).toBe(
      'レビュー結果: 要修正 1 件 (済 1 件) — 変更サマリボードで印の付いた行を直す');
  });

  test('済だけなら帯は出さない (もう見る必要が無い)', () => {
    fresh();
    RV.set('adc_state', 'add|a', RV.DONE);
    expect(RV.bannerText('adc_state')).toBe('');
  });
});

describe('reviewVerdicts の保存', () => {
  test('保存して読み直しても印は残る (基準を取り直しても消えない)', () => {
    fresh();
    RV.set('adc_state', 'add|a', RV.FIX);
    RV._reset();
    expect(RV.verdictOf('adc_state', 'add|a')).toBe('要修正');
  });

  test('壊れた行は落として残りを活かす', () => {
    var parsed = RV.parse(JSON.stringify({ docs: {
      adc_state: { 'add|a': { verdict: '要修正', at: '' }, 'add|b': { verdict: 'ゴミ' } },
      dma_state: 'ゴミ',
    } }));
    expect(Object.keys(parsed)).toEqual(['adc_state']);
    expect(Object.keys(parsed.adc_state)).toEqual(['add|a']);
  });

  test('壊れた JSON なら空として扱う', () => {
    expect(RV.parse('{')).toEqual({});
    expect(RV.parse('')).toEqual({});
    expect(RV.parse(null)).toEqual({});
  });

  test('図ごとに印を消せる', () => {
    fresh();
    RV.set('adc_state', 'add|a', RV.FIX);
    RV.set('dma_state', 'add|c', RV.DONE);
    expect(RV.clearDoc('adc_state')).toBe(true);
    expect(RV.clearDoc('adc_state')).toBe(false);
    expect(RV.docs().map(function(d) { return d.name; })).toEqual(['dma_state']);
  });

  test('引き継ぎ用に図ごとの平たい行を出す', () => {
    fresh();
    RV.set('adc_state', 'add|Adc_Ack()', RV.FIX);
    expect(RV.digestLines()).toEqual([
      'adc_state: 要修正 1 件 / 済 0 件',
      '  [要修正] Adc_Ack()',
    ]);
  });
});
