'use strict';
window.MA = window.MA || {};
// 元に戻す / やり直しの履歴。
// BLK-owner-20260924-2232-1 / BLK-human-20260924-2355: 履歴は図 (タブ) ごとに持つ。
// 全タブで 1 本だったため、あるタブで Ctrl+Z を押すと別のタブの本文が入り、
// 図種の判定が替わって自動保存が別名の .puml を書いていた。
// 今どの図の履歴かは init の getKey (編集中の図の id) で決める。タブを替えれば効く履歴も替わる。
window.MA.history = (function() {
  var MAX_HISTORY = 80;
  var stacks = {};   // key → { undo: [], future: [] }
  var state = {
    getMmdText: function() { return ''; },
    setMmdText: function(t) {},
    onUpdate: function() {},
    getKey: function() { return ''; },
    onRestore: function() {},
  };

  function init(opts) {
    state.getMmdText = opts.getMmdText;
    state.setMmdText = opts.setMmdText;
    state.onUpdate = opts.onUpdate || function() {};
    state.getKey = typeof opts.getKey === 'function' ? opts.getKey : function() { return ''; };
    state.onRestore = typeof opts.onRestore === 'function' ? opts.onRestore : function() {};
  }

  function _key() {
    var k = '';
    try { k = state.getKey(); } catch (e) { k = ''; }
    return k == null ? '' : String(k);
  }

  function _cur() {
    var k = _key();
    if (!stacks[k]) stacks[k] = { undo: [], future: [] };
    return stacks[k];
  }

  function pushHistory() {
    var s = _cur();
    var text = state.getMmdText();
    // 同じ本文を続けて積まない (押しても何も変わらない Ctrl+Z を作らない)。
    if (!(s.undo.length && s.undo[s.undo.length - 1] === text)) {
      s.undo.push(text);
      if (s.undo.length > MAX_HISTORY) s.undo.shift();
    }
    s.future = [];
    state.onUpdate();
  }

  function undo() {
    var s = _cur();
    if (s.undo.length === 0) return;
    var now = state.getMmdText();
    var prev = s.undo.pop();
    // 積んだ本文が今と同じなら 1 段飛ばす (押した回数だけ本文が戻るように)。
    while (prev === now && s.undo.length) prev = s.undo.pop();
    if (prev === now) { state.onUpdate(); return; }
    s.future.push(now);
    state.onRestore('undo');
    state.setMmdText(prev);
    state.onUpdate();
  }

  function redo() {
    var s = _cur();
    if (s.future.length === 0) return;
    s.undo.push(state.getMmdText());
    state.onRestore('redo');
    state.setMmdText(s.future.pop());
    state.onUpdate();
  }

  function canUndo() {
    var s = stacks[_key()];
    if (!s || !s.undo.length) return false;
    // 残っているのが今の本文と同じものだけなら、押しても何も変わらない。
    var now = state.getMmdText();
    for (var i = 0; i < s.undo.length; i++) if (s.undo[i] !== now) return true;
    return false;
  }
  function canRedo() { var s = stacks[_key()]; return !!(s && s.future.length); }

  // タブを閉じた図の履歴は持ち越さない (開き直した図は新しい履歴で始まる)。
  function forget(key) { delete stacks[key == null ? '' : String(key)]; }

  // 何枚の図が履歴を持っているか (確かめ用)。
  function keys() { return Object.keys(stacks); }

  return {
    init: init,
    pushHistory: pushHistory,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    forget: forget,
    keys: keys,
  };
})();
