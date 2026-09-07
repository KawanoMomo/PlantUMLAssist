'use strict';
window.MA = window.MA || {};

// editor-jump — 図の要素を選んだとき、DSL の該当行へエディタを動かす (design 5a)。
//
// 図と DSL の対応は行番号でしか結ばれていないので、対応を目で数えるしかなかった。
// 選択が持っている line をそのまま textarea の選択範囲とスクロール位置に翻訳する。
// ここは DOM に触らない純関数だけを置き、textarea への適用は app.js。
window.MA.editorJump = (function() {
  // 1 始まりの行番号を textarea の文字オフセットへ。範囲外は末尾/先頭に丸める
  // (パースと表示の間で 1 行ずれても例外にせず、近い場所へ運ぶ)。
  function lineRange(text, lineNum) {
    var src = text == null ? '' : String(text);
    var lines = src.split('\n');
    // null / '' / true は Number() が数値にしてしまうので、先に弾く。
    if (typeof lineNum !== 'number' && typeof lineNum !== 'string') return null;
    if (lineNum === '') return null;
    var n = Number(lineNum);
    if (!isFinite(n)) return null;
    n = Math.max(1, Math.min(lines.length, Math.round(n)));
    var start = 0;
    for (var i = 0; i < n - 1; i++) start += lines[i].length + 1;
    return { start: start, end: start + lines[n - 1].length, line: n };
  }

  // 該当行が見えていなければ、その行が真ん中に来る位置まで動かす。既に見えて
  // いるなら動かさない (クリックのたびに画面が跳ねると読んでいる場所を見失う)。
  function scrollTopFor(lineNum, opts) {
    var o = opts || {};
    var lineHeight = Number(o.lineHeight) || 18;
    var viewport = Number(o.viewportHeight) || 0;
    var current = Number(o.scrollTop) || 0;
    var n = Math.max(1, Math.round(Number(lineNum) || 1));
    var top = (n - 1) * lineHeight;
    if (viewport <= 0) return top;
    var visibleTop = current;
    var visibleBottom = current + viewport;
    if (top >= visibleTop && top + lineHeight <= visibleBottom) return current;
    var centered = top - (viewport / 2) + (lineHeight / 2);
    return Math.max(0, Math.round(centered));
  }

  // 選択のうち、どの行へ運ぶか。複数選ばれているときは一番上の行に寄せる
  // (選択の順ではなく DSL の並びで決めるので、選ぶ順序によって行き先が変わらない)。
  function targetLine(selection) {
    var sel = selection || [];
    var lines = [];
    for (var i = 0; i < sel.length; i++) {
      var n = Number(sel[i] && sel[i].line);
      if (isFinite(n) && n >= 1) lines.push(Math.round(n));
    }
    if (lines.length === 0) return null;
    return Math.min.apply(null, lines);
  }

  return {
    lineRange: lineRange,
    scrollTopFor: scrollTopFor,
    targetLine: targetLine,
  };
})();
