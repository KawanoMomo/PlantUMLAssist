'use strict';
window.MA = window.MA || {};
window.MA.htmlUtils = (function() {
  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { escHtml: escHtml };
})();

// FEAT-015: 削除の confirm() を廃し、「元に戻す」付きの一時トーストで代替する。
// 🔴 技術的負債 (迂回実装): 本来この UI 部品は独立ファイル src/core/toast.js に置き、
//    CSS は plantuml-assist.html の <style> に書くべきである。しかし
//    plantuml-assist.html は本エージェントの write_scope 外であり <script> タグを
//    追加できないため、既読込みの本ファイルへ相乗りし、スタイルはインライン指定で
//    生成している (loop_agent/feature_implementer.md の CSS 暫定運用 / FEAT-033 方式)。
//    write_scope が拡張された際は src/core/toast.js への切り出しと CSS の正本化を行うこと。
window.MA.toast = (function() {
  var TOAST_ID = 'ma-toast';
  var HIDE_MS = 6000;
  var timer = null;

  function dismiss() {
    if (timer) { clearTimeout(timer); timer = null; }
    var old = document.getElementById(TOAST_ID);
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  // show(message, undoLabel, onUndo)
  // onUndo が関数のときのみ「元に戻す」ボタンを出す。
  function show(message, undoLabel, onUndo) {
    dismiss();
    var box = document.createElement('div');
    box.id = TOAST_ID;
    box.setAttribute('role', 'status');
    var s = box.style;
    s.position = 'fixed';
    s.left = '50%';
    s.bottom = '24px';
    s.transform = 'translateX(-50%)';
    s.zIndex = '9999';
    s.display = 'flex';
    s.alignItems = 'center';
    s.gap = '12px';
    s.padding = '10px 16px';
    s.borderRadius = '6px';
    s.background = '#333a45';
    s.color = '#fff';
    s.font = '13px sans-serif';
    s.boxShadow = '0 2px 10px rgba(0,0,0,0.35)';

    var text = document.createElement('span');
    text.textContent = String(message);
    box.appendChild(text);

    if (typeof onUndo === 'function') {
      var btn = document.createElement('button');
      btn.className = 'ma-toast-undo';
      btn.textContent = undoLabel || '元に戻す';
      var bs = btn.style;
      bs.background = 'transparent';
      bs.border = '1px solid #8ab4f8';
      bs.color = '#8ab4f8';
      bs.borderRadius = '4px';
      bs.padding = '3px 10px';
      bs.cursor = 'pointer';
      bs.font = 'inherit';
      btn.addEventListener('click', function() {
        dismiss();
        onUndo();
      });
      box.appendChild(btn);
    }

    document.body.appendChild(box);
    timer = setTimeout(dismiss, HIDE_MS);
    return box;
  }

  return { show: show, dismiss: dismiss };
})();
