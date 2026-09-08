'use strict';
window.MA = window.MA || {};

// before-snapshot — 一括置換を当てた瞬間の「変更前の本文」を図ごとに残す
// (BLK-primary-20260908-2203-wish)。
//
// レビュー会議で「置換前はこうで、今はこうです」を見せたいとき、これまでは
// Ctrl+Z で戻して見せ、また Ctrl+Shift+Z で進めて見せる往復しかなかった。
// 戻すと変更後が消えるので、1 画面に前後を並べることができない。
// 置換が当たった図だけ、当てる直前の DSL をここに控える。並べる側
// (compare-view) はこれを「(この図の変更前)」という 1 つの候補として扱う。
//
// 控えるのは置換したときだけ (図を開いた・保存しただけでは増やさない)。
// 記録は保存フォルダごと。localStorage が使えない環境でも置換自体は通す。
window.MA.beforeSnapshot = (function() {

  var KEY = 'plantuml-before-snapshot';
  var MAX = 40;   // 図の本文をそのまま持つので、履歴より短く保つ

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

  // そのフォルダの控え。{ 図名: { name, dsl, at, from, to } }
  function load(store, dir) {
    var all = _all(store);
    var map = all[_s(dir)];
    return (map && typeof map === 'object') ? map : {};
  }

  // 古い控えから落とす。本文を持つので溜め込まない。
  function _trim(map) {
    var names = Object.keys(map);
    if (names.length <= MAX) return map;
    names.sort(function(a, b) { return _s(map[a].at) < _s(map[b].at) ? -1 : 1; });
    names.slice(0, names.length - MAX).forEach(function(n) { delete map[n]; });
    return map;
  }

  // capture(store, dir, entries) — 置換を当てる直前に呼ぶ。
  // entries は [{ name, dsl }]。同じ図を続けて置換したときは
  // **最初の控えを残す** (会議で見せたいのは「今日の作業を始める前」であって
  // 「1 手前」ではない。1 手前は Ctrl+Z で足りる)。
  // 返すのは控えた後の map (呼び出し側が読み直さずに描けるように)。
  function capture(store, dir, entries, meta, at) {
    var map = load(store, dir);
    var m = meta || {};
    var stamp = _s(at) || new Date().toISOString();
    (Array.isArray(entries) ? entries : []).forEach(function(e) {
      var name = _s(e && e.name);
      if (!name) return;
      if (map[name]) return;   // 既に控えがあるなら上書きしない
      map[name] = {
        name: name,
        dsl: _s(e && e.dsl),
        at: stamp,
        from: _s(m.from),
        to: _s(m.to),
      };
    });
    _trim(map);
    _write(store, (function() { var all = _all(store); all[_s(dir)] = map; return all; })());
    return map;
  }

  // get(store, dir, name) — その図の控え。無ければ null。
  function get(store, dir, name) {
    var map = load(store, dir);
    var s = map[_s(name)];
    return s || null;
  }

  // drop(store, dir, name) — 控えを捨てる。会議が終わって「変更前」を
  // 出し続ける理由が無くなったときに押す。name 省略でそのフォルダを空にする。
  function drop(store, dir, name) {
    var all = _all(store);
    var map = load(store, dir);
    if (name == null) map = {};
    else delete map[_s(name)];
    all[_s(dir)] = map;
    _write(store, all);
    return map;
  }

  // 見出しの文言。どちらが「今」でどちらが「変更前」かを取り違えないようにする。
  function label(snap) {
    if (!snap) return '';
    var when = _s(snap.at).slice(0, 16).replace('T', ' ');
    var what = (snap.from && snap.to) ? snap.from + ' → ' + snap.to : '置換';
    return '(この図の変更前) ' + what + ' ' + when;
  }

  // 控えと今の本文が同じか。同じなら並べても何も見えないので出さない。
  function isSame(snap, dsl) {
    return !!snap && _s(snap.dsl) === _s(dsl);
  }

  return {
    storageKey: KEY,
    load: load,
    capture: capture,
    get: get,
    drop: drop,
    label: label,
    isSame: isSame,
  };
})();
