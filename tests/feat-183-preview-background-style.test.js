'use strict';
// FEAT-183 (resolves HFR-039): プレビュー背景モード(白 / 透過 / ダーク)に対応する
// style 文字列を返す純関数 previewBackgroundStyle。
// 検証層は E1 のみ (DOM / SVG / プレビュー描画を一切要さない)。
var hu = (typeof window !== 'undefined' && window.MA && window.MA.htmlUtils)
  || (global.window && global.window.MA && global.window.MA.htmlUtils);

describe('FEAT-183 previewBackgroundStyle', function() {
  test('[AC-1] window.MA.htmlUtils.previewBackgroundStyle is a function', function() {
    expect(typeof hu.previewBackgroundStyle).toBe('function');
  });

  // 区分 (b) 回帰ガード: 既存 export escHtml が消えないことを守る。事前 PASS を許す。
  test('[AC-2][regression-guard-b] escHtml still exists and behaves unchanged', function() {
    expect(typeof hu.escHtml).toBe('function');
    expect(hu.escHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });

  test('[AC-3] light / dark / transparent return mutually different non-empty strings', function() {
    var light = hu.previewBackgroundStyle('light');
    var dark = hu.previewBackgroundStyle('dark');
    var tr = hu.previewBackgroundStyle('transparent');
    expect(typeof light).toBe('string');
    expect(typeof dark).toBe('string');
    expect(typeof tr).toBe('string');
    expect(light.length > 0).toBe(true);
    expect(dark.length > 0).toBe(true);
    expect(tr.length > 0).toBe(true);
    expect(light).not.toBe(dark);
    expect(dark).not.toBe(tr);
    expect(light).not.toBe(tr);
  });

  test('[AC-4] dark uses the existing CSS variable var(--bg-primary)', function() {
    expect(hu.previewBackgroundStyle('dark').indexOf('var(--bg-primary)') >= 0).toBe(true);
  });

  test('[AC-5] transparent contains the literal "transparent"', function() {
    expect(hu.previewBackgroundStyle('transparent').indexOf('transparent') >= 0).toBe(true);
  });

  test('[AC-6] undefined / unknown fall back to dark without throwing', function() {
    var dark = hu.previewBackgroundStyle('dark');
    expect(hu.previewBackgroundStyle(undefined)).toBe(dark);
    expect(hu.previewBackgroundStyle(null)).toBe(dark);
    expect(hu.previewBackgroundStyle('zzz')).toBe(dark);
  });
});
