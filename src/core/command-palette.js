'use strict';
window.MA = window.MA || {};

// command-palette — Ctrl+K で開く「コマンド・要素を検索」の中身。
//
// design/「PlantUMLAssist - リデザイン案」1a (コマンド中心) は、ツールバーの
// ボタンを目で探す代わりに、名前を打ってコマンドを実行する経路を求める。
// DOM を触るのは app.js 側だけにして、ここでは「何が候補になるか」と
// 「打った文字でどう絞り込むか」だけを持つ。こうするとキーボード操作の
// 挙動を unit テストで確かめられる。
//
// 候補は 2 種類:
//   command … ツールバー等の操作 (Open / Export / 図種切替 …)
//   element … 今の DSL に書かれている宣言行 (participant / class / state …)。
//             選ぶとその行へ飛ぶので「要素を検索」も同じ 1 つの窓で足りる。
window.MA.commandPalette = (function() {
  // 宣言行として拾うキーワード。名前が付いていて、飛ぶ意味がある行だけ。
  var DECL_RE = /^\s*(participant|actor|boundary|control|entity|database|collections|queue|class|abstract\s+class|interface|enum|state|component|node|package|folder|rectangle|cloud|storage|usecase)\s+(.+?)\s*$/i;

  function _s(v) { return v == null ? '' : String(v); }

  // 宣言行から表示名を取り出す。`"表示名" as Id` は表示名と Id の両方を
  // 検索対象にしたいので、そのままの並びで返す。
  function _declName(rest) {
    var quoted = rest.match(/^"([^"]+)"\s*(?:as\s+([A-Za-z0-9_][\w.-]*))?/);
    if (quoted) return quoted[1] + (quoted[2] ? ' (' + quoted[2] + ')' : '');
    var plain = rest.match(/^([A-Za-z0-9_][\w.-]*)/);
    return plain ? plain[1] : rest.trim();
  }

  // DSL 本文から element 候補を作る。line は 1 始まり (エディタの行番号と同じ)。
  function elementItems(dslText) {
    var lines = _s(dslText).split('\n');
    var items = [];
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(DECL_RE);
      if (!m) continue;
      var kind = m[1].replace(/\s+/g, ' ').toLowerCase();
      var name = _declName(m[2]);
      if (!name) continue;
      items.push({
        id: 'element:' + (i + 1),
        kind: 'element',
        title: name,
        hint: kind + ' · L' + (i + 1),
        line: i + 1,
        keywords: [kind, name, lines[i].trim()],
      });
    }
    return items;
  }

  // コマンド定義 + 今の DSL から、絞り込み前の候補一覧を作る。
  function buildItems(commands, dslText) {
    var cmds = (commands || []).map(function(c) {
      return {
        id: 'command:' + c.id,
        kind: 'command',
        title: c.title,
        hint: c.hint || '',
        run: c.run,
        keywords: [c.title].concat(c.keywords || []),
      };
    });
    return cmds.concat(elementItems(dslText));
  }

  // 打った文字を候補にぶつける。連続一致 (部分文字列) を最優先にしつつ、
  // 頭文字だけ打った場合 (例: "ex" → Export) も拾えるように順序一致も許す。
  // 一致しなければ null。数字が小さいほど「近い」。
  function score(item, query) {
    var q = _s(query).trim().toLowerCase();
    if (!q) return 0;
    var fields = [item.title].concat(item.keywords || []).concat([item.hint]);
    var best = null;
    for (var i = 0; i < fields.length; i++) {
      var f = _s(fields[i]).toLowerCase();
      if (!f) continue;
      var idx = f.indexOf(q);
      if (idx >= 0) {
        // 先頭一致ほど強い。title (i===0) を他より優先する。
        var s = idx + (i === 0 ? 0 : 100);
        if (best === null || s < best) best = s;
        continue;
      }
      if (_subsequence(f, q)) {
        var s2 = 1000 + (i === 0 ? 0 : 100);
        if (best === null || s2 < best) best = s2;
      }
    }
    return best;
  }

  // q の文字が f にこの順で現れるか (間に何が挟まってもよい)。
  function _subsequence(f, q) {
    var j = 0;
    for (var i = 0; i < f.length && j < q.length; i++) {
      if (f[i] === q[j]) j++;
    }
    return j === q.length;
  }

  // 絞り込み結果。query が空なら全件を元の順で返す (開いた直後の一覧)。
  function filter(items, query) {
    var q = _s(query).trim();
    if (!q) return (items || []).slice();
    var scored = [];
    (items || []).forEach(function(item, i) {
      var s = score(item, q);
      if (s === null) return;
      scored.push({ item: item, s: s, i: i });
    });
    scored.sort(function(a, b) { return a.s - b.s || a.i - b.i; });
    return scored.map(function(x) { return x.item; });
  }

  // ↑↓ の移動。候補が 0 件なら -1 のまま。端では折り返す
  // (候補が少ないときに「押しても動かない」より迷わない)。
  function moveIndex(current, delta, count) {
    if (!count || count <= 0) return -1;
    var next = current + delta;
    if (next < 0) next = count - 1;
    if (next >= count) next = 0;
    return next;
  }

  return {
    buildItems: buildItems,
    elementItems: elementItems,
    filter: filter,
    score: score,
    moveIndex: moveIndex,
  };
})();
