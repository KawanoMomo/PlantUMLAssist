'use strict';
// TICKET-junior-20261123-1142-wish (roadmap v9.0 必須 1): PNG の大きさ (倍率) — src/core/png-scale.js と画面側の道。
// 実マウスの確かめは tests/scenarios/junior-20261123-1142.spec.js。ここは
//   - 既定は 2 倍、選べるのは 1〜4 倍、覚えるのは道具 (storage) の 1 つの値だけ
//   - 画素数は SVG の寸法 × 倍率。描ける上限を超える画素数は描かずに止めて理由を言う (空・欠けた PNG を書かない)
//   - PNG を出すどの入口 (Export ▾ の PNG・透過 PNG・クリップボード・まとめての書き出し) も同じ _rasterSvgEl を通る
// を守る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var fs = require('fs');
var path = require('path');

try { delete require.cache[require.resolve('../src/core/png-scale.js')]; } catch (e) {}
require('../src/core/png-scale.js');
try { delete require.cache[require.resolve('../src/core/export-dest.js')]; } catch (e) {}
require('../src/core/export-dest.js');
var PS = global.window.MA.pngScale;
var ED = global.window.MA.exportDest;
var APP = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
var HTML = fs.readFileSync(path.join(__dirname, '..', 'plantuml-assist.html'), 'utf8');

function mem(init) {
  var m = Object.assign({}, init || {});
  return {
    m: m,
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function(k, v) { m[k] = String(v); },
    removeItem: function(k) { delete m[k]; },
  };
}
function slice(src, from, to) {
  var i = src.indexOf(from);
  var j = src.indexOf(to, i + from.length);
  return i < 0 ? '' : src.slice(i, j < 0 ? src.length : j);
}

describe('pngScale: 倍率の読み書き', function() {
  test('何も選んでいなければ 2 倍 (資料に貼って字がつぶれない)', function() {
    expect(PS.DEFAULT).toBe(2);
    expect(PS.load(mem())).toBe(2);
    expect(PS.load(null)).toBe(2);
  });
  test('選べるのは 1 倍と 4 倍を含む並び', function() {
    expect(PS.SCALES).toEqual([1, 2, 3, 4]);
    expect(PS.SCALES.map(PS.label)).toEqual(['1 倍', '2 倍', '3 倍', '4 倍']);
  });
  test('覚えた倍率を読み、選べない値・壊れた記憶は既定に戻す', function() {
    expect(PS.load(mem({ 'pua.png-scale': '4' }))).toBe(4);
    expect(PS.load(mem({ 'pua.png-scale': '1' }))).toBe(1);
    expect(PS.load(mem({ 'pua.png-scale': '7' }))).toBe(2);
    expect(PS.load(mem({ 'pua.png-scale': 'x' }))).toBe(2);
    var boom = { getItem: function() { throw new Error('denied'); } };
    expect(PS.load(boom)).toBe(2);
  });
  test('覚えるのは道具の 1 つの鍵だけ。選べない値は覚えない', function() {
    var s = mem();
    expect(PS.save(s, '4')).toBe(4);
    expect(s.m).toEqual({ 'pua.png-scale': '4' });
    expect(PS.save(s, 9)).toBeNull();
    expect(PS.save(s, '')).toBeNull();
    expect(s.m).toEqual({ 'pua.png-scale': '4' });
    expect(PS.load(s)).toBe(4);
  });
});

describe('pngScale: 画素数と描ける上限', function() {
  test('画素数は SVG の寸法 × 倍率', function() {
    expect(PS.size(303, 324, 2)).toEqual({ ok: true, w: 606, h: 648, scale: 2 });
    expect(PS.size(303, 324, 1)).toEqual({ ok: true, w: 303, h: 324, scale: 1 });
    expect(PS.size(303, 324, 4)).toEqual({ ok: true, w: 1212, h: 1296, scale: 4 });
    expect(PS.size(109.5, 40.25, 2)).toEqual({ ok: true, w: 219, h: 81, scale: 2 });
  });
  test('選べない倍率は既定の 2 倍で数える', function() {
    expect(PS.size(100, 50, 9)).toEqual({ ok: true, w: 200, h: 100, scale: 2 });
  });
  test('描ける上限を超える画素数は描かずに止め、画素数と直し方を言う', function() {
    var r = PS.size(5000, 3000, 4);
    expect(r.ok).toBe(false);
    expect(r.w).toBe(20000);
    expect(r.error).toContain('書き出しませんでした');
    expect(r.error).toContain('20000×12000 px');
    expect(r.error).toContain('PNG の大きさ');
    // 一辺は上限ちょうどまで描ける。1 px 超えたら止める
    expect(PS.size(PS.MAX_SIDE, 10, 1).ok).toBe(true);
    expect(PS.size(PS.MAX_SIDE + 1, 10, 1).ok).toBe(false);
    expect(PS.size(PS.MAX_SIDE / 2 + 1, 10, 2).ok).toBe(false);
    // 面積の上限
    expect(PS.MAX_AREA).toBeLessThanOrEqual(268435456);
    expect(PS.size(16384, 16384, 1).ok).toBe(true);
  });
  test('寸法が読めない図は描かない', function() {
    expect(PS.size(0, 100, 2).ok).toBe(false);
    expect(PS.size(NaN, 100, 2).ok).toBe(false);
    expect(PS.size(100, -1, 2).error).toContain('寸法');
  });
  test('描いた canvas が頼んだ画素数でなければ書かない', function() {
    expect(PS.drawnOk({ width: 606, height: 648 }, { w: 606, h: 648 })).toBe(true);
    expect(PS.drawnOk({ width: 0, height: 0 }, { w: 606, h: 648 })).toBe(false);
    expect(PS.drawnOk(null, { w: 1, h: 1 })).toBe(false);
  });
  test('書いた後の言い方は画素数と倍率', function() {
    expect(PS.pxLabel({ ok: true, w: 606, h: 648, scale: 2 })).toBe('606×648 px (2 倍)');
    expect(ED.message({ rel: 'a.png', bytes: 9, existed: false, path: 'C:/w/a.png' }, '', '', '606×648 px (2 倍)'))
      .toBe('書き出しました: a.png → 図と同じフォルダ · 9 バイト · 新規 · 606×648 px (2 倍)（C:/w/a.png）');
    // SVG は画素数を言わない (今のまま)
    expect(ED.message({ rel: 'a.svg', bytes: 9, existed: true }, '', '')).toBe('書き出しました: a.svg → 図と同じフォルダ · 9 バイト · 上書き');
  });
});

describe('PNG の大きさ: 画面側の道 (src/app.js・plantuml-assist.html)', function() {
  var raster = slice(APP, 'function _rasterSvgEl', '\n// プレビューの図を PNG の canvas にする');
  test('倍率は道具の記憶 (MA.pngScale) から読み、上限を超えたら描かずに理由を返す', function() {
    expect(raster).toContain('PS.size(w, h, _pngScale())');
    expect(raster).toContain('if (!sz.ok) { done(null, sz, sz.error); return; }');
    expect(raster).toContain('PS.drawnOk(canvas, sz)');
  });
  test('1 倍の絵を引き伸ばさず、SVG の寸法を画素数に替えて SVG から描き直す', function() {
    expect(raster).toContain("el.setAttribute('width', String(sz.w));");
    expect(raster).toContain("el.setAttribute('height', String(sz.h));");
    expect(raster).toContain('canvas.width = sz.w;');
    expect(raster).toContain('ctx.drawImage(img, 0, 0, sz.w, sz.h);');
  });
  test('Export ▾ の PNG・透過 PNG・クリップボード・まとめての書き出しは同じ道を通る', function() {
    expect(slice(APP, 'function svgToCanvas', '\nfunction exportPNG')).toContain('_rasterSvgEl(clone, w, h, transparent,');
    expect(slice(APP, 'function _svgTextToPngBlob', '\n// その図の本文')).toContain('_rasterSvgEl(s.el, s.w, s.h, transparent,');
    expect(slice(APP, 'function exportClipboard', '\n// 指定の行へ飛ぶ')).toContain('svgToCanvas(false,');
    expect(slice(APP, 'function _exportPngNow', '\n// ──')).toContain('PS.pxLabel(sz)');
  });
  test('書き出しのために本文へ scale / skinparam dpi を書き足さない', function() {
    expect(APP.indexOf("'scale '")).toBe(-1);
    expect(APP.indexOf('skinparam dpi')).toBe(-1);
  });
  test('Export ▾ の中に「PNG の大きさ」の行が 1 つ。項目 (直下の button) は 4 つのまま', function() {
    var menu = slice(HTML, '<div id="export-menu">', '<select id="diagram-type"');
    expect(menu.split('id="export-png-scale"').length - 1).toBe(1);
    expect(menu).toContain('PNG の大きさ:');
    expect((menu.match(/\n {8}<button id="exp-/g) || []).length).toBe(4);
    expect(HTML).toContain('<script src="src/core/png-scale.js"></script>');
  });
});
