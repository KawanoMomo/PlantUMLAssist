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
  // BLK-owner-20260930-0311-2: 注釈の本文欄 (`{図種}-tail-ntext`) は図種を問わずこの 1 か所で Enter 確定にする
  // (状態遷移・クラス・ユースケースは改行が入るだけで行が書かれなかった)。まとめて入れる欄は改行のまま。
  var TAIL_NOTE_AREA_RE = /-tail-ntext$/;
  function isTailEnterArea(el) {
    if (!el || el.tagName !== 'TEXTAREA' || !el.getAttribute) return false;
    if (el.getAttribute('data-enter') === 'submit') return true;
    return TAIL_NOTE_AREA_RE.test(el.id || '') && !!(el.closest && el.closest('[id$="-tail-detail"]'));
  }

  // BLK-owner-20260930-0311-2: 末尾に追加の欄のうち既定の値を持つもの (条件分岐の yes / no、枝の数 …) は、
  // 押す・Tab で入ると値全体が選ばれた状態になり、打てば置き換わる (値の後ろに付け足して `yesyes` にならない)。
  // 既定のまま (value が描いたときの値と同じ) の欄だけ。打ちかけの欄はキャレットをそのまま置く。
  function isDefaultField(el) {
    if (!el || el.tagName !== 'INPUT' || !TEXT_TYPES.test(String(el.type || 'text').toLowerCase())) return false;
    if (/^(checkbox|radio)$/i.test(el.type || '')) return false;
    if (!el.closest || !el.closest('[id$="-tail-detail"]')) return false;
    return el.value !== '' && el.value === el.defaultValue;
  }
  function onTailFocus(e) {
    var el = e.target;
    if (!isDefaultField(el)) return;
    try { el.select(); } catch (err) { return; }
    // 押して入ったとき、ボタンを離した時点でブラウザが選択をキャレットに戻すので、その 1 回だけ止める。
    el._maSelectOnUp = true;
  }
  function onTailMouseUp(e) {
    var el = e.target;
    if (!el || !el._maSelectOnUp) return;
    el._maSelectOnUp = false;
    e.preventDefault();
  }
  function onTailBlur(e) {
    if (e.target && e.target._maSelectOnUp) e.target._maSelectOnUp = false;
  }
  // BLK-owner-20260926-0550-1: 確定すると右パネルが描き直され、キャレットが BODY に落ちて次の 1 件を打つたびに
  // 欄を押し直していた。確定の後に描き直された「末尾に追加」のフォームへキャレットを戻す。
  // 戻す先は Enter を押した欄 (同じ id / 同じ本文欄)。ボタンを押して確定したときや、その欄が無くなったときは
  // その種別の最初に打つ欄 (本文欄があれば本文、無ければ最初の文字欄)。
  // 描き直されなかった確定 (必須が空で止めた・To を選ばせた) では動かさない (知らせた欄のキャレットを奪わない)。
  var _pendingKey = null;
  function _fieldKey(el) {
    if (!el || !el.closest) return null;
    var key = null;
    var rle = el.closest('[id$="-rle"]');
    if (rle && rle.id) key = { rle: rle.id };
    else if (el.id) key = { id: el.id };
    // 描き直しを待つ間に打った字 (確定した字の後ろに続けて打った分) を、描き直した欄へ持ち越すために覚える。
    if (key && typeof el.value === 'string') { key.el = el; key.val = el.value; }
    return key;
  }
  // 確定から描き直しまでの間に古い欄へ打った字。無ければ ''。
  function _typedSince(key) {
    if (!key || !key.el || typeof key.el.value !== 'string' || typeof key.val !== 'string') return '';
    var now = key.el.value;
    if (now.length <= key.val.length || now.indexOf(key.val) !== 0) return '';
    return now.slice(key.val.length);
  }
  function _hiddenIn(el, form) {
    for (var n = el; n && n !== form; n = n.parentNode) {
      if (n.hidden) return true;
      if (n.style && n.style.display === 'none') return true;
    }
    return false;
  }
  function firstTypingField(form) {
    if (!form || !form.querySelectorAll) return null;
    var rles = form.querySelectorAll('[id$="-rle"] textarea');
    for (var r = 0; r < rles.length; r++) if (!_hiddenIn(rles[r], form)) return rles[r];
    var list = form.querySelectorAll('input, textarea');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.disabled || el.readOnly) continue;
      if (el.tagName === 'INPUT' && !TEXT_TYPES.test(String(el.type || 'text').toLowerCase())) continue;
      if (el.tagName === 'INPUT' && /^(checkbox|radio)$/i.test(el.type || '')) continue;
      if (_hiddenIn(el, form)) continue;
      return el;
    }
    return null;
  }
  function _resolve(formId, key) {
    var doc = typeof document !== 'undefined' ? document : null;
    if (!doc) return null;
    var el = null;
    if (key && key.id) el = doc.getElementById(key.id);
    else if (key && key.rle) {
      var c = doc.getElementById(key.rle);
      el = c ? c.querySelector('textarea') : null;
    }
    var form = doc.getElementById(formId);
    if (el && form && !form.contains(el)) el = null;
    return el || firstTypingField(form);
  }
  function refocusAfterAdd(form, key, opts) {
    if (!form || !form.id) return;
    var o = opts || {};
    var doc = form.ownerDocument || document;
    var formId = form.id;
    var tries = 0;
    var wait = o.wait || 50;
    var limit = o.limit || 40;
    function tick() {
      tries++;
      var now = doc.getElementById(formId);
      if (now && now !== form) {
        var act = doc.activeElement;
        // 描き直しの後に利用者が自分で別の欄へ移っていれば、そのまま。
        if (act && act !== doc.body && act.tagName !== 'HTML' && now.contains && !now.contains(act)
            && act.ownerDocument === doc && doc.body.contains(act)) return;
        var el = _resolve(formId, key);
        var carry = _typedSince(key);
        if (el && carry && !el.value) el.value = carry;
        if (el && el !== act) {
          try { el.focus(); } catch (e) { return; }
          try { var n = el.value ? el.value.length : 0; el.setSelectionRange(n, n); } catch (e2) {}
        }
        return;
      }
      if (tries < limit) setTimeout(tick, wait);
    }
    setTimeout(tick, 0);
  }
  function onTailAddClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest('button[id$="-tail-add"]') : null;
    if (!btn) return;
    var form = btn.closest('[id$="-tail-detail"]');
    var key = _pendingKey;
    _pendingKey = null;
    if (form) refocusAfterAdd(form, key);
  }

  function onTailKey(e) {
    if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (!isEnterField(e.target) && !isTailEnterArea(e.target)) return;
    var btn = tailButton(e.target);
    if (btn) _pendingKey = _fieldKey(e.target);
    press(btn, e);
  }
  function onTailRle(e) {
    var btn = tailButton(e.target);
    if (!btn) return;
    _pendingKey = _fieldKey(e.target);
    btn.click();
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
      doc.addEventListener('focusin', onTailFocus);
      doc.addEventListener('mouseup', onTailMouseUp, true);
      doc.addEventListener('focusout', onTailBlur);
      doc.addEventListener('click', onTailAddClick, true);
    }
  }

  if (typeof document !== 'undefined') {
    init(document);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { init(document); });
  }

  return { init: init, bindModal: bindModal, EDIT_MODALS: EDIT_MODALS,
    isTailEnterArea: isTailEnterArea, isDefaultField: isDefaultField,
    firstTypingField: firstTypingField, refocusAfterAdd: refocusAfterAdd };
})();
