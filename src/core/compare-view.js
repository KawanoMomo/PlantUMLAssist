'use strict';
window.MA = window.MA || {};

// compare-view — 参照ペインに並べる 1 枚を決める判断。
//
// 2 枚を比べるのは「この図の履歴」の版との比較だけ (TICKET-owner-20261115-2141-prune)。
// 並べる相手は、編集中の図の
//   - この図の履歴の「比較」で開いた版 (`{名前}@{刻印}` のタブ。version-history.openName)
//   - 変更前スナップショット (一括置換を当てた瞬間の控え)
// だけ。別のタブの図・他の保存フォルダから覗いた 1 枚・保存フォルダへ直接書いた回の控えを
// 相手に選ぶ口は外した (前の版は Git と「この図の履歴」が持つ。TICKET-owner-20261116-0821-prune)。
// 描画は app.js が受け持つ。
window.MA.compareView = (function() {

  function _list(docs) {
    return Array.isArray(docs) ? docs : [];
  }

  // 編集中の図の「変更前」を指す擬似 id。実在のタブと衝突しないよう記号で始める。
  var BEFORE_ID = '@before';

  function _s(v) { return v == null ? '' : String(v); }

  // name がこの図 (activeName) の版のタブか。版は「この図の履歴」の「比較」が
  // `{名前}@{刻印}` の名前で開く (version-history.openName)。
  function isVersionOf(name, activeName) {
    var n = _s(name);
    var a = _s(activeName);
    return !!a && n.length > a.length + 1 && n.indexOf(a + '@') === 0;
  }

  // 並べる相手の候補。編集中の図自身は候補にしない (同じ図を 2 つ出しても見比べにならない)。
  //
  // 編集中の図に「変更前スナップショット」(一括置換を当てた瞬間の控え) が
  // あるときは、その図自身を先頭の候補として出す。中身が今と同じ控えは出さない
  // (並べても何も見えない)。この図の版のタブはその後。
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
      // 別のタブの図は相手にしない (この図の履歴の版だけ)。
      if (!isVersionOf(d.name, active && active.name)) return;
      out.push({ id: d.id, name: d.name, diagramType: d.diagramType, isVersion: true });
    });
    return out;
  }

  // 実際に出す 1 枚を決める。
  //  - preferredId がまだ候補にあるならそれ (タブを行き来しても選び直さずに済む)
  //  - 無ければ先頭の候補 (開いた瞬間から何かが出る)
  //  - 候補が無ければ null
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

  // 並べて見られる状態か (この図の版のタブか、変更前の控えがあるか)。
  function canCompare(docs, activeId, snap) {
    return options(docs, activeId, snap).length > 0;
  }

  // 見出しの文言。どちらが編集中でどちらが前の版かを取り違えないようにする。
  function headerLabel(refDoc) {
    if (!refDoc) return '比べる版がありません';
    var t = String(refDoc.diagramType || '').replace('plantuml-', '');
    if (refDoc.isBefore) return '変更前: ' + refDoc.name.replace(' (変更前)', '') + (t ? ' (' + t + ')' : '');
    return '前の版: ' + refDoc.name + (t ? ' (' + t + ')' : '');
  }

  return {
    BEFORE_ID: BEFORE_ID,
    isVersionOf: isVersionOf,
    options: options,
    pick: pick,
    doc: doc,
    canCompare: canCompare,
    headerLabel: headerLabel,
  };
})();
