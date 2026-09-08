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

  // 編集中の図の「変更前」を指す擬似 id。実在のタブと衝突しないよう記号で始める。
  var BEFORE_ID = '@before';

  // 並べる相手の候補。編集中のタブ自身は候補にしない (同じ図を 2 つ出しても
  // 見比べにならない)。docs の順 = タブの並び順をそのまま保つ。
  //
  // ただし編集中の図に「変更前スナップショット」(一括置換を当てた瞬間の控え) が
  // あるときだけは、その図自身を **先頭の候補**として出す。レビュー会議で
  // 見せたいのはたいてい別の図ではなく同じ図の前後なので、選び直す手を省く。
  // 中身が今と同じ控えは出さない (並べても何も見えない)。
  function options(docs, activeId, snap) {
    var out = [];
    var active = doc(docs, activeId);
    if (snap && active && String(snap.dsl || '') !== String(active.dsl || '')) {
      out.push({
        id: BEFORE_ID,
        name: (active.name || '') + ' (変更前)',
        diagramType: active.diagramType,
        isBefore: true,
      });
    }
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
  function pick(docs, activeId, preferredId, snap) {
    var opts = options(docs, activeId, snap);
    if (opts.length === 0) return null;
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].id === preferredId) return opts[i];
    }
    return opts[0];
  }

  // 参照図の中身。docs から 1 件を引く。見つからなければ null。
  // BEFORE_ID なら控えの本文を、編集中の図の名前・図種のまま返す
  // (図種が変わると描画側が別の図として扱ってしまう)。
  function doc(docs, id, activeId, snap) {
    if (id === BEFORE_ID) {
      if (!snap) return null;
      var active = doc(docs, activeId);
      if (!active) return null;
      return {
        id: BEFORE_ID,
        name: (active.name || '') + ' (変更前)',
        diagramType: active.diagramType,
        dsl: String(snap.dsl || ''),
        isBefore: true,
      };
    }
    var list = _list(docs);
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
  }

  // 並べて見られる状態か (タブが 2 枚以上あるか、または変更前の控えがあるか)。
  function canCompare(docs, activeId, snap) {
    return options(docs, activeId, snap).length > 0;
  }

  // 見出しの文言。どちらが編集中でどちらが参照かを取り違えないようにする。
  // 変更前の控えは「参照」ではなく「変更前」と言い切る (別の図と読み違えない)。
  function headerLabel(refDoc) {
    if (!refDoc) return '参照する図がありません';
    var t = String(refDoc.diagramType || '').replace('plantuml-', '');
    if (refDoc.isBefore) return '変更前: ' + refDoc.name.replace(' (変更前)', '') + (t ? ' (' + t + ')' : '');
    return '参照: ' + refDoc.name + (t ? ' (' + t + ')' : '');
  }

  return {
    BEFORE_ID: BEFORE_ID,
    options: options,
    pick: pick,
    doc: doc,
    canCompare: canCompare,
    headerLabel: headerLabel,
  };
})();
