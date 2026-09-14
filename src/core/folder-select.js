'use strict';
window.MA = window.MA || {};

// folder-select — 保存フォルダの一覧から複数の図を選び、まとめてタブで開く。
//
// BLK-primary-20260907-1703: 横断作業では毎回 14 枚を 1 枚ずつ開いていた。
// 1 枚あたり「一覧を開く → ファイルを押す (押すと一覧が閉じる)」の 2 クリックで、
// 14 枚なら 28 クリック。枚数が増えれば手数もそのまま増える。
// 一覧を開いたまま印を付け、最後に 1 回だけ「開く」を押せば、枚数によらず
// 一覧 1 + 全部選ぶ 1 + 開く 1 の 3 クリックで済む。
//
// DOM には触らない。描画と読み込みは app.js。
window.MA.folderSelect = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  // 一覧に無い名前は落とす。一覧を取り直した後 (図が消えた・増えた) に、
  // 前の印がそのまま残って「もう無い図を開く」ことにならないようにする。
  function keepExisting(picked, names) {
    var exists = {};
    (names || []).forEach(function(n) { exists[_s(n)] = true; });
    var out = [];
    (picked || []).forEach(function(p) {
      var v = _s(p);
      if (exists[v] && out.indexOf(v) < 0) out.push(v);
    });
    return out;
  }

  function toggle(picked, name) {
    var v = _s(name);
    var out = (picked || []).map(_s);
    var i = out.indexOf(v);
    if (i >= 0) out.splice(i, 1);
    else out.push(v);
    return out;
  }

  function has(picked, name) {
    return (picked || []).map(_s).indexOf(_s(name)) >= 0;
  }

  // 「全部選ぶ」は一覧の並び順のまま。開く順が画面の並びと違うと、
  // どのタブがどれか分からなくなる。
  function selectAll(names) {
    var out = [];
    (names || []).forEach(function(n) {
      var v = _s(n);
      if (v !== '' && out.indexOf(v) < 0) out.push(v);
    });
    return out;
  }

  function clear() { return []; }

  // ボタンが「全部選ぶ」か「選択を外す」か。全部に印が付いていれば外す側。
  function allPicked(picked, names) {
    var list = selectAll(names);
    if (list.length === 0) return false;
    for (var i = 0; i < list.length; i++) {
      if (!has(picked, list[i])) return false;
    }
    return true;
  }

  // 実際に読み込む順。一覧の並びに揃え、既に開いているタブは読み直さない
  // (開き直すと編集中の内容がファイルの中身で上書きされる)。
  function toOpen(picked, names, openNames) {
    var want = {};
    (picked || []).forEach(function(p) { want[_s(p)] = true; });
    var already = {};
    (openNames || []).forEach(function(o) { already[_s(o)] = true; });
    var out = [];
    selectAll(names).forEach(function(n) {
      if (!want[n] || already[n] || out.indexOf(n) >= 0) return;
      out.push(n);
    });
    return out;
  }

  // ボタンに出す文言。押す前に「何枚が新しく開くのか」が読めるようにする。
  function openLabel(picked, names, openNames) {
    var n = (picked || []).length;
    if (n === 0) return '選んだ図をタブで開く';
    var fresh = toOpen(picked, names, openNames).length;
    if (fresh === 0) return n + ' 枚とも既に開いています';
    if (fresh === n) return '選んだ ' + n + ' 枚をタブで開く';
    return '選んだ ' + n + ' 枚を開く（' + fresh + ' 枚が新規）';
  }

  return {
    keepExisting: keepExisting,
    toggle: toggle,
    has: has,
    selectAll: selectAll,
    clear: clear,
    allPicked: allPicked,
    toOpen: toOpen,
    openLabel: openLabel,
  };
})();
