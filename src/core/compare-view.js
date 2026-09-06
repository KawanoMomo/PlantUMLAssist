'use strict';
window.MA = window.MA || {};

// compare-view — 2 枚の図を並べて見比べるための、どれを並べるかの判断。
//
// 先輩の図を真似て自分の図を書くとき、これまでは「先輩のタブを開いて記憶 →
// 自分のタブに切り替えて打ち込む」の往復しかなかった。並べて出す相手 (参照図) を
// 選ぶ規則だけをここに置き、描画は app.js が受け持つ。
// 参照図は「今開いているタブ以外」から選ぶ。編集中のタブが変わっても、
// 選んでいた参照図が残っているならそのまま指し続ける。
window.MA.compareView = (function() {

  function _list(docs) {
    return Array.isArray(docs) ? docs : [];
  }

  // 並べる相手の候補。編集中のタブ自身は候補にしない (同じ図を 2 つ出しても
  // 見比べにならない)。docs の順 = タブの並び順をそのまま保つ。
  function options(docs, activeId) {
    var out = [];
    _list(docs).forEach(function(d) {
      if (!d || d.id == null) return;
      if (d.id === activeId) return;
      out.push({ id: d.id, name: d.name, diagramType: d.diagramType });
    });
    return out;
  }

  // 実際に出す 1 枚を決める。
  //  - preferredId がまだ候補にあるならそれ (タブを行き来しても選び直さずに済む)
  //  - 無ければ先頭の候補 (開いた瞬間から何かが出る)
  //  - 候補が無ければ null (タブが 1 枚しかない)
  function pick(docs, activeId, preferredId) {
    var opts = options(docs, activeId);
    if (opts.length === 0) return null;
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].id === preferredId) return opts[i];
    }
    return opts[0];
  }

  // 参照図の中身。docs から 1 件を引く。見つからなければ null。
  function doc(docs, id) {
    var list = _list(docs);
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
  }

  // 並べて見られる状態か (タブが 2 枚以上あるか)。
  function canCompare(docs, activeId) {
    return options(docs, activeId).length > 0;
  }

  // 見出しの文言。どちらが編集中でどちらが参照かを取り違えないようにする。
  function headerLabel(refDoc) {
    if (!refDoc) return '参照する図がありません';
    var t = String(refDoc.diagramType || '').replace('plantuml-', '');
    return '参照: ' + refDoc.name + (t ? ' (' + t + ')' : '');
  }

  return {
    options: options,
    pick: pick,
    doc: doc,
    canCompare: canCompare,
    headerLabel: headerLabel,
  };
})();
