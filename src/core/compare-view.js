'use strict';
window.MA = window.MA || {};

// compare-view — 参照ペインに並べる 1 枚を決める判断。
//
// 2 枚を比べるのは「この図の履歴」の版との比較だけ (TICKET-owner-20261115-2141-prune)。
// 並べる相手は、編集中の図の
//   - この図の履歴の「比較」で開いた版 (`{名前}@{刻印}` のタブ。version-history.openName)
//   - 変更前スナップショット (一括置換を当てた瞬間の控え)
//   - 保存フォルダへ直接書いた回の控え (write-history)
// だけ。別のタブの図・他の保存フォルダから覗いた 1 枚を相手に選ぶ口は外した。
// 描画は app.js が受け持つ。
window.MA.compareView = (function() {

  function _list(docs) {
    return Array.isArray(docs) ? docs : [];
  }

  // 編集中の図の「変更前」を指す擬似 id。実在のタブと衝突しないよう記号で始める。
  var BEFORE_ID = '@before';

  // 保存フォルダへ直接書いた操作の控え (write-history) から作る擬似 id。
  //
  // ⇄ 一括置換・🔖 [適用] は保存フォルダへ直接書くので、
  // 「その図をエディタで開いていたセッション」の中でしか残らない BEFORE_ID では
  // 後から前後を出せない。操作 1 回ぶんの控えを 1 候補として並べ、会議の場で
  // 「今日のどの回を見せるか」を選べるようにする。
  // 中身 (どの操作がどう変わったか) は app.js が write-history から引いて渡す。
  var HIST_PREFIX = '@hist:';

  function _s(v) { return v == null ? '' : String(v); }

  function _hist(list) {
    return (Array.isArray(list) ? list : []).filter(function(h) {
      return h && _s(h.id) && _s(h.dsl);
    });
  }

  function _histDoc(hist, id, active) {
    var list = _hist(hist);
    for (var i = 0; i < list.length; i++) {
      if (HIST_PREFIX + _s(list[i].id) !== _s(id)) continue;
      var h = list[i];
      return {
        id: HIST_PREFIX + _s(h.id),
        histId: _s(h.id),
        name: _s(h.label) || _s(h.name) || ((active && active.name) || ''),
        fileName: _s(h.name),
        diagramType: (active && active.diagramType) || '',
        dsl: _s(h.dsl),
        isBefore: true,
        isHistory: true,
      };
    }
    return null;
  }

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
  // (並べても何も見えない)。保存フォルダへ直接書いた回はその次、この図の版のタブは最後。
  function options(docs, activeId, snap, hist) {
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
    _hist(hist).forEach(function(h) {
      out.push({
        id: HIST_PREFIX + _s(h.id),
        histId: _s(h.id),
        name: _s(h.label) || _s(h.name),
        diagramType: active ? active.diagramType : '',
        isBefore: true,
        isHistory: true,
      });
    });
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
  function pick(docs, activeId, preferredId, snap, hist) {
    var opts = options(docs, activeId, snap, hist);
    if (opts.length === 0) return null;
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].id === preferredId) return opts[i];
    }
    return opts[0];
  }

  // 参照図の中身。docs から 1 件を引く。見つからなければ null。
  // BEFORE_ID なら控えの本文を、編集中の図の名前・図種のまま返す
  // (図種が変わると描画側が別の図として扱ってしまう)。
  function doc(docs, id, activeId, snap, hist) {
    if (_s(id).indexOf(HIST_PREFIX) === 0) {
      return _histDoc(hist, id, doc(docs, activeId));
    }
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
  function canCompare(docs, activeId, snap, hist) {
    return options(docs, activeId, snap, hist).length > 0;
  }

  // 見出しの文言。どちらが編集中でどちらが前の版かを取り違えないようにする。
  function headerLabel(refDoc) {
    if (!refDoc) return '比べる版がありません';
    var t = String(refDoc.diagramType || '').replace('plantuml-', '');
    // 保存フォルダへ直接書いた回の控えは、名に「いつ・どの操作の前か」が
    // 入っている。図種を足すと読みにくくなるのでそのまま出す。
    if (refDoc.isHistory) return '変更前: ' + refDoc.name;
    if (refDoc.isBefore) return '変更前: ' + refDoc.name.replace(' (変更前)', '') + (t ? ' (' + t + ')' : '');
    return '前の版: ' + refDoc.name + (t ? ' (' + t + ')' : '');
  }

  return {
    BEFORE_ID: BEFORE_ID,
    HIST_PREFIX: HIST_PREFIX,
    isVersionOf: isVersionOf,
    options: options,
    pick: pick,
    doc: doc,
    canCompare: canCompare,
    headerLabel: headerLabel,
  };
})();
