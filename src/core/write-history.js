'use strict';
window.MA = window.MA || {};

// write-history — 保存フォルダへ直接書いた操作を、前後の本文ごと 1 組ずつ残す
// (BLK-primary-20260914-1206-wish)。
//
// ⇄ 一括置換と 🔖 指摘から選ぶの [適用] は、タブを開かずに保存フォルダの
// ファイルへ書き戻す。before-snapshot (置換前の控え) は「その図をエディタで
// 開いていたセッション」の中でしか作られないので、後から開き直すと基準ごと
// 今の状態になり、レビュー会議で「今日どこを直したか」を出せなくなっていた。
//
// ここは書き込み操作そのものを 1 件 = 1 エントリとして控える。エントリは
// 「いつ・どの操作・どの図が・どう変わったか (前後の本文)」を持つので、
// ブラウザを開き直しても、図を一度も開いていなくても、後から並べられる。
// 記録は保存フォルダごと。localStorage が使えない環境でも書き込み自体は通す。
window.MA.writeHistory = (function() {

  var KEY = 'plantuml-write-history';
  var MAX = 20;          // 前後の本文をそのまま持つので、件数を絞る
  var MAX_FILES = 40;    // 1 操作あたりの図の枚数

  var KINDS = {
    'rename': '⇄ 一括置換',
    'unify': '表記統一 (登録簿へまとめて寄せる)',
    'glossary': '略語辞書の確定',
    'note-rename': '指摘から選ぶ (ラベル統一)',
    'note-verdict': '指摘から選ぶ (別ドメイン宣言)',
    'bulk-note': '◈ 依存グラフ (影響先へまとめて note)',
  };

  function _s(v) { return v == null ? '' : String(v); }

  function _all(store) {
    if (!store) return {};
    try {
      var raw = store.getItem(KEY);
      if (!raw) return {};
      var obj = JSON.parse(raw);
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) { return {}; }
  }

  function _write(store, obj) {
    if (!store) return false;
    try { store.setItem(KEY, JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  // そのフォルダの操作履歴。新しい順。
  function list(store, dir) {
    var all = _all(store);
    var arr = all[_s(dir)];
    return Array.isArray(arr) ? arr : [];
  }

  function kindLabel(kind) {
    return KINDS[_s(kind)] || '書き込み';
  }

  // makeEntry(kind, meta, files, at) — 控える 1 件を組み立てる。
  // files は [{ name, before, after }]。前後が同じ図は落とす (並べても何も見えない)。
  // 1 枚も変わっていなければ null (押しただけで何も書かなかった操作は残さない)。
  function makeEntry(kind, meta, files, at) {
    var m = meta || {};
    var stamp = _s(at) || new Date().toISOString();
    var rows = [];
    (Array.isArray(files) ? files : []).forEach(function(f) {
      var name = _s(f && f.name);
      if (!name) return;
      var before = _s(f && f.before);
      var after = _s(f && f.after);
      if (before === after) return;
      for (var i = 0; i < rows.length; i++) if (rows[i].name === name) return;
      rows.push({ name: name, before: before, after: after });
    });
    if (!rows.length) return null;
    if (rows.length > MAX_FILES) rows = rows.slice(0, MAX_FILES);
    return {
      id: 'wh-' + stamp.replace(/[^0-9]/g, '') + '-' + rows.length + '-' + _s(kind),
      kind: _s(kind),
      at: stamp,
      from: _s(m.from),
      to: _s(m.to),
      note: _s(m.note),
      files: rows,
    };
  }

  // record(store, dir, entry) — 控える。同じ id が既にあれば置き換える
  // (押し直しで 2 行に割れない)。返すのは控えた後の一覧。
  function record(store, dir, entry) {
    if (!entry || !entry.id) return list(store, dir);
    var all = _all(store);
    var arr = list(store, dir).filter(function(e) { return e && e.id !== entry.id; });
    arr.unshift(entry);
    if (arr.length > MAX) arr = arr.slice(0, MAX);
    all[_s(dir)] = arr;
    _write(store, all);
    return arr;
  }

  function get(store, dir, id) {
    var arr = list(store, dir);
    for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].id === _s(id)) return arr[i];
    return null;
  }

  // その図が入っている操作だけ。会議で 1 枚の前後を出すときの候補。
  function forDoc(store, dir, name) {
    var want = _s(name);
    if (!want) return [];
    return list(store, dir).filter(function(e) {
      return (e && Array.isArray(e.files) ? e.files : []).some(function(f) {
        return f && _s(f.name) === want;
      });
    });
  }

  // pairOf(entry, name) — その操作でその図がどう変わったか。無ければ null。
  function pairOf(entry, name) {
    var want = _s(name);
    var rows = (entry && Array.isArray(entry.files)) ? entry.files : [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && _s(rows[i].name) === want) {
        return { name: want, before: _s(rows[i].before), after: _s(rows[i].after) };
      }
    }
    return null;
  }

  function when(entry) {
    return _s(entry && entry.at).slice(0, 16).replace('T', ' ');
  }

  // 一覧の 1 行。「いつ・何を・何枚」。会議で見せる回を選ぶための文言。
  function label(entry) {
    if (!entry) return '';
    var what = kindLabel(entry.kind);
    if (entry.from && entry.to) what += ' ' + entry.from + ' → ' + entry.to;
    else if (entry.note) what += ' ' + entry.note;
    var n = (Array.isArray(entry.files) ? entry.files : []).length;
    return when(entry) + ' ' + what + ' (' + n + ' 枚)';
  }

  // 参照ペインの候補に出すときの文言。どちらが「今」か取り違えないようにする。
  function optionLabel(entry, name) {
    if (!entry) return '';
    var what = kindLabel(entry.kind);
    if (entry.from && entry.to) what += ' ' + entry.from + ' → ' + entry.to;
    return _s(name) + ' (' + when(entry) + ' ' + what + ' の前)';
  }

  function drop(store, dir, id) {
    var all = _all(store);
    var arr = list(store, dir).filter(function(e) { return e && e.id !== _s(id); });
    all[_s(dir)] = arr;
    _write(store, all);
    return arr;
  }

  function clear(store, dir) {
    var all = _all(store);
    all[_s(dir)] = [];
    _write(store, all);
    return [];
  }

  return {
    storageKey: KEY,
    MAX: MAX,
    kindLabel: kindLabel,
    makeEntry: makeEntry,
    record: record,
    list: list,
    get: get,
    forDoc: forDoc,
    pairOf: pairOf,
    when: when,
    label: label,
    optionLabel: optionLabel,
    drop: drop,
    clear: clear,
  };
})();
