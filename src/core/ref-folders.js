'use strict';
window.MA = window.MA || {};

// ref-folders — 「参照専用フォルダ」を保存先とは別に登録しておく。
//
// BLK-junior-20260916-0546-wish: 📂 一覧は「今の保存先フォルダの中身」しか出せず、
// 保存先そのものが唯一の設定なので、先輩 (primary) の図を覗くには保存先を
// 切り替えるしかなかった。切り替えたまま保存すると自分の図が他人のフォルダに入る。
// junior は手順 1 のたびに「戻し忘れていないか」を確かめる手間を払っていた。
//
// 保存先と参照先を別々に持てば、その確認そのものが要らなくなる。ここは
// 「どのフォルダを参照に登録しているか」「いまどのタブを見ているか」だけを持ち、
// 保存先 (workspace の fileDir) には触らない — 触れないことが、この機能の要。
//
// 登録は名前ではなくパスで持つ。同じ名前の別フォルダ (persona-data\primary と
// backup\primary) を 1 つと数えると、見ているつもりのフォルダが入れ替わる。
window.MA.refFolders = (function() {

  var STORE_KEY = 'pua.ref.folders';
  var MAX = 8;   // タブが折り返して保存先タブが隠れない範囲

  function _s(v) { return v == null ? '' : String(v); }

  // 比較用に揃えた形。Windows の区切りと末尾の / と大小文字を吸収する。
  function norm(dir) {
    return _s(dir).split('\\').join('/').replace(/\/+$/, '').toLowerCase();
  }

  function samePath(a, b) {
    var x = norm(a), y = norm(b);
    return !!x && x === y;
  }

  function baseName(dir) {
    var s = _s(dir).split('\\').join('/').replace(/\/+$/, '');
    var i = s.lastIndexOf('/');
    return (i >= 0 ? s.slice(i + 1) : s) || s;
  }

  // 登録簿の読み書き。壊れていても画面を止めない (空として扱う)。
  function parse(raw) {
    var v = null;
    try { v = JSON.parse(_s(raw)); } catch (e) { return []; }
    if (!v || !v.length) return [];
    var out = [];
    for (var i = 0; i < v.length; i++) {
      var d = typeof v[i] === 'string' ? v[i] : (v[i] && v[i].dir);
      if (_s(d) && !out.some(function(x) { return samePath(x, d); })) out.push(_s(d));
    }
    return out.slice(0, MAX);
  }

  function serialize(list) { return JSON.stringify(list || []); }

  function load(storage) {
    try { return parse(storage.getItem(STORE_KEY)); } catch (e) { return []; }
  }

  function save(storage, list) {
    try { storage.setItem(STORE_KEY, serialize(list)); } catch (e) {}
    return list;
  }

  // 追加。保存先そのものは参照に足さない (足すと同じフォルダのタブが 2 枚出て、
  // どちらが書き込む側かが画面から読めなくなる)。
  function add(list, dir, saveDir) {
    var d = _s(dir);
    if (!d) return (list || []).slice();
    if (saveDir && samePath(d, saveDir)) return (list || []).slice();
    var out = (list || []).filter(function(x) { return !samePath(x, d); });
    out.unshift(d);
    return out.slice(0, MAX);
  }

  function remove(list, dir) {
    return (list || []).filter(function(x) { return !samePath(x, dir); });
  }

  // タブの並び。先頭は必ず保存先で、動かさない
  // (書き込む先が先頭にある、が読み方の拠りどころになる)。
  function tabs(saveDir, list, activeDir) {
    var out = [{
      dir: _s(saveDir), kind: 'save', name: baseName(saveDir),
      label: baseName(saveDir) + '(保存先)',
      active: !activeDir || samePath(activeDir, saveDir),
    }];
    (list || []).forEach(function(d) {
      if (samePath(d, saveDir)) return;
      out.push({
        dir: _s(d), kind: 'ref', name: baseName(d),
        label: baseName(d) + '(参照)',
        active: !!activeDir && samePath(activeDir, d),
      });
    });
    // 登録が消えたフォルダを見ていた場合は保存先に戻す (どれも active でない状態を作らない)。
    if (!out.some(function(t) { return t.active; })) out[0].active = true;
    return out;
  }

  function activeTab(saveDir, list, activeDir) {
    var t = tabs(saveDir, list, activeDir);
    for (var i = 0; i < t.length; i++) if (t[i].active) return t[i];
    return t[0];
  }

  function isRef(saveDir, activeDir) {
    return !!activeDir && !samePath(activeDir, saveDir);
  }

  // 参照タブに出す但し書き。「見るだけのつもりが保存先を戻し忘れていないか」を
  // 確かめる手間を無くすのが目的なので、保存先の名前をそのまま出す。
  function notice(saveDir, activeDir) {
    if (!isRef(saveDir, activeDir)) return '';
    return '読むだけです。保存先は ' + baseName(saveDir) + ' のまま変わりません';
  }

  // 追加できる行き先。/peek-dirs の答え (peek-folder.choices と同じ形) から、
  // 保存先と登録済みを除く。
  function candidates(choices, saveDir, list) {
    return (choices || []).filter(function(c) {
      var p = c && c.path;
      if (!p || samePath(p, saveDir)) return false;
      return !(list || []).some(function(d) { return samePath(d, p); });
    });
  }

  return {
    STORE_KEY: STORE_KEY,
    MAX: MAX,
    norm: norm,
    samePath: samePath,
    baseName: baseName,
    parse: parse,
    serialize: serialize,
    load: load,
    save: save,
    add: add,
    remove: remove,
    tabs: tabs,
    activeTab: activeTab,
    isRef: isRef,
    notice: notice,
    candidates: candidates,
  };
})();
