'use strict';
// select-at-line — 「DSL の N 行目」を「その行の要素の選択」に変える。
//
// BLK-junior-20260907-2303: 要素をプレビュー上の座標で選び直すと、遷移を 1 本足した
// だけでノードが動いて別の要素に当たる。行番号は再レイアウトで動かないので、
// 行 → 要素の対応をここに 1 つだけ置き、構造タブの行クリックと Ctrl+K のジャンプの
// 両方が同じ規則で選ぶようにする。DOM にも図種モジュールにも依存しない純関数。
window.MA = window.MA || {};
window.MA.selectAtLine = (function() {

  // list は module の kbdSelectables() が返す [{ type, id, line }]。
  // line は 1 始まり (エディタの行番号と同じ)。見つからなければ null。
  function pick(list, line) {
    if (!list || !list.length) return null;
    var n = parseInt(line, 10);
    if (isNaN(n)) return null;
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (!it || it.line !== n) continue;
      return { type: it.type || 'message', id: it.id, line: n };
    }
    return null;
  }

  // 関係 (message) しか持たない module 向けの既定リスト。
  function messageSelectables(parsed) {
    var rels = (parsed && parsed.relations) || [];
    return rels.filter(function(r) { return r.kind === 'message'; })
      .map(function(r) { return { type: 'message', id: r.id, line: r.line }; });
  }

  return { pick: pick, messageSelectables: messageSelectables };
})();
