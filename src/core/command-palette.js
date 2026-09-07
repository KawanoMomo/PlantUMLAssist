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
// 候補は 4 種類:
//   command  … ツールバー等の操作 (Open / Export / 図種切替 …)
//   add      … 図に足せるもの (メッセージ / 参加者 / 注釈 …)
//   element  … 今の DSL に書かれている宣言行 (participant / class / state …)
//   relation … 今の DSL に書かれている関係行 (User -> System : Request …)
//             element / relation は選ぶとその行へ飛ぶので、
//             「要素を検索」も同じ 1 つの窓で足りる。
//
// design「1a 展開」2a は、これを 3 つの見出しに分けて出すことを求める。
// 見出しは kind ではなく group で決める (add は kind も group も 'add' だが、
// element と relation は別 kind で同じ 'jump' に入る)。
window.MA.commandPalette = (function() {
  // 見出しの並び。開いた直後にまず「図に足せるもの」が見える順にする。
  var GROUPS = ['add', 'jump', 'selected', 'command'];
  var GROUP_LABELS = {
    add: '図に足す / Add',
    jump: '図の要素へ移動 / Jump to element',
    selected: '選択中の要素に対して / Selected',
    command: 'コマンド / Command',
  };
  // 見出しの下に 1 行だけ出す補足。何が起きるか読まずに分かるようにする。
  var GROUP_NOTES = {
    jump: '選ぶとその行を選択し、右パネルで編集できます。',
  };
  // relation 行の矢印。長いものから並べる (-> が -->> を食わないように)。
  var REL_ARROWS = [
    '<-->', '-->>', '-->x', '<<--', '<|--', '<|..', '--|>', '..|>',
    '<->', '<<-', '-->', '->>', '->x', '<--', '..>', '<..', '--*', '*--',
    '--o', 'o--', '->', '<-', '--', '..',
  ];
  // 関係行として扱わない行頭キーワード。ブロック開始や宣言は別 kind か対象外。
  var NOT_REL_RE = /^\s*(@start|@end|title|note|end|alt|else|opt|loop|par|break|critical|group|activate|deactivate|autonumber|skinparam|hide|show|legend|caption|footer|header|scale|left|right|top|bottom|newpage|ref|return|create|destroy|!|'|\/')/i;
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
        group: 'jump',
        badge: '要素',
        title: name,
        hint: kind + ' · L' + (i + 1),
        line: i + 1,
        keywords: [kind, name, lines[i].trim()],
      });
    }
    return items;
  }

  // 関係行 (User -> System : Request) を「行き先」候補にする。
  // design 2a の一覧は宣言だけでなくメッセージ行も並べる。宣言行しか拾わないと
  // 「7 行目のあのメッセージ」へ 1 発で飛べない。
  function relationItems(dslText) {
    var lines = _s(dslText).split('\n');
    var items = [];
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var line = raw.trim();
      if (!line || NOT_REL_RE.test(line)) continue;
      var parsed = _splitRelation(line);
      if (!parsed) continue;
      items.push({
        id: 'relation:' + (i + 1),
        kind: 'relation',
        group: 'jump',
        badge: 'MSG',
        title: parsed.from + ' ' + parsed.arrow + ' ' + parsed.to +
               (parsed.label ? ' : ' + parsed.label : ''),
        hint: (i + 1) + ' 行目',
        line: i + 1,
        keywords: [parsed.from, parsed.to, parsed.label, line],
      });
    }
    return items;
  }

  // `A <arrow> B : label` を割る。矢印が 1 個も無い / 両側が空なら null。
  function _splitRelation(line) {
    var body = line, label = '';
    var colon = _labelColon(line);
    if (colon >= 0) { body = line.slice(0, colon).trim(); label = line.slice(colon + 1).trim(); }
    for (var i = 0; i < REL_ARROWS.length; i++) {
      var a = REL_ARROWS[i];
      var at = body.indexOf(' ' + a + ' ');
      if (at < 0) continue;
      var from = body.slice(0, at).trim();
      var to = body.slice(at + a.length + 2).trim();
      if (!from || !to) return null;
      // 両側に別の矢印が残っているなら区切りを誤っている。
      if (/[<>]/.test(from) || /[<>]/.test(to)) return null;
      return { from: _unq(from), arrow: a, to: _unq(to), label: label };
    }
    return null;
  }

  // ラベル区切りの `:`。`"..."` の中の `:` と、`::` (C++ 風の名前) は数えない。
  function _labelColon(line) {
    var inQ = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (inQ) continue;
      if (c === ':') {
        if (line[i + 1] === ':') { i++; continue; }
        return i;
      }
    }
    return -1;
  }

  function _unq(s) { return s.replace(/^"(.*)"$/, '$1'); }

  // ── 選択中の操作の言い換え ─────────────────────────────────────────
  // design 2a の「選択中のメッセージに対して」は、2d と同じ流儀で
  // 「何が起きるか」を先に書き、記法を右に小さく置くことを求める
  // (「呼び出しの開始・終了を自動で入れる」+ `activate`)。
  // 候補名の元は右ペインのボタンの文字なので、そのままだと
  // 「⚡ ライフライン推論 (activate/deactivate)」のように記法と記号が前に出る。
  // ここでボタンの文字を言い換えに引き当てる。表に無いボタンは、記号だけを
  // 落として文字をそのまま使う (モジュールがボタンを増やしても古びない)。
  var ACTION_PHRASES = [
    { match: 'ライフライン推論', title: '呼び出しの開始・終了を自動で入れる', hint: 'activate' },
    { match: 'alt/loop',         title: '条件分岐・繰り返しの枠で囲む',       hint: 'alt / loop' },
    { match: 'この前に',         title: '選んだ行の前に足す',                 hint: 'insert before' },
    { match: 'この後に注釈',     title: '選んだ行に説明を書き添える',         hint: 'note' },
    { match: 'この後に',         title: '選んだ行の後に足す',                 hint: 'insert after' },
    { match: 'ノートを添え',     title: 'この要素に説明を書き添える',         hint: 'note' },
    { match: '向きを入れ替え',   title: 'From と To を入れ替える',            hint: 'swap' },
    { match: '⇄',                title: 'From と To を入れ替える',            hint: 'swap' },
    { match: '上へ',             title: '選んだ要素を 1 つ上へ動かす',        hint: 'Alt+↑' },
    { match: '下へ',             title: '選んだ要素を 1 つ下へ動かす',        hint: 'Alt+↓' },
    { match: '複製',             title: '選んだ要素を複製する',               hint: 'Ctrl+D' },
    { match: '削除',             title: '選んだ要素を消す',                   hint: 'Delete' },
  ];

  // 先頭の絵記号と、末尾の「…」を落とす。言い換えが無いときの見出しに使う。
  function _plainLabel(label) {
    return String(label == null ? '' : label)
      .replace(/^[\s -　]*[^\w\s぀-ヿ一-鿿(]+\s*/, '')
      .replace(/\s*[.…]{1,3}\s*$/, '')
      .trim();
  }

  // ボタンの文字 → パレットに出す { title, hint }。
  function describeAction(label) {
    var raw = String(label == null ? '' : label).trim();
    for (var i = 0; i < ACTION_PHRASES.length; i++) {
      if (raw.indexOf(ACTION_PHRASES[i].match) >= 0) {
        return { title: ACTION_PHRASES[i].title, hint: ACTION_PHRASES[i].hint, label: raw };
      }
    }
    return { title: _plainLabel(raw) || raw, hint: '', label: raw };
  }

  // コマンド定義 + 今の DSL から、絞り込み前の候補一覧を作る。
  // 並びは GROUPS 順。開いた直後の一覧がそのまま design 2a の見出し順になる。
  function buildItems(commands, dslText) {
    var cmds = (commands || []).map(function(c) {
      var g = c.group || 'command';
      return {
        id: (g === 'command' ? 'command:' : g + ':') + c.id,
        kind: g === 'command' ? 'command' : g,
        group: g,
        badge: c.badge || (g === 'add' ? '追加' : g === 'selected' ? '選択中' : 'コマンド'),
        title: c.title,
        hint: c.hint || '',
        run: c.run,
        keywords: [c.title].concat(c.keywords || []),
      };
    });
    return sortByGroup(cmds.concat(elementItems(dslText)).concat(relationItems(dslText)));
  }

  function groupIndex(item) {
    var g = (item && item.group) || 'command';
    var i = GROUPS.indexOf(g);
    return i < 0 ? GROUPS.length : i;
  }

  // group 順の安定ソート。同じ group の中では元の順を保つ。
  function sortByGroup(items) {
    return (items || []).map(function(it, i) { return { it: it, i: i }; })
      .sort(function(a, b) { return groupIndex(a.it) - groupIndex(b.it) || a.i - b.i; })
      .map(function(x) { return x.it; });
  }

  function groupLabel(g) { return GROUP_LABELS[g] || g; }
  function groupNote(g) { return GROUP_NOTES[g] || ''; }

  // items に実在する group を GROUPS 順で。Tab の巡回先はこれだけにする
  // (中身が無い見出しへ絞り込めると「押しても何も出ない」になる)。
  function groupsOf(items) {
    var seen = {};
    (items || []).forEach(function(it) { seen[(it && it.group) || 'command'] = true; });
    return GROUPS.filter(function(g) { return seen[g]; });
  }

  // Tab の巡回。null (全部) → 先頭の group → … → 末尾 → null に戻る。
  function cycleGroup(current, present, dir) {
    var list = present || [];
    if (!list.length) return null;
    var ring = [null].concat(list);
    var at = ring.indexOf(current == null ? null : current);
    if (at < 0) at = 0;
    var next = at + (dir < 0 ? -1 : 1);
    if (next < 0) next = ring.length - 1;
    if (next >= ring.length) next = 0;
    return ring[next];
  }

  function filterByGroup(items, group) {
    if (!group) return (items || []).slice();
    return (items || []).filter(function(it) { return ((it && it.group) || 'command') === group; });
  }

  // 打った文字を候補にぶつける。連続一致 (部分文字列) を最優先にしつつ、
  // 頭文字だけ打った場合 (例: "ex" → Export) も拾えるように順序一致も許す。
  // 一致しなければ null。数字が小さいほど「近い」。
  //
  // BLK-builder-20260908-0807-2-red: 部分一致の「見つかった位置」だけで順位を
  // 決めていたので、「保存」と打つと先頭一致の「保存フォルダの図を一覧」が 1 位、
  // 本命の「ファイルを保存」は 3 位だった。他の語にたまたま含まれているだけの
  // 候補が、その語で名指しされた候補を押しのけていた。
  // 完全一致 (キーワードちょうど 1 語) は部分一致より必ず前に出す。
  var EXACT_TITLE = -2000;
  var EXACT_FIELD = -1000;

  function score(item, query) {
    var q = _s(query).trim().toLowerCase();
    if (!q) return 0;
    var fields = [item.title].concat(item.keywords || []).concat([item.hint]);
    var best = null;
    for (var i = 0; i < fields.length; i++) {
      var f = _s(fields[i]).toLowerCase();
      if (!f) continue;
      if (f === q) {
        var se = (i === 0 ? EXACT_TITLE : EXACT_FIELD);
        if (best === null || se < best) best = se;
        continue;
      }
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
  // 並びは group を最優先にする。見出しごとに区切って出す (design 2a) 以上、
  // 同じ group の候補が離れて並ぶと見出しが繰り返されて読めなくなる。
  // group の中では近い順 (score)。
  function filter(items, query) {
    var q = _s(query).trim();
    if (!q) return (items || []).slice();
    var scored = [];
    (items || []).forEach(function(item, i) {
      var s = score(item, q);
      if (s === null) return;
      scored.push({ item: item, s: s, i: i });
    });
    scored.sort(function(a, b) {
      return groupIndex(a.item) - groupIndex(b.item) || a.s - b.s || a.i - b.i;
    });
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
    GROUPS: GROUPS.slice(),
    buildItems: buildItems,
    elementItems: elementItems,
    relationItems: relationItems,
    sortByGroup: sortByGroup,
    groupLabel: groupLabel,
    groupNote: groupNote,
    groupsOf: groupsOf,
    cycleGroup: cycleGroup,
    filterByGroup: filterByGroup,
    filter: filter,
    score: score,
    moveIndex: moveIndex,
    describeAction: describeAction,
  };
})();
