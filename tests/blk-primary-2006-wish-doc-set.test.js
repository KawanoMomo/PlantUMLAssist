'use strict';
// BLK-primary-20260914-2006-wish: 資料セット。「全図を SVG で保存 (zip)」の対象は
// 今開いているタブだけで、保存フォルダに 25 枚あってもタブが 1 枚なら 1 枚しか
// 入らなかった。資料に入れる図の組に名前を付けて登録し、名前を選ぶだけで
// 常にその枚数が入るようにする。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/doc-set.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var DS = global.window.MA.docSet;

var FOURTEEN = [
  'spi_init_sequence', 'spi_state', 'can_init_sequence', 'can_state', 'driver_common_class',
  'gpio_init_sequence', 'gpio_state', 'irq_init_sequence', 'irq_state',
  'uart_init_sequence', 'uart_state', 'timer_init_sequence', 'adc_init_sequence', 'adc_state',
];

describe('doc-set: 資料セットは名前で選ぶ図の組', function() {

  test('normalizeDocs は空と重複を落とし、登録した順を保つ (資料に貼る順)', function() {
    expect(DS.normalizeDocs(['b', '', 'a', 'b', null, { name: 'c' }, '  d  ']))
      .toEqual(['b', 'a', 'c', 'd']);
  });

  test('normalize は名前の無いセット・図が 0 枚のセットを落とす (0 枚の zip を選べなくする)', function() {
    var rows = DS.normalize([
      { name: '顧客資料', docs: ['a', 'b'], at: '2026-09-14T20:06:00Z' },
      { name: '', docs: ['a'] },
      { name: '空', docs: [] },
      { name: '空2' },
      null,
    ]);
    expect(rows.map(function(r) { return r.name; })).toEqual(['顧客資料']);
  });

  test('normalize は同じ名前を 1 つにし、新しい順に並べる', function() {
    var rows = DS.normalize([
      { name: '旧', docs: ['a'], at: '2026-09-01T00:00:00Z' },
      { name: '新', docs: ['b'], at: '2026-09-14T00:00:00Z' },
      { name: '旧', docs: ['z'], at: '2026-09-20T00:00:00Z' },
    ]);
    expect(rows.map(function(r) { return r.name; })).toEqual(['新', '旧']);
    // 先に出てきた行が正本 (server 側が新しい順で返す)
    expect(DS.find(rows, '旧').docs).toEqual(['a']);
  });

  test('resolve は「登録した枚数」と「今フォルダにある枚数」を分けて答える', function() {
    var set = { name: '顧客資料', docs: FOURTEEN };
    var res = DS.resolve(set, FOURTEEN);
    expect(res.expected).toBe(14);
    expect(res.present.length).toBe(14);
    expect(res.missing).toEqual([]);
    expect(res.ready).toBe(true);
  });

  test('resolve は欠けている図を名指しする (zip を開いてから気付く形にしない)', function() {
    var set = { name: '顧客資料', docs: FOURTEEN };
    var folder = FOURTEEN.filter(function(n) { return n !== 'adc_state' && n !== 'uart_state'; });
    var res = DS.resolve(set, folder);
    expect(res.expected).toBe(14);
    expect(res.present.length).toBe(12);
    expect(res.missing).toEqual(['uart_state', 'adc_state']);
    expect(res.ready).toBe(false);
  });

  test('resolve はフォルダに余分な図があっても、セットの枚数だけを対象にする', function() {
    var res = DS.resolve({ name: 's', docs: ['a', 'b'] }, ['a', 'b', 'c', 'd', 'e']);
    expect(res.present).toEqual(['a', 'b']);
    expect(res.expected).toBe(2);
  });

  test('summary は揃っているときも枚数を言い切る (黙ると数え直しが戻る)', function() {
    expect(DS.summary(DS.resolve({ name: 's', docs: FOURTEEN }, FOURTEEN)))
      .toBe('14 枚すべてが保存フォルダにあります');
    expect(DS.summaryClass(DS.resolve({ name: 's', docs: FOURTEEN }, FOURTEEN))).toBe('ds-ready');
  });

  test('summary は欠けているとき「N 枚のうち M 枚だけ」と欠けた名前を出す', function() {
    var res = DS.resolve({ name: 's', docs: ['a', 'b', 'c'] }, ['a']);
    expect(DS.summary(res)).toBe('3 枚のうち 1 枚だけが保存フォルダにあります（欠け: b、c）');
    expect(DS.summaryClass(res)).toBe('ds-short');
  });

  test('summary は 0 枚のセットを「図が登録されていません」と言う', function() {
    expect(DS.summary(DS.resolve({ name: 's', docs: [] }, FOURTEEN))).toBe('図が登録されていません');
    expect(DS.summaryClass(DS.resolve(null, []))).toBe('ds-empty');
  });

  test('upsert は同じ名前を 1 つにまとめ、上書きしたセットを先頭に上げる', function() {
    var sets = DS.upsert([], '顧客資料', ['a'], '2026-09-14T00:00:00Z');
    sets = DS.upsert(sets, '社内', ['b'], '2026-09-14T01:00:00Z');
    sets = DS.upsert(sets, '顧客資料', FOURTEEN, '2026-09-14T02:00:00Z');
    expect(sets.map(function(s) { return s.name; })).toEqual(['顧客資料', '社内']);
    expect(DS.find(sets, '顧客資料').docs.length).toBe(14);
  });

  test('upsert は名前が空・図が 0 枚のセットを作らない', function() {
    expect(DS.upsert([], '', ['a'])).toEqual([]);
    expect(DS.upsert([], '名前', [])).toEqual([]);
  });

  test('remove は名前で 1 つだけ消す', function() {
    var sets = DS.upsert(DS.upsert([], 'a', ['x'], '2026-09-14T00:00:00Z'), 'b', ['y'], '2026-09-14T01:00:00Z');
    expect(DS.remove(sets, 'a').map(function(s) { return s.name; })).toEqual(['b']);
    expect(DS.remove(sets, '無い').length).toBe(2);
  });

  test('defaultName は日付で決まり、既にある名前とはぶつからない (名前を考えさせない)', function() {
    var now = new Date('2026-09-14T12:00:00Z');
    var base = DS.defaultName([], now);
    expect(base).toBe('資料セット 2026-09-14');
    var sets = DS.upsert([], base, ['a']);
    expect(DS.defaultName(sets, now)).toBe('資料セット 2026-09-14 (2)');
  });

  test('find は無い名前に null を返す (押せてしまう行を作らない)', function() {
    var sets = DS.upsert([], '顧客資料', ['a']);
    expect(DS.find(sets, '顧客資料').docs).toEqual(['a']);
    expect(DS.find(sets, '社内')).toBe(null);
  });
});
