'use strict';
window.MA = window.MA || {};
// insert-marker — design 5c「Sequence — 途中に挿入」の
// 「DSL の何行目に入るかも同時に示す」。
//
// 挿入メニューの見出しには「DSL 8 行目に挿入」と数字が出るが、DSL 側には何も出ず、
// 長い図ではその 8 行目が画面のどこなのか目で追えない。挿入メニューを開いている間だけ
// エディタの挿入先の行に `← N 行目に挿入` を重ね、行番号ガターの同じ行を強調する。
// あわせて右パネルに「いまは挿入位置を選んでいます」を出す (design 5c の右ペイン)。
//
// 位置の計算 (targetLine / offsetTop / isRowVisible) と文言 (labelText) は
// DOM に触らない純関数として分けてある。
window.MA.insertMarker = (function() {
  // CSS の #editor / #line-numbers と同じ値。font-size 13px × line-height 1.5。
  // ここと CSS がずれると行が 1 つずれて指すので、値はこの 1 箇所に置く。
  var LINE_HEIGHT = 19.5;
  var PAD_TOP = 8;

  var HINT_TEXT = 'いまは挿入位置を選んでいます。Esc で取り消し';

  var els = null;    // { wrap, editor, gutter, marker, hint }
  var target = null; // 表示中の挿入先行番号 (1 始まり)。null なら非表示

  // ── 純関数 ───────────────────────────────────────────────

  // 挿入先の DSL 行番号。before はその行、after は次の行。
  function targetLine(line, position) {
    var n = parseInt(line, 10);
    if (isNaN(n)) return null;
    return position === 'before' ? n : n + 1;
  }

  function labelText(t) {
    if (t === null || typeof t === 'undefined') return '';
    return '← ' + t + ' 行目に挿入';
  }

  // マーカーの上端 (px)。#editor-wrap 内の座標なのでスクロール量を引く。
  function offsetTop(t, scrollTop) {
    if (t === null || typeof t === 'undefined') return 0;
    return PAD_TOP + (t - 1) * LINE_HEIGHT - (scrollTop || 0);
  }

  // その行が編集領域の中に見えているか。外に出ているならラベルは出さない
  // (端に貼り付いた、どの行を指しているのか分からないラベルを作らない)。
  function isRowVisible(t, scrollTop, viewportHeight) {
    if (t === null || typeof t === 'undefined') return false;
    var top = offsetTop(t, scrollTop);
    return top >= 0 && top + LINE_HEIGHT <= (viewportHeight || 0);
  }

  // その行を見える位置に持ってくるための scrollTop。既に見えていれば今の値のまま。
  function scrollTopFor(t, scrollTop, viewportHeight) {
    var cur = scrollTop || 0;
    if (isRowVisible(t, cur, viewportHeight)) return cur;
    var rowTop = PAD_TOP + (t - 1) * LINE_HEIGHT;
    // 上に隠れているなら行の頭へ、下に隠れているなら領域の真ん中あたりへ。
    if (rowTop < cur) return Math.max(0, rowTop - PAD_TOP);
    return Math.max(0, rowTop - (viewportHeight || 0) / 2);
  }

  // 行番号ガターの HTML。target の行だけ目印用の class を付ける。
  function gutterHtml(count, t, escHtml) {
    var esc = escHtml || function(s) { return String(s); };
    var out = [];
    // BLK-primary-20260908-1603: 行番号にマウスを乗せて対応する図形を光らせたいので、
    // どの番号も data-line を持つ span で包む (挿入先だけ従来どおり目印の class が付く)。
    for (var i = 1; i <= count; i++) {
      var cls = 'ln' + (i === t ? ' ln-insert-target' : '');
      out.push('<span class="' + cls + '" data-line="' + i + '">' + esc(String(i)) + '</span>');
    }
    return out.join('\n');
  }

  // ── DOM ─────────────────────────────────────────────────

  function init(elements) {
    els = elements || null;
    if (els && els.hint) els.hint.textContent = HINT_TEXT;
    hide();
  }

  function getTarget() { return target; }

  // 表示中のマーカーを今のスクロール位置に合わせ直す。
  function sync() {
    if (!els || !els.marker) return;
    if (target === null) { els.marker.hidden = true; return; }
    var scrollTop = els.editor ? (els.editor.scrollTop || 0) : 0;
    var h = els.editor ? (els.editor.clientHeight || 0) : 0;
    els.marker.style.top = offsetTop(target, scrollTop) + 'px';
    els.marker.hidden = !isRowVisible(target, scrollTop, h);
  }

  function _renderGutter() {
    if (!els || !els.gutter || !els.editor) return;
    var count = ((els.editor.value || '').match(/\n/g) || []).length + 1;
    var esc = (window.MA.htmlUtils && window.MA.htmlUtils.escHtml) || null;
    els.gutter.innerHTML = gutterHtml(count, target, esc);
  }

  // show(line, position) — 挿入メニューを開くときに呼ぶ。
  function show(line, position) {
    var t = targetLine(line, position);
    if (t === null) return null;
    target = t;
    if (!els) return t;
    if (els.editor) {
      var h = els.editor.clientHeight || 0;
      els.editor.scrollTop = scrollTopFor(t, els.editor.scrollTop || 0, h);
    }
    if (els.marker) {
      els.marker.textContent = labelText(t);
      els.marker.hidden = false;
    }
    if (els.hint) els.hint.hidden = false;
    _renderGutter();
    if (els.gutter && els.editor) els.gutter.scrollTop = els.editor.scrollTop || 0;
    sync();
    return t;
  }

  function hide() {
    target = null;
    if (!els) return;
    if (els.marker) els.marker.hidden = true;
    if (els.hint) els.hint.hidden = true;
    _renderGutter();
  }

  return {
    LINE_HEIGHT: LINE_HEIGHT,
    PAD_TOP: PAD_TOP,
    HINT_TEXT: HINT_TEXT,
    targetLine: targetLine,
    labelText: labelText,
    offsetTop: offsetTop,
    isRowVisible: isRowVisible,
    scrollTopFor: scrollTopFor,
    gutterHtml: gutterHtml,
    init: init,
    show: show,
    hide: hide,
    sync: sync,
    getTarget: getTarget,
  };
})();
