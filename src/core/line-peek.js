'use strict';
// line-peek — 「選ぶ前」に DSL 行と SVG 図形の対応を見せる。
//
// BLK-primary-20260908-1603: 遷移ラベルを直す作業でいちばん手間だったのは
// 書き換えそのものではなく「どの矢印が何行目か」を目で探す段階だった。
// overlay の rect は data-line を持っているのに、選ぶまで表示上の手掛かりが無い。
// そこで DSL 側でキャレットが乗った行・行番号にマウスが乗った行に対応する rect を
// 薄く光らせる (peek)。選択 (selected) とは別の class なので、選択状態を壊さない。
//
// DOM にも図種モジュールにも依存しない部分は純関数として切り出す。
window.MA = window.MA || {};
window.MA.linePeek = (function() {

  var PEEK_CLASS = 'peek';

  // テキストとキャレット位置 (textarea.selectionStart) から 1 始まりの行番号。
  function lineAtCaret(text, pos) {
    if (typeof text !== 'string') return null;
    var n = parseInt(pos, 10);
    if (isNaN(n) || n < 0) return null;
    if (n > text.length) n = text.length;
    return text.substring(0, n).split('\n').length;
  }

  // 行番号 → overlay 内の rect を引く CSS セレクタ。数でなければ null
  // (null のときは「対応を消す」= 何も光らせない)。
  function selectorFor(line) {
    var n = parseInt(line, 10);
    if (isNaN(n) || n < 1) return null;
    return 'rect.selectable[data-line="' + n + '"]';
  }

  // ── DOM ─────────────────────────────────────────────────
  // overlay の rect から peek を外し、line に対応するものだけに付け直す。
  // 付いた rect の数を返す (0 ならその行に対応する図形は無い)。
  function apply(overlayEl, line) {
    if (!overlayEl || !overlayEl.querySelectorAll) return 0;
    var all = overlayEl.querySelectorAll('rect.' + PEEK_CLASS);
    Array.prototype.forEach.call(all, function(r) { r.classList.remove(PEEK_CLASS); });
    var sel = selectorFor(line);
    if (!sel) return 0;
    var hits = overlayEl.querySelectorAll(sel);
    Array.prototype.forEach.call(hits, function(r) { r.classList.add(PEEK_CLASS); });
    return hits.length;
  }

  function clear(overlayEl) { return apply(overlayEl, null); }

  return {
    PEEK_CLASS: PEEK_CLASS,
    lineAtCaret: lineAtCaret,
    selectorFor: selectorFor,
    apply: apply,
    clear: clear,
  };
})();
