'use strict';

// side-pane — 右側に並ぶ読み専用の枠 (参照ペイン・先輩の図の枠) の、
// 「閉じる」と「幅」の規則を 1 か所に置く。
//
// BLK-human-20260915-1203: 先輩の図の枠は起動時から出ていて × を押しても隠れず、
// 幅も変えられなかった。隠れない原因は CSS の `display: flex` が `hidden` 属性より
// 強いこと (枠ごとに `[hidden]` を書き足し忘れる)。幅は誰も持っていなかった。
// 片方の枠だけ直すと参照ペインと挙動が食い違うので、両方の枠がここを使う。
//
// ここが持つのは値の判断だけ (幅の丸め、覚えておく形)。DOM の付け外しは app.js。
(function() {
  var MIN_WIDTH = 220;      // これより狭いと図が読めない (枠の値打ちが消える)
  var MAX_RATIO = 0.7;      // 主プレビューを潰さない
  var DEFAULT_WIDTH = 360;

  function _s(v) { return v === null || v === undefined ? '' : String(v); }
  function _n(v) { var n = Number(v); return isFinite(n) ? n : NaN; }

  // clampWidth(w, availWidth) — ドラッグ中も読み込み時も同じ丸めを通す。
  // availWidth は枠を置く親 (#main) の幅。分からなければ上限を掛けない。
  function clampWidth(w, availWidth) {
    var n = _n(w);
    if (isNaN(n)) return DEFAULT_WIDTH;
    var avail = _n(availWidth);
    var max = isNaN(avail) || avail <= 0 ? Infinity : Math.max(MIN_WIDTH, Math.round(avail * MAX_RATIO));
    return Math.round(Math.max(MIN_WIDTH, Math.min(max, n)));
  }

  // 覚えておく形。open / width / seen (初回の説明を出したか) の 3 つだけ。
  function normalize(state) {
    var s = state || {};
    return {
      open: !!s.open,
      width: clampWidth(s.width === undefined || s.width === null || s.width === '' ? DEFAULT_WIDTH : s.width),
      seen: !!s.seen,
    };
  }

  function _store(store) {
    if (store) return store;
    return typeof localStorage !== 'undefined' ? localStorage : null;
  }

  function load(key, store) {
    var st = _store(store);
    if (!st || !_s(key)) return normalize(null);
    try {
      return normalize(JSON.parse(st.getItem(key) || '{}'));
    } catch (e) { return normalize(null); }
  }

  function save(key, state, store) {
    var v = normalize(state);
    var st = _store(store);
    if (!st || !_s(key)) return v;
    try { st.setItem(key, JSON.stringify(v)); } catch (e) { /* 保存できなくても画面は動く */ }
    return v;
  }

  var api = {
    MIN_WIDTH: MIN_WIDTH, MAX_RATIO: MAX_RATIO, DEFAULT_WIDTH: DEFAULT_WIDTH,
    clampWidth: clampWidth, normalize: normalize, load: load, save: save,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.sidePane = api;
  }
})();
