'use strict';
window.MA = window.MA || {};
// BLK-owner-20260924-2232-4: 図の編集の窓と「末尾に追加」のフォームをキーボードだけで確定する。
// 図種ごとに付けず、窓 (`{図種}-modal`) と末尾に追加 (`{図種}-tail-detail`) の形で 1 か所から当てる。
//   窓: 入力欄・選択欄で Enter、どこでも Ctrl+Enter で `*-confirm` を押す。Esc で `*-cancel` を押す。
//       本文欄 (rich-label-editor) の Enter は欄が出す rle-enter、Esc は rle-escape で受ける (Shift+Enter は改行)。
//   末尾に追加: 入力欄・選択欄で Enter、本文欄で Enter (rle-enter) を押すと `*-tail-add` を押す。
// 先に自分で Enter / Esc を扱う欄 (候補の一覧・遷移の続け入れ) は preventDefault するので、ここでは触らない。
// ボタンに添える「(Enter)」「(Esc)」の表記は plantuml-assist.html の CSS が同じ形で付ける。
window.MA.modalKeys = (function() {
  var EDIT_MODALS = ['seq-modal', 'act-modal', 'st-modal', 'st-tx-modal', 'st-br-modal', 'cl-sc-modal', 'seq-sc-modal'];
  var TEXT_TYPES = /^(text|search|number|email|url|tel|password|checkbox|radio)$/;

  function isOpen(modal) {
    return !!modal && modal.style.display !== 'none' && modal.style.display !== '';
  }
  function visibleButton(root, suffix) {
    var list = root.querySelectorAll('button[id$="' + suffix + '"]');
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (b.disabled || b.hidden) continue;
      if (b.style && b.style.display === 'none') continue;
      return b;
    }
    return null;
  }
  // Enter で確定してよい欄か (ボタン上の Enter はそのボタンを押す既定のまま、複数行の欄は改行のまま)。
  function isEnterField(el) {
    if (!el || !el.tagName) return false;
    if (el.tagName === 'SELECT') return true;
    if (el.tagName !== 'INPUT') return false;
    return TEXT_TYPES.test(String(el.type || 'text').toLowerCase());
  }
  function press(btn, e) {
    if (!btn) return false;
    // 押した後に窓が閉じ・右パネルが描き直されると、document の Enter (選択の直後に挿入) が続けて動くので止める。
    if (e) { e.preventDefault(); e.stopImmediatePropagation(); }
    btn.click();
    return true;
  }

  // 窓の中のキー。窓の外側 (overlay) で受け、document の既定キー (Enter = 選択の直後に挿入 等) へは流さない。
  function onModalKey(e) {
    var modal = e.currentTarget;
    if (!isOpen(modal) || e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      press(visibleButton(modal, '-cancel'), e);
      return;
    }
    if (e.key !== 'Enter' || e.altKey || e.shiftKey) return;
    if (e.ctrlKey || e.metaKey) { press(visibleButton(modal, '-confirm'), e); return; }
    if (isEnterField(e.target)) press(visibleButton(modal, '-confirm'), e);
  }
  function onModalRle(e) {
    var modal = e.currentTarget;
    if (!isOpen(modal)) return;
    var btn = visibleButton(modal, e.type === 'rle-enter' ? '-confirm' : '-cancel');
    if (btn) { e.stopPropagation(); btn.click(); }
  }

  // 末尾に追加のフォーム (右パネル)。
  function tailButton(target) {
    var form = target && target.closest ? target.closest('[id$="-tail-detail"]') : null;
    return form ? visibleButton(form, '-tail-add') : null;
  }
  // BLK-owner-20260925-0312-4: 末尾に追加の本文欄 (textarea) のうち data-enter="submit" のものは、
  // Enter で確定・Shift+Enter で改行 (アクティビティの処理欄・注釈欄)。
  function isTailEnterArea(el) {
    return !!el && el.tagName === 'TEXTAREA' && el.getAttribute && el.getAttribute('data-enter') === 'submit';
  }
  function onTailKey(e) {
    if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (!isEnterField(e.target) && !isTailEnterArea(e.target)) return;
    press(tailButton(e.target), e);
  }
  function onTailRle(e) {
    var btn = tailButton(e.target);
    if (btn) btn.click();
  }

  function bindModal(modal) {
    if (!modal || modal._maModalKeys) return;
    modal._maModalKeys = true;
    modal.addEventListener('keydown', onModalKey);
    modal.addEventListener('rle-enter', onModalRle);
    modal.addEventListener('rle-escape', onModalRle);
  }
  function init(doc) {
    doc = doc || document;
    EDIT_MODALS.forEach(function(id) { bindModal(doc.getElementById(id)); });
    // document の keydown は app.js より先に付ける (同じ document の後続を stopImmediatePropagation で止めるため)。
    if (!doc._maTailKeys) {
      doc._maTailKeys = true;
      doc.addEventListener('keydown', onTailKey);
      doc.addEventListener('rle-enter', onTailRle);
    }
  }

  if (typeof document !== 'undefined') {
    init(document);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { init(document); });
  }

  return { init: init, bindModal: bindModal, EDIT_MODALS: EDIT_MODALS };
})();
