'use strict';
// TICKET-junior-20261123-1142-wish (roadmap v9.0 必須 1): PNG の大きさ (倍率)。
// PNG は SVG の寸法 × 倍率の画素数で、SVG から描き直して出す (1 倍の絵を引き伸ばさない)。既定は 2 倍 (資料に貼って字がつぶれない)。
// 倍率は Export ▾ の中の 1 か所で替え、道具 (ブラウザ) に 1 つだけ覚える。図ごと・形式ごとに分けず、保存先にも本文にも書かない
// (本文に scale / skinparam dpi を書き足さない。手で書いた scale はその図の SVG の寸法として今どおり効く)。
// PNG を出すどの入口 (Export ▾ の PNG・PNG（透過背景）、保存先の一覧のまとめての書き出し、クリップボード) も同じ倍率。
// 描ける上限を超える画素数は描かずに止めて理由を返す (空・欠けた PNG を知らせ無しに書かない)。
// DOM は触らない (倍率の読み書き・画素数・言い方だけ)。画面の配線は src/app.js (_rasterSvgEl / Export ▾ の「PNG の大きさ」)。
window.MA = window.MA || {};
window.MA.pngScale = (function() {
  var KEY = 'pua.png-scale';
  var SCALES = [1, 2, 3, 4];
  var DEFAULT = 2;
  // ブラウザの canvas が描ける上限 (Chromium の一辺 32767 と面積 268,435,456 の内側)。超えると空・欠けた絵になる。
  var MAX_SIDE = 16384;
  var MAX_AREA = 16384 * 16384;

  // norm(v) — 選べる倍率ならその数、そうでなければ null。
  function norm(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return SCALES.indexOf(n) >= 0 ? n : null;
  }

  // load(storage) — 覚えている倍率。覚えていない・読めない・選べない値なら既定 (2 倍)。
  function load(storage) {
    try {
      var n = norm(storage ? storage.getItem(KEY) : null);
      return n === null ? DEFAULT : n;
    } catch (e) { return DEFAULT; }
  }

  // save(storage, v) — 倍率を覚える。返り値は覚えた倍率 (選べない値は覚えず null)。
  function save(storage, v) {
    var n = norm(v);
    if (n === null) return null;
    try { if (storage) storage.setItem(KEY, String(n)); } catch (e) {}
    return n;
  }

  function label(scale) { return String(scale) + ' 倍'; }

  // pxLabel(sz) — 「606×648 px (2 倍)」。
  function pxLabel(sz) {
    if (!sz) return '';
    return sz.w + '×' + sz.h + ' px' + (sz.scale ? ' (' + label(sz.scale) + ')' : '');
  }

  // size(w, h, scale) — SVG の寸法 w×h を倍率で描く PNG の画素数。
  //   { ok: true, w, h, scale } / { ok: false, w, h, scale, error } (寸法が読めない・描ける上限を超える)
  function size(w, h, scale) {
    var s = norm(scale);
    if (s === null) s = DEFAULT;
    var w0 = Number(w), h0 = Number(h);
    if (!(w0 > 0) || !(h0 > 0) || !isFinite(w0) || !isFinite(h0)) {
      return { ok: false, w: 0, h: 0, scale: s, error: '書き出しませんでした: 図の寸法が読めません' };
    }
    var W = Math.max(1, Math.round(w0 * s));
    var H = Math.max(1, Math.round(h0 * s));
    var r = { ok: true, w: W, h: H, scale: s };
    if (W > MAX_SIDE || H > MAX_SIDE || W * H > MAX_AREA) {
      r.ok = false;
      r.error = '書き出しませんでした: PNG が ' + W + '×' + H + ' px (' + label(s) + ') になり、ブラウザが描ける大きさ (一辺 ' +
        MAX_SIDE + ' px) を超えます。Export ▾ の「PNG の大きさ」を小さくしてください';
    }
    return r;
  }

  // drawnOk(canvas, sz) — 描いた canvas が頼んだ画素数のままか (ブラウザが黙って縮めた・描けなかった絵を書かない)。
  function drawnOk(canvas, sz) {
    return !!(canvas && sz && canvas.width === sz.w && canvas.height === sz.h);
  }

  return {
    KEY: KEY, SCALES: SCALES, DEFAULT: DEFAULT, MAX_SIDE: MAX_SIDE, MAX_AREA: MAX_AREA,
    norm: norm, load: load, save: save, label: label, pxLabel: pxLabel, size: size, drawnOk: drawnOk,
  };
})();
