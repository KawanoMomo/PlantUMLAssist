'use strict';
window.MA = window.MA || {};

// rename-pairs — 「過去の置換の組」(⇄ 一括置換のパネルの下の行) の記憶
//
// 当たらなかった組 (もう全部置換済みで、それを確かめたかっただけの組) も残し、
// 同じ SpiDrv → Spi_Driver を毎回打ち直さずに済むようにする。
// 保存フォルダ運用では、図がフォルダの持ち物である以上その図に当てた組もフォルダの持ち物なので、
// server 側 (`_renames/pairs.json`) に置いて run をまたいで残す。
// 保存フォルダを使わない運用では、組はこのブラウザの localStorage に保存先ごとに残す (loadLocal / rememberLocal)。
//
// ここは組の並べ方と localStorage の読み書きだけを持つ。フォルダへの保存は server、表示は rename-redo の職掌。
window.MA.renamePairs = (function() {

  var LOCAL_KEY = 'plantuml-rename-pairs';
  var LOCAL_MAX = 200;   // 古い順に落とす

  function _s(v) { return v == null ? '' : String(v); }

  function _time(at) {
    var t = Date.parse(_s(at));
    return isNaN(t) ? 0 : t;
  }

  // normalize(pairs) — server から来た組を、履歴と同じ形 {from, to, at} にする。
  // from か to が欠けたものは組ではないので落とす。
  // appliedAt は [置換] で当てた最後の日時。
  // 打っただけで当てなかった組は空のまま。server の applied_at も同じ意味で読む。
  function normalize(pairs) {
    return (Array.isArray(pairs) ? pairs : []).map(function(p) {
      return { from: _s(p && p.from), to: _s(p && p.to), at: _s(p && p.at),
        appliedAt: _s(p && (p.appliedAt || p.applied_at)) };
    }).filter(function(p) { return p.from !== '' && p.to !== ''; });
  }

  // merge(a, b) — 2 つの組の並びを 1 本にする。
  // 同じ組は新しい方の日時だけを残し、日時の新しい順に並べる
  // (日時を持たない記録は最後尾。順序が消えるだけで、組そのものは残す)。
  function merge(folder, history) {
    var rows = normalize(folder).concat(normalize(history));
    var seen = {};
    var out = [];
    rows.forEach(function(r) {
      var key = r.from + '\u0000' + r.to;
      var prev = seen[key];
      if (prev) {
        if (_time(r.at) > _time(prev.at)) prev.at = r.at;
        if (_time(r.appliedAt) > _time(prev.appliedAt)) prev.appliedAt = r.appliedAt;
        return;
      }
      var row = { from: r.from, to: r.to, at: r.at, appliedAt: r.appliedAt };
      seen[key] = row;
      out.push(row);
    });
    out.sort(function(a, b) { return _time(b.at) - _time(a.at); });
    return out;
  }

  // shouldRemember(from, to) — 覚える価値のある組か。
  // 空・同名は組ではない。当たったかどうかは問わない (0 件と分かったこと自体が、
  // 次の run で打ち直さずに済む知識なので覚える)。
  function shouldRemember(from, to) {
    var f = _s(from).trim();
    var t = _s(to).trim();
    return f !== '' && t !== '' && f !== t;
  }

  function _localAll(store) {
    if (!store) return {};
    try {
      var raw = store.getItem(LOCAL_KEY);
      if (!raw) return {};
      var obj = JSON.parse(raw);
      return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
    } catch (e) { return {}; }
  }

  // loadLocal(store, dir) — このブラウザに残した、その保存先の組。新しい順。
  // 読めない・壊れているときは空 (組が無いのと同じ。画面を止めない)。
  function loadLocal(store, dir) {
    return merge(_localAll(store)[_s(dir)], []);
  }

  // rememberLocal(store, dir, row) — 組を 1 つ足す (同じ組は日時だけ進む)。
  // 返すのは足した後の並び。書けない環境でも並びは返す (置換自体は止めない)。
  function rememberLocal(store, dir, row) {
    var list = loadLocal(store, dir);
    if (!row || !shouldRemember(row.from, row.to)) return list;
    var next = merge([{ from: _s(row.from).trim(), to: _s(row.to).trim(), at: row.at,
      appliedAt: row.appliedAt }], list).slice(0, LOCAL_MAX);
    if (store) {
      try {
        var all = _localAll(store);
        all[_s(dir)] = next;
        store.setItem(LOCAL_KEY, JSON.stringify(all));
      } catch (e) { /* 残せなくても置換は通す */ }
    }
    return next;
  }

  return {
    LOCAL_KEY: LOCAL_KEY,
    normalize: normalize,
    merge: merge,
    shouldRemember: shouldRemember,
    loadLocal: loadLocal,
    rememberLocal: rememberLocal,
  };
})();
