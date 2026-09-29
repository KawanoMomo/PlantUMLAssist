'use strict';
// BLK-junior-20260929-0854: 「資料セット→1 枚だけ」は部品と図種の 2 欄だけで元の図を決めていたので、
// 同じ部品・図種にファイルが 2 枚あると、開いている図 (DMAドライバ利用ユースケース図) ではなく
// 名前の短い古い別ファイル (dma_usecase) が資料化され、GUI から選び直せなかった。
// 開いている図を既定の元にし、同じ組の別ファイルは名前で選べ、資料用の名前と題は選んだファイルから作る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/component-pack.js', '../src/core/material-export.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var ME = global.window.MA.materialExport;

var FILES = [
  'dma_usecase',
  'dma_usecase(資料用)',
  'DMAドライバ利用ユースケース図',
  'DMAドライバクラス',
  'DMAドライバクラス(資料用)',
];

describe('資料化の元の図 — 開いている図を既定にし、同じ組の別ファイルは名前で選ぶ', function() {
  test('同じ部品・図種の元の候補を、資料用の版を除いて全部返す', function() {
    var s = ME.sourcesFor(FILES, 'dma', 'ユースケース図');
    expect(s.length).toBe(2);
    expect(s.indexOf('dma_usecase') >= 0).toBe(true);
    expect(s.indexOf('DMAドライバ利用ユースケース図') >= 0).toBe(true);
    expect(s.indexOf('dma_usecase(資料用)')).toBe(-1);
  });

  test('候補が 1 枚なら 1 枚だけ (ほかの図種は選び直しが要らない)', function() {
    expect(ME.sourcesFor(FILES, 'dma', 'クラス図')).toEqual(['DMAドライバクラス']);
  });

  test('開いている図の名前から、部品・図種・元のファイルを引く', function() {
    var h = ME.sourceOf(FILES, 'DMAドライバ利用ユースケース図');
    expect(h.component).toBe('dma');
    expect(h.kind).toBe('ユースケース図');
    expect(h.source).toBe('DMAドライバ利用ユースケース図');
    // 保存一覧が .puml 付きで返っても引ける
    var h2 = ME.sourceOf(FILES.map(function(f) { return f + '.puml'; }), 'DMAドライバ利用ユースケース図');
    expect(h2.source).toBe('DMAドライバ利用ユースケース図.puml');
  });

  test('資料用の版を開いているなら元の版を元にする', function() {
    expect(ME.sourceOf(FILES, 'DMAドライバクラス(資料用)').source).toBe('DMAドライバクラス');
  });

  test('保存フォルダに無い図・図種の読めない図は引かない (従来の選び方に任せる)', function() {
    expect(ME.sourceOf(FILES, '無題')).toBeNull();
    expect(ME.sourceOf(FILES, '')).toBeNull();
  });

  test('選んだファイルから資料用の名前と題を作る (短い別名の古い図にしない)', function() {
    var p = ME.plan(FILES, 'dma', 'ユースケース図', 'DMAドライバ利用ユースケース図');
    expect(p.source).toBe('DMAドライバ利用ユースケース図');
    expect(p.title).toBe('DMAドライバ利用ユースケース図(資料用)');
    expect(p.filename).toBe('DMAドライバ利用ユースケース図(資料用).png');
    expect(p.others).toBe(1);
    expect(ME.planText(p)).toContain('ほかに 1 枚');
  });

  test('元を渡さなければ従来どおり、候補に無い名前は無視する', function() {
    expect(ME.plan(FILES, 'dma', 'ユースケース図').source).toBe(ME.sourcesFor(FILES, 'dma', 'ユースケース図')[0]);
    expect(ME.plan(FILES, 'dma', 'ユースケース図', 'DMAドライバクラス').source)
      .toBe(ME.sourcesFor(FILES, 'dma', 'ユースケース図')[0]);
    expect(ME.plan(FILES, 'dma', 'クラス図').others).toBe(0);
    expect(ME.planText(ME.plan(FILES, 'dma', 'クラス図'))).not.toContain('ほかに');
  });
});
