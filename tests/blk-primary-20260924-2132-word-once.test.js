'use strict';
// BLK-primary-20260924-2132-wish: 不具合の語 (例: Spi_Driver) から「今その語を含む図」と
// 「その語が書き換わった過去の版」を追うのに、▤ 影響を見る の版履歴は部品名のプルダウンを
// 先に選ばないと出ず、しかも影響が届く図にしか当たらなかった。部品名でない語は
// 保存フォルダの版全体から引けることを固定する (部品名のときは今までどおり影響の届く図)。

var W = (typeof window !== 'undefined' && window) || global.window;
var DVS = W.MA.depVersionSearch;
var assert = require('assert');

function hit(no, text) { return { no: no, text: text }; }

// server の /version-search の返り (版は古い順、最後が今の中身)。
var PAYLOAD = {
  terms: ['timeout'],
  files: [
    { name: 'spi_init_sequence', versions: [
      { stamp: '20260920-100000', current: false, counts: [0], lines: [] },
      { stamp: '', current: true, mtime: '2026-09-21T00:00:00Z', counts: [1],
        lines: [hit(4, 'Spi_Driver -> Hal : timeout')] },
    ] },
    { name: 'can_state', versions: [
      { stamp: '20260919-100000', current: false, counts: [1], lines: [hit(3, 'Idle --> Err : timeout')] },
      { stamp: '', current: true, mtime: '2026-09-19T12:00:00Z', counts: [1],
        lines: [hit(3, 'Idle --> Err : timeout')] },
    ] },
    { name: 'adc_init_sequence', versions: [
      { stamp: '', current: true, mtime: '2026-09-18T00:00:00Z', counts: [0], lines: [] },
    ] },
  ],
};

// 依存グラフで選んでいる部品名の影響一覧 (can_state は載っていない)。
var IMPACT = [
  { doc: 'spi_init_sequence', hop: 0, via: [] },
  { doc: 'adc_init_sequence', hop: 1, via: ['Hal'] },
];

describe('BLK-primary-20260924-2132 版履歴を保存フォルダ全体から語で引く', function() {
  test('folderTargets は保存フォルダの全図を並べ、影響一覧に載る図は届き方を持つ', function() {
    var hist = DVS.fromSearch(PAYLOAD);
    var t = DVS.folderTargets(hist, IMPACT);
    assert.deepStrictEqual(t.map(function(x) { return x.doc; }).sort(),
      ['adc_init_sequence', 'can_state', 'spi_init_sequence']);
    var by = {};
    t.forEach(function(x) { by[x.doc] = x; });
    assert.strictEqual(by.spi_init_sequence.hop, 0);
    assert.strictEqual(by.adc_init_sequence.hop, 1);
    assert.deepStrictEqual(by.adc_init_sequence.via, ['Hal']);
    // 依存グラフの外の図は hop: null (影響一覧の絞り込みでは落ちていた図)。
    assert.strictEqual(by.can_state.hop, null);
  });

  test('folderTargets は読めなかった印 (__error) を図として数えない', function() {
    assert.deepStrictEqual(DVS.folderTargets({ __error: 'x' }, IMPACT), []);
    assert.deepStrictEqual(DVS.folderTargets(null, null), []);
  });

  test('影響一覧の外の図でも、語が書き換わった版が並ぶ', function() {
    var hist = DVS.fromSearch(PAYLOAD);
    var targets = DVS.folderTargets(hist, IMPACT);
    var rows = DVS.search(targets, function(n) { return hist[n] || []; }, 'timeout', { changedOnly: true });
    var docs = DVS.byDoc(rows).map(function(d) { return d.doc; });
    assert.ok(docs.indexOf('can_state') >= 0, 'can_state が出る');
    assert.ok(docs.indexOf('spi_init_sequence') >= 0, 'spi_init_sequence が出る');
    // 語を一度も持たない図は落ちる。
    assert.strictEqual(docs.indexOf('adc_init_sequence'), -1);
    // 影響一覧だけに絞ると can_state は出ない (今までの挙動)。
    var scoped = DVS.search(IMPACT, function(n) { return hist[n] || []; }, 'timeout', { changedOnly: true });
    assert.strictEqual(DVS.byDoc(scoped).map(function(d) { return d.doc; }).indexOf('can_state'), -1);
  });

  test('届き方の見出し: 直接 / 連鎖 n 段 / 保存フォルダ', function() {
    assert.strictEqual(DVS.hopLabel({ hop: 0 }), '直接');
    assert.strictEqual(DVS.hopLabel({ hop: 2 }), '連鎖 2 段');
    assert.strictEqual(DVS.hopLabel({ hop: null }), '保存フォルダ');
    var hist = DVS.fromSearch(PAYLOAD);
    var rows = DVS.search(DVS.folderTargets(hist, IMPACT), function(n) { return hist[n] || []; }, 'timeout');
    var can = rows.filter(function(r) { return r.doc === 'can_state'; })[0];
    assert.strictEqual(can.hop, null);
    assert.strictEqual(DVS.hopLabel(can), '保存フォルダ');
  });

  test('同じ時刻なら影響一覧の図が先、外の図は後ろ', function() {
    var hist = {
      a_out: [{ rev: 1, current: true, at: '2026-09-20T00:00:00Z', hits: [{ line: 1, text: 'x timeout' }] }],
      b_in: [{ rev: 1, current: true, at: '2026-09-20T00:00:00Z', hits: [{ line: 1, text: 'y timeout' }] }],
    };
    var rows = DVS.search(DVS.folderTargets(hist, [{ doc: 'b_in', hop: 2, via: [] }]),
      function(n) { return hist[n]; }, 'timeout');
    assert.deepStrictEqual(rows.map(function(r) { return r.doc; }), ['b_in', 'a_out']);
    assert.deepStrictEqual(DVS.byDoc(rows).map(function(d) { return d.doc; }), ['b_in', 'a_out']);
  });

  test('見出しは引いた範囲を言う (保存フォルダ / 影響)', function() {
    var hist = DVS.fromSearch(PAYLOAD);
    var targets = DVS.folderTargets(hist, IMPACT);
    var rows = DVS.search(targets, function(n) { return hist[n] || []; }, 'timeout');
    assert.ok(/保存フォルダの 2 図/.test(DVS.summaryText(rows, 'timeout', targets.length, { scope: 'folder' })));
    assert.ok(/^影響 3 図の版履歴に「nothing」/.test(DVS.summaryText([], 'nothing', 3)));
    assert.ok(/^保存フォルダ 3 図の版履歴に「nothing」を含む版はありません/
      .test(DVS.summaryText([], 'nothing', 3, { scope: 'folder' })));
    // 範囲を渡さなければ今までどおり。
    assert.ok(!/保存フォルダ/.test(DVS.summaryText(rows, 'timeout', 3)));
  });
});
