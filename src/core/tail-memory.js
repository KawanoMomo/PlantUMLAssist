'use strict';
// BLK-primary-20260923-2312-friction —「末尾に追加」フォームの前回の選択を覚えておく。
//
// 確定するたびに右ペインが描き直され、種別チップは図種の既定 (状態 / アクター /
// メッセージ) に、親・From・関係の種類は先頭に戻っていた。遷移 4 本・子状態 6 つを
// 続けて足すと、毎回チップを押して親や From を選び直す手が 1 本ごとに増える。
//
// ここでは種別と、続けて足すときに同じになりやすい欄 (親・From・関係の種類) の値を
// 覚えておき、描き直したフォームに戻す。覚えは「図種 + タブ」の組に 1 つだけ持ち、
// 図種を切り替えたとき・タブを替えたときに捨てる (そのときだけ既定に戻る)。
window.MA = window.MA || {};
window.MA.tailMemory = (function() {
  var _key = null;
  var _kinds = {};
  var _fields = {};
  var _onReset = [];
  var _keyFn = null;

  // 今の「図種 + タブ」。図種は #diagram-type、タブは workspace の active id。
  function defaultKey() {
    var typeEl = typeof document !== 'undefined' ? document.getElementById('diagram-type') : null;
    var WS = window.MA.workspace;
    var tab = WS && WS.getActiveId ? WS.getActiveId() : null;
    return String(typeEl ? typeEl.value : '') + '|' + String(tab == null ? '' : tab);
  }

  // テストから「図種 + タブ」の出どころを差し替える口。null で既定に戻す。
  function setKeyFn(fn) { _keyFn = typeof fn === 'function' ? fn : null; }

  // 組が替わっていたら覚えを捨てる。捨てたら true。
  function sync() {
    var k = _keyFn ? String(_keyFn()) : defaultKey();
    if (k === _key) return false;
    var first = _key === null;
    _key = k;
    _kinds = {};
    _fields = {};
    if (!first) {
      for (var i = 0; i < _onReset.length; i++) {
        try { _onReset[i](); } catch (e) { /* 聞き手の失敗で覚えの切替を止めない */ }
      }
    }
    return true;
  }

  // 組が替わったときに、図種モジュールが自分で持つ続きの状態 (遷移を続けて入れる回など) を閉じる口。
  function onReset(fn) { if (typeof fn === 'function') _onReset.push(fn); }

  function setKind(selectId, value) {
    sync();
    if (value == null || value === '') { delete _kinds[selectId]; return; }
    _kinds[selectId] = String(value);
  }

  function kind(selectId) {
    sync();
    return Object.prototype.hasOwnProperty.call(_kinds, selectId) ? _kinds[selectId] : null;
  }

  function setField(id, value) {
    sync();
    _fields[id] = value == null ? '' : String(value);
  }

  function hasField(id) {
    sync();
    return Object.prototype.hasOwnProperty.call(_fields, id);
  }

  function field(id) {
    return hasField(id) ? _fields[id] : null;
  }

  function forget(id) {
    sync();
    delete _fields[id];
  }

  function reset() {
    _kinds = {};
    _fields = {};
  }

  function hasOption(sel, value) {
    if (!sel || !sel.options) return false;
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === value) return true;
    }
    return false;
  }

  // 描き直した select に覚えた値を戻し、以後の選び直しを覚える。
  // 覚えた値が今の選択肢に無ければ (消した親など) 既定のまま。戻したら true。
  function bindSelect(id) {
    var el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (!el) return false;
    var restored = false;
    var v = field(id);
    if (v != null && v !== el.value && hasOption(el, v)) {
      el.value = v;
      restored = true;
    }
    el.addEventListener('change', function() { setField(id, el.value); });
    return restored;
  }

  // シーケンス図のメッセージを 1 本確定した後の From / To。
  // 応答や次の呼び出しは直前の相手から出ることが多いので From は直前の To、To は空欄 (図で押すか選ぶ)。
  function nextMessageEnds(from, to) {
    var t = to == null ? '' : String(to);
    var f = from == null ? '' : String(from);
    return { from: t || f, to: '' };
  }

  return {
    sync: sync,
    setKeyFn: setKeyFn,
    onReset: onReset,
    setKind: setKind,
    kind: kind,
    setField: setField,
    hasField: hasField,
    field: field,
    forget: forget,
    reset: reset,
    hasOption: hasOption,
    bindSelect: bindSelect,
    nextMessageEnds: nextMessageEnds,
  };
})();
