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
  // design「実装現況」7b: タブ列を畳むと、機能の存在に気付く手掛かりは Ctrl+K だけになる。
  // 道具を 1 つの「コマンド」見出しに 30 件積んだままでは、名前を先に知っている道具しか
  // 引けない。7a のツールメニューと同じ 6 分類で見出しを分け、Tab の絞り込み先もそこにする。
  // 分類の正本は tool-menu.js (メニューと同じ並び・同じ言葉)。ここでは写さない
  // — 2 か所に書くと、道具が増えたときにメニューにはあってパレットには無い、が起きる。
  var TOOL_GROUPS = ['make', 'edit', 'find', 'check', 'review', 'give'];
  var GROUPS = ['add', 'jump', 'selected'].concat(TOOL_GROUPS).concat(['command']);
  var GROUP_LABELS = {
    add: '図に足す / Add',
    jump: '図の要素へ移動 / Jump to element',
    selected: '選択中の要素に対して / Selected',
    make: '図をつくる / Make',
    edit: '書き換える / Edit',
    find: '探す・見比べる / Find',
    check: '確かめる / Check',
    review: 'レビュー / Review',
    give: '渡す / Deliver',
    command: 'コマンド / Command',
  };
  // 行の左に出す短い分類チップ。見出しの外へ絞り込んでも、その行が何の仲間かが
  // 1 語で分かるようにする (design 7b のパレットは行ごとに分類を出している)。
  var GROUP_CHIPS = {
    make: '図をつくる', edit: '書き換える', find: '探す・見比べる',
    check: '確かめる', review: 'レビュー', give: '渡す',
  };
  // 見出しの下に 1 行だけ出す補足。何が起きるか読まずに分かるようにする。
  var GROUP_NOTES = {
    jump: '選ぶとその行を選択し、右パネルで編集できます。',
  };

  function _toolMenu() {
    return (typeof window !== 'undefined' && window.MA) ? window.MA.toolMenu : null;
  }

  // コマンドが押すボタンの id → 6 分類。tool-menu に載っていないボタン
  // (ファイル操作・ズーム・図種切替) は道具ではないので分類しない。
  function groupOfButton(buttonId) {
    var tm = _toolMenu();
    if (!tm || !buttonId) return null;
    var g = tm.groupOf(buttonId);
    return (g && TOOL_GROUPS.indexOf(g) >= 0) ? g : null;
  }

  // メニューに出ている「何をするか」の言い換え。パレットでも同じ言葉にする
  // (メニューで覚えた語で引けるように)。
  function labelOfButton(buttonId) {
    var tm = _toolMenu();
    return (tm && buttonId) ? tm.labelOf(buttonId) : null;
  }

  function groupChip(g) { return GROUP_CHIPS[g] || ''; }

  // 道具の題 (「名前突合を開く / Name audit」) から、右端に置く短い呼び名を作る。
  // 英語併記と「を開く」等の動詞は落とす — 分類チップと本文で何をするかは
  // もう言えているので、右端は「どの道具か」の 1 語でよい。
  function _toolHint(title, label) {
    var short = toolShortName(title);
    return short === label ? '' : short;
  }

  function toolShortName(title) {
    var s = String(title == null ? '' : title).split('/')[0].trim();
    s = s.replace(/(を|に)?(開く|作る|する|見る)$/, '').trim();
    return s;
  }
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
      // 道具のコマンドは 6 分類へ移す。行の見出しはメニューと同じ言い換えにし、
      // 元の title は右端に回して「どの道具か」を残す (design 7b の 3 段組)。
      var toolGroup = (g === 'command') ? groupOfButton(c.button) : null;
      var toolLabel = toolGroup ? labelOfButton(c.button) : null;
      if (toolGroup) g = toolGroup;
      return {
        id: (g === 'command' ? 'command:' : g + ':') + c.id,
        kind: g === 'command' ? 'command' : g,
        group: g,
        badge: c.badge || (g === 'add' ? '追加' : g === 'selected' ? '選択中'
          : toolGroup ? groupChip(toolGroup) : 'コマンド'),
        title: toolLabel || c.title,
        // 右端は「どの道具か」。言い換えと同じ文字になるなら出さない (同じ語が 2 度並ぶ)。
        hint: toolLabel ? _toolHint(c.title, toolLabel) : (c.hint || ''),
        run: c.run,
        // メニューの言い換えでも元の題でも引けるようにする。どちらで覚えたかは人による。
        keywords: [c.title].concat(toolLabel ? [toolLabel] : []).concat(c.keywords || []),
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
  // 完全一致した道具のコマンドは 0、それ以外は 1。見出しをまたぐのはこの 1 段だけ。
  // 図の中身 (図に足す / 要素へ移動) は見出し順のまま読ませる — そちらは
  // 「何を探しているか」ではなく「今どこを見ているか」で並んでいた方が読める。
  function _exactRank(item, s) {
    if (s >= 0) return 1;
    var g = (item && item.group) || 'command';
    return (g === 'command' || TOOL_GROUPS.indexOf(g) >= 0) ? 0 : 1;
  }

  function filter(items, query) {
    var q = _s(query).trim();
    if (!q) return (items || []).slice();
    var scored = [];
    (items || []).forEach(function(item, i) {
      var s = score(item, q);
      if (s === null) return;
      scored.push({ item: item, s: s, i: i });
    });
    // BLK-builder-20260908-0908-3: 見出しが 4 つから 9 つに増えたので、見出し順を
    // 最優先にしたままだと、その語で名指しされた候補 (完全一致) が、たまたま同じ語を
    // 含むだけの候補に前の見出しから抜かれる (「保存」で「前回保存からの差分」が 1 位に
    // なった)。完全一致だけは見出しより先に出す。それ以外は従来どおり見出し順。
    scored.sort(function(a, b) {
      return _exactRank(a.item, a.s) - _exactRank(b.item, b.s)
        || groupIndex(a.item) - groupIndex(b.item) || a.s - b.s || a.i - b.i;
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
    groupChip: groupChip,
    groupOfButton: groupOfButton,
    toolShortName: toolShortName,
    TOOL_GROUPS: TOOL_GROUPS,
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
