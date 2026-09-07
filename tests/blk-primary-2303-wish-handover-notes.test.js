'use strict';
// BLK-primary-20260907-2303-wish: 変更サマリボードの行に「なぜ直したか」を添えて
// 残す申し送り。基準を取り直しても消えず、その図を次に開いた人に出ることを確かめる。
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

try { delete require.cache[require.resolve('../src/core/handover-notes.js')]; } catch (e) {}
require('../src/core/handover-notes.js');
var HN = global.window.MA.handoverNotes;

function fresh() {
  for (var k in _store) { if (Object.prototype.hasOwnProperty.call(_store, k)) delete _store[k]; }
  HN._reset();
}

describe('handoverNotes.normalizeText', () => {
  test('前後の空白を落として 1 行にする', () => {
    expect(HN.normalizeText('  Adc_Ack() を足した  ')).toBe('Adc_Ack() を足した');
  });

  test('複数行は / でつないで 1 行にする', () => {
    expect(HN.normalizeText('adc_state の\nDone→Configured に対応\n')).toBe('adc_state の / Done→Configured に対応');
  });

  test('MAX を超えたら切る', () => {
    var long = new Array(400).join('あ');
    expect(HN.normalizeText(long).length).toBe(HN.MAX);
  });

  test('空白だけなら空文字', () => {
    expect(HN.normalizeText('   \n  ')).toBe('');
    expect(HN.normalizeText(null)).toBe('');
  });
});

describe('handoverNotes.set / get', () => {
  test('図に一言を添えると、その名前で読み出せる', () => {
    fresh();
    HN.set('adc_driver', 'adc_state の Done→Configured に対応するメソッドが無かった',
      { added: 3, removed: 1, status: 'changed' }, '2026-09-08T02:40:00.000Z');
    var n = HN.get('adc_driver');
    expect(n.text).toBe('adc_state の Done→Configured に対応するメソッドが無かった');
    expect(n.added).toBe(3);
    expect(n.removed).toBe(1);
    expect(n.status).toBe('changed');
    expect(n.at).toBe('2026-09-08T02:40:00.000Z');
  });

  test('申し送りの無い図は null', () => {
    fresh();
    expect(HN.get('spi_driver')).toBe(null);
  });

  test('空文字を渡すと消える (取り消しの操作を分けない)', () => {
    fresh();
    HN.set('adc_driver', 'あとで直す');
    expect(HN.get('adc_driver')).not.toBe(null);
    HN.set('adc_driver', '   ');
    expect(HN.get('adc_driver')).toBe(null);
  });

  test('同じ図に書き直すと上書きされる', () => {
    fresh();
    HN.set('adc_driver', '古い理由', {}, '2026-09-08T01:00:00.000Z');
    HN.set('adc_driver', '新しい理由', {}, '2026-09-08T02:00:00.000Z');
    expect(HN.get('adc_driver').text).toBe('新しい理由');
    expect(HN.count()).toBe(1);
  });

  test('名前が空なら何も起きない', () => {
    fresh();
    expect(HN.set('', 'x')).toBe(null);
    expect(HN.count()).toBe(0);
  });
});

describe('handoverNotes 永続化', () => {
  test('localStorage に残り、読み直しても消えない (基準の取り直しと無関係)', () => {
    fresh();
    HN.set('adc_driver', 'Adc_Ack() を足した理由', { added: 3, removed: 0 });
    HN._reset();   // 別セッションで開き直した状態
    expect(HN.get('adc_driver').text).toBe('Adc_Ack() を足した理由');
  });

  test('壊れた保存内容でも他の申し送りは活きる', () => {
    var parsed = HN.parse('{"notes":{"a":{"text":"生きてる"},"b":{"text":""},"c":42}}');
    expect(parsed.a.text).toBe('生きてる');
    expect(parsed.b).toBe(undefined);
    expect(parsed.c).toBe(undefined);
  });

  test('JSON として壊れていれば申し送り 0 件から始める', () => {
    expect(HN.parse('{{{')).toEqual({});
    expect(HN.parse('')).toEqual({});
  });

  test('serialize したものは parse で戻る', () => {
    var m = HN.parse(HN.serialize({ x: { text: 'a', at: '2026-09-08T00:00:00.000Z', added: 1, removed: 2, status: 'changed' } }));
    expect(m.x.text).toBe('a');
    expect(m.x.removed).toBe(2);
  });
});

describe('handoverNotes.list / remove / clear', () => {
  test('新しい順に並ぶ', () => {
    fresh();
    HN.set('spi', '古い', {}, '2026-09-08T01:00:00.000Z');
    HN.set('adc', '新しい', {}, '2026-09-08T03:00:00.000Z');
    HN.set('can', '中間', {}, '2026-09-08T02:00:00.000Z');
    expect(HN.list().map(function(n) { return n.name; })).toEqual(['adc', 'can', 'spi']);
  });

  test('remove は消した時だけ true', () => {
    fresh();
    HN.set('adc', 'x');
    expect(HN.remove('adc')).toBe(true);
    expect(HN.remove('adc')).toBe(false);
  });

  test('clear で全部消える', () => {
    fresh();
    HN.set('a', '1'); HN.set('b', '2');
    HN.clear();
    expect(HN.count()).toBe(0);
  });
});

describe('handoverNotes の見出し', () => {
  test('bannerText は日時付きの 1 行', () => {
    expect(HN.bannerText({ text: '理由', at: '2026-09-08T02:40:00.000Z' }))
      .toBe('申し送り (2026-09-08 02:40): 理由');
  });

  test('日時が無ければ日時を出さない', () => {
    expect(HN.bannerText({ text: '理由', at: '' })).toBe('申し送り: 理由');
  });

  test('申し送りが無ければ空文字 (何も足さない)', () => {
    expect(HN.bannerText(null)).toBe('');
    expect(HN.summaryText([])).toBe('');
  });

  test('summaryText は件数', () => {
    expect(HN.summaryText([{ name: 'a' }, { name: 'b' }])).toBe('申し送り 2 件');
  });

  test('digestLines は引き継ぎパッケージに焼ける平たい行', () => {
    expect(HN.digestLines([{ name: 'adc_driver', text: '理由', at: '2026-09-08T02:40:00.000Z' }]))
      .toEqual(['adc_driver: 理由 (2026-09-08 02:40)']);
  });
});
