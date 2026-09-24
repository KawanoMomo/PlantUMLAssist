'use strict';
window.MA = window.MA || {};

// draft-mark — 「この保存は一時控え(下書き / やり直し途中)」を図に印として持たせる。
//
// BLK-junior-20260907-2009-wish: やり直しの練習で作る控え (*_TYPO_interim) が
// 保存フォルダに溜まり、📂 一覧で本物の成果物と同じ並びに混ざっていた。
// 見分ける手がかりは名前だけで、図種を跨いで増えるほど成果物を探しにくい。
// 名前の付け方 (規約) で見分けようとすると、規約から外れた控えを取りこぼす。
// ここでは名前ではなく利用者が付けた印を正本にし、一覧はその印で畳む。
//
// 印は保存フォルダごとに localStorage へ置く (フォルダを分ければ印も分かれる)。
// DOM にも fetch にも触らない純関数だけ。描画は app.js。
window.MA.draftMark = (function() {
  var KEY_PREFIX = 'pua.draft.marks:';

  function _s(v) { return v == null ? '' : String(v); }

  function _dir(fileDir) {
    var d = _s(fileDir);
    return d === '' ? './autosave' : d;
  }

  function storageKey(fileDir) { return KEY_PREFIX + _dir(fileDir); }

  // 印の集合。重複と空文字は落として並びを保つ。
  function normalize(names) {
    var out = [];
    (names || []).forEach(function(n) {
      var v = _s(n);
      if (v !== '' && out.indexOf(v) < 0) out.push(v);
    });
    return out;
  }

  function has(names, name) { return normalize(names).indexOf(_s(name)) >= 0; }

  function toggle(names, name) {
    var v = _s(name);
    if (v === '') return normalize(names);
    var out = normalize(names);
    var i = out.indexOf(v);
    if (i >= 0) out.splice(i, 1);
    else out.push(v);
    return out;
  }

  function add(names, name) {
    var out = normalize(names);
    var v = _s(name);
    if (v !== '' && out.indexOf(v) < 0) out.push(v);
    return out;
  }

  function remove(names, name) {
    var v = _s(name);
    return normalize(names).filter(function(n) { return n !== v; });
  }

  // 保存フォルダから消えた控えの印は捨てる。消したはずの控えの印がいつまでも
  // 残っていると、同じ名前で新しく作った成果物が最初から畳まれてしまう。
  function keepExisting(names, existing) {
    var alive = {};
    (existing || []).forEach(function(e) {
      alive[_s(e && e.name != null ? e.name : e)] = true;
    });
    return normalize(names).filter(function(n) { return alive[n]; });
  }

  // 一覧を「成果物」と「一時控え」に分ける。どちらも渡された並びのまま。
  // entries は文字列でも {name,...} でもよい (review-watch の行をそのまま渡せる)。
  function split(entries, names) {
    var marks = {};
    normalize(names).forEach(function(n) { marks[n] = true; });
    var items = [], drafts = [];
    (entries || []).forEach(function(e) {
      if (e == null) return;
      var nm = _s(typeof e === 'string' ? e : e.name);
      if (nm === '') return;
      (marks[nm] ? drafts : items).push(e);
    });
    return { items: items, drafts: drafts };
  }

  // 畳んだ分を言葉にする。畳んで消えた枚数が読めないと、
  // 「一覧に出ていない = 保存できていない」と読み違える。
  function summary(draftCount, collapsed) {
    var n = draftCount || 0;
    if (n === 0) return '一時控えはありません';
    return collapsed
      ? '一時控え ' + n + ' 件を畳んでいます'
      : '一時控え ' + n + ' 件を出しています';
  }

  // 畳む / 開くボタンの文言。
  function toggleLabel(draftCount, collapsed) {
    var n = draftCount || 0;
    return collapsed ? '一時控え ' + n + ' 件を出す' : '一時控え ' + n + ' 件を畳む';
  }

  // 行に出す印のボタン。今の状態と、押したら何になるかを両方言う。
  function rowLabel(isDraft) { return isDraft ? '控え' : '控えにする'; }

  function rowTitle(isDraft) {
    return isDraft
      ? '一時控えの印を外して、成果物として一覧に出す'
      : 'この図に一時控え(下書き / やり直し途中)の印を付けて、一覧から畳む';
  }

  // 上部の「一時控え」ボタンの文言 (開いている図に対して)。
  function activeLabel(isDraft) {
    return isDraft ? '🗂 一時控え中' : '🗂 一時控え';
  }

  function activeMessage(name, isDraft) {
    var label = _s(name);
    return isDraft
      ? '🗂 ' + label + ' を一時控えにしました。保存先の一覧では畳まれます'
      : '🗂 ' + label + ' の一時控えを外しました。保存先の一覧に成果物として出ます';
  }

  function load(storage, fileDir) {
    if (!storage || !storage.getItem) return [];
    var raw = null;
    try { raw = storage.getItem(storageKey(fileDir)); } catch (e) { return []; }
    if (!raw) return [];
    var arr = null;
    try { arr = JSON.parse(raw); } catch (e) { return []; }
    if (!arr || typeof arr.length !== 'number' || typeof arr === 'string') return [];
    return normalize(arr);
  }

  function save(storage, fileDir, names) {
    if (!storage || !storage.setItem) return false;
    try {
      storage.setItem(storageKey(fileDir), JSON.stringify(normalize(names)));
      return true;
    } catch (e) { return false; }
  }

  return {
    storageKey: storageKey,
    normalize: normalize,
    has: has,
    toggle: toggle,
    add: add,
    remove: remove,
    keepExisting: keepExisting,
    split: split,
    summary: summary,
    toggleLabel: toggleLabel,
    rowLabel: rowLabel,
    rowTitle: rowTitle,
    activeLabel: activeLabel,
    activeMessage: activeMessage,
    load: load,
    save: save,
  };
})();
