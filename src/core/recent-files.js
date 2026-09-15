'use strict';
window.MA = window.MA || {};

// recent-files — 「直前に開いていた図」を覚えておく (BLK-junior-20260915-2346)。
//
// 同じ図を 1 run の中で何度も開き直すのに、開いた履歴がどこにも残らないので、
// 出戻りのたびに 📂 一覧を開いて 20 枚超の行から名前を目で探すところからやり直す。
// 1 回あたりの手数は小さくても、run 全体では毎回同じ探索を繰り返すことになる。
//
// ここは DOM にも localStorage にも触らない純関数だけ。保存と描画は app.js。
window.MA.recentFiles = (function() {

  var LIMIT = 5;

  function clean(list) {
    var out = [];
    if (!list || !list.length) return out;
    for (var i = 0; i < list.length; i++) {
      var n = list[i] == null ? '' : String(list[i]);
      if (!n) continue;
      if (out.indexOf(n) === -1) out.push(n);
    }
    return out;
  }

  // 開いた図を先頭へ。既にあれば前の位置から抜いて先頭に積み直す
  // (「最後に開いた順」でないと、出戻りのたびに位置が変わって探し直しになる)。
  function push(list, name, limit) {
    var cap = limit == null ? LIMIT : limit;
    var n = name == null ? '' : String(name);
    var out = clean(list);
    if (!n) return out.slice(0, cap);
    var at = out.indexOf(n);
    if (at !== -1) out.splice(at, 1);
    out.unshift(n);
    return out.slice(0, cap);
  }

  // 消えた図・名前を変えた図は履歴から落とす (押しても開けない行を残さない)。
  // entries は一覧が読んだ要素の配列 (名前は server の返す type、または name)、
  // または名前そのものの配列。
  function visible(list, entries) {
    var have = {};
    var i;
    if (entries && entries.length) {
      for (i = 0; i < entries.length; i++) {
        var e = entries[i];
        var nm = '';
        if (e && typeof e === 'object') nm = String(e.name != null ? e.name : (e.type != null ? e.type : ''));
        else if (e != null) nm = String(e);
        if (nm) have[nm] = true;
      }
    }
    var src = clean(list);
    var out = [];
    for (i = 0; i < src.length; i++) if (have[src[i]]) out.push(src[i]);
    return out;
  }

  // 消えた図を履歴から落とす (visible と同じ判定を保存側にも使う)。
  function prune(list, entries) { return visible(list, entries); }

  function label(name) {
    var n = name == null ? '' : String(name);
    return n.replace(/\.puml$/i, '');
  }

  // 一覧を開かずに済むよう、Ctrl+K に出す 1 行の見出し。
  function paletteTitle(name) { return '最近開いた図: ' + label(name); }

  return {
    LIMIT: LIMIT,
    push: push,
    visible: visible,
    prune: prune,
    label: label,
    paletteTitle: paletteTitle,
  };
})();
