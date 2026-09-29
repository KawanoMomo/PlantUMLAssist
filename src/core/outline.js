'use strict';
window.MA = window.MA || {};

// outline — DSL から図の構造(要素・関係・入れ子ブロック)を組み立てる純関数。
//
// design/「PlantUMLAssist - リデザイン案」1a のエディタペインは「DSL」と
// 「構造 / Outline」の 2 タブで、構造タブは図に何が宣言され関係が何本あるかを
// 一覧で見せ、下部に「パース OK」「3 elements · 4 relations」を出す。
// DSL 全文を目で追わずに図の骨格を掴み、行へ飛ぶための索引を作る。
//
// 図種ごとにモジュールを分けないのは、構造タブが必要とするのが
// 「この行は宣言か・関係か・ブロックか」という粒度だけで、図種を跨いで
// 同じ規則で判定できるため(宣言キーワードと矢印の形は図種で重ならない)。
window.MA.outline = (function() {

  // 宣言行。label は画面に出す表示名、name は識別子(行へ飛ぶ手掛かり)。
  var DECLS = [
    { kind: 'actor', re: /^\s*actor\s+(.+)$/i },
    { kind: 'participant', re: /^\s*(?:participant|boundary|control|entity|database|collections|queue)\s+(.+)$/i },
    { kind: 'class', re: /^\s*(?:abstract\s+class|abstract|class|interface|enum|struct)\s+(.+)$/i },
    { kind: 'state', re: /^\s*state\s+(.+)$/i },
    { kind: 'component', re: /^\s*(?:component|node|folder|rectangle|cloud|storage)\s+(.+)$/i },
    { kind: 'usecase', re: /^\s*usecase\s+(.+)$/i },
  ];

  // 括りのブロック。end 系まで入れ子の深さを 1 段上げる。
  var BLOCK_OPEN = /^\s*(alt|opt|loop|par|break|critical|group|ref\s+over|package|namespace|partition|fork|split|while|repeat)\b(.*)$/i;
  var BLOCK_ELSE = /^\s*(else|elseif|fork again|split again)\b(.*)$/i;
  var BLOCK_CLOSE = /^\s*(end\s*note|endif|endwhile|end\s+fork|end\s+split|end\s+merge|repeat\s+while|end|\})\s*(.*)$/i;
  var IF_OPEN = /^\s*if\s*\((.*?)\)\s*then\b(.*)$/i;

  // 矢印(関係)。図種で形は違うが「左辺 矢印 右辺」の並びは共通。
  // BLK-builder-20260925-0314-1: 名前は日本語 (U+0080 以上) でもよい (`App -> センサ制御 : Init()`)。
  var REL_RE = new RegExp(
    '^\\s*(\\[\\*\\]|"[^"]*"|\\(.*?\\)|:[^:]*:|[A-Za-z0-9_\u0080-\uFFFF][A-Za-z0-9_.\u0080-\uFFFF-]*)' +
    // BLK-migrator-20260929-1155: 向き (`-right->`) と色・線種 (`-[#red]->`) を挟んだ矢印も 1 本の関係として数える
    // (state-15 は遷移 6 本を 1 本と数え、下端が「1 state · 1 transition」だった)。
    '\\s*([-.]+(?:(?:up|down|left|right|u|d|l|r)(?=[-.\\[]))?(?:\\[[^\\]]*\\])?[-.]*>+|[-.=]{1,2}(?:\\(\\)|o|\\*|\\|>)?[->x]*|<[-.|]{1,2}[a-z]*|<\\|[-.]+|[-.]+\\|>|\\*[-.]+|o[-.]+|\\)[-.]+|[-.]+\\(|[-.]{2,})\\s*' +
    '(\\[\\*\\]|"[^"]*"|\\(.*?\\)|:[^:]*:|[A-Za-z0-9_\u0080-\uFFFF][A-Za-z0-9_.\u0080-\uFFFF-]*)\\s*(?::\\s*(.*))?$'
  );

  // 枝分かれとして数えるブロック (block ノードの label と一致させる)。
  var BRANCH_LABELS = { 'if': 1, 'while': 1, 'repeat': 1, 'fork': 1, 'split': 1 };

  var NOTE_RE = /^\s*(?:note|hnote|rnote)\b(.*)$/i;
  var TITLE_RE = /^\s*title\s+(.+)$/i;
  // 見た目の指定。構造としては意味を持たないので数にも一覧にも入れない。
  var NOISE_RE = /^\s*(?:skinparam|!|hide|show|scale|autonumber|header|footer|legend|end\s*legend|caption|left\s+to\s+right|top\s+to\s+bottom|@startuml|@enduml)\b/i;
  // 活性区間。宣言でも関係でもないが、どのライフラインの話かは出す。
  var ACT_RE = /^\s*(activate|deactivate|destroy|return|start|stop|detach|kill)\b(.*)$/i;

  function _clean(s) {
    return String(s == null ? '' : s).replace(/\r$/, '');
  }

  // 宣言行の右側から、画面に出す名前を作る。
  //   "GPIO ドライバ" as GpioDrv → { label: 'GPIO ドライバ', name: 'GpioDrv' }
  //   Sample as S               → { label: 'Sample',        name: 'S' }
  //   Foo : 説明                 → { label: 'Foo',           name: 'Foo' }
  function _splitDecl(rest) {
    var body = String(rest || '').trim();
    // 末尾の色指定・ステレオタイプ・本体開始の { を落とす
    body = body.replace(/\s*\{\s*$/, '').replace(/\s+#[0-9A-Za-z_]+\s*$/, '');
    var note = '';
    var colon = body.match(/^(.*?)\s*:\s*(.+)$/);
    if (colon && !/^".*"$/.test(body)) { body = colon[1].trim(); note = colon[2].trim(); }
    var stereo = body.match(/^(.*?)\s*(<<[^>]*>>)\s*$/);
    if (stereo) body = stereo[1].trim();
    var as = body.match(/^(.*?)\s+as\s+([A-Za-z0-9_\u0080-\uFFFF][A-Za-z0-9_.\u0080-\uFFFF-]*)\s*$/i);
    var label, name;
    if (as) {
      label = _unquote(as[1]);
      name = as[2];
    } else {
      label = _unquote(body);
      name = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(body) ? body : label;
    }
    return { label: label || name || '', name: name || label || '', note: note };
  }

  function _unquote(s) {
    var t = String(s == null ? '' : s).trim();
    if (t.length >= 2 && t.charAt(0) === '"' && t.charAt(t.length - 1) === '"') return t.slice(1, -1);
    if (t.length >= 2 && t.charAt(0) === '(' && t.charAt(t.length - 1) === ')') return _unquote(t.slice(1, -1));
    if (t.length >= 2 && t.charAt(0) === ':' && t.charAt(t.length - 1) === ':') return t.slice(1, -1).trim();
    return t;
  }

  // 入れ子の道筋。`Configured` の中の `Sub` の中なら 'Configured / Sub'。
  // トップレベルは '' (今まで通り親を持たない)。
  var PARENT_SEP = ' / ';

  function _parentOf(stack) {
    if (!stack || stack.length === 0) return '';
    return stack.map(function(s) { return s.label; }).join(PARENT_SEP);
  }

  function _isComment(line) {
    var du = window.MA && window.MA.dslUtils;
    if (du && typeof du.isPlantumlComment === 'function') return du.isPlantumlComment(line);
    return /^\s*'/.test(String(line || ''));
  }

  // dsl → { ok, errors, nodes, counts }
  // nodes: [{ line(0始まり), kind, label, detail, depth }]
  //   kind: 'title' | 'actor' | 'participant' | 'class' | 'state' | 'component'
  //         | 'usecase' | 'relation' | 'block' | 'note' | 'lifeline'
  // counts.elements は宣言、counts.relations は矢印の数。
  function build(dsl) {
    var lines = window.MA.dslUtils.splitLines(dsl);
    var nodes = [];
    var errors = [];
    var depth = 0;
    var open = [];   // [{ kind, line }] 閉じられていないブロック
    // 本体を開いている宣言 (`state Configured {` など) の積み。中の節に
    // 「どの親の中か」を付けるために持つ。alt/loop のような括りは親に数えない。
    var declStack = [];
    var sawStart = false, sawEnd = false;

    for (var i = 0; i < lines.length; i++) {
      var raw = _clean(lines[i]);
      var line = raw.trim();
      if (line === '') continue;
      if (_isComment(raw)) continue;
      if (/^@startuml\b/i.test(line)) { sawStart = true; continue; }
      if (/^@enduml\b/i.test(line)) { sawEnd = true; continue; }
      if (NOISE_RE.test(line)) continue;

      var m;

      if ((m = line.match(TITLE_RE))) {
        nodes.push({ line: i, kind: 'title', label: _unquote(m[1]), detail: '', depth: depth });
        continue;
      }

      // ブロックを閉じる。else 系は同じ深さのまま札を差し替える。
      if (BLOCK_CLOSE.test(line) && !REL_RE.test(line)) {
        if (open.length === 0) {
          errors.push({ line: i, message: (i + 1) + ' 行目: 対応する開始のない `' + line + '`' });
        } else {
          open.pop();
          depth = open.length;
          while (declStack.length && declStack[declStack.length - 1].depth >= depth) declStack.pop();
        }
        continue;
      }
      if (BLOCK_ELSE.test(line)) {
        m = line.match(BLOCK_ELSE);
        nodes.push({
          line: i, kind: 'block', label: m[1].toLowerCase(),
          detail: String(m[2] || '').trim(), depth: Math.max(0, depth - 1),
        });
        continue;
      }
      if ((m = line.match(IF_OPEN))) {
        nodes.push({ line: i, kind: 'block', label: 'if', detail: String(m[1] || '').trim(), depth: depth });
        open.push({ kind: 'if', line: i });
        depth = open.length;
        continue;
      }
      if ((m = line.match(BLOCK_OPEN)) && !REL_RE.test(line)) {
        nodes.push({
          line: i, kind: 'block', label: m[1].toLowerCase().replace(/\s+/g, ' '),
          detail: _unquote(String(m[2] || '').replace(/\s*\{\s*$/, '')), depth: depth,
        });
        open.push({ kind: m[1].toLowerCase(), line: i });
        depth = open.length;
        continue;
      }

      if (NOTE_RE.test(line) && !REL_RE.test(line)) {
        m = line.match(NOTE_RE);
        var body = String(m[1] || '').trim();
        var colon = body.match(/:\s*(.+)$/);
        nodes.push({
          line: i, kind: 'note', label: 'note',
          detail: colon ? colon[1].trim() : body, depth: depth, parent: _parentOf(declStack),
        });
        // note left of X ... end note の複数行形式は end note で閉じる
        if (!colon) { open.push({ kind: 'note', line: i }); depth = open.length; }
        continue;
      }

      // 宣言。矢印を含む行(`A --> B` など)は関係として扱う。
      var decl = null;
      if (!REL_RE.test(line)) {
        for (var d = 0; d < DECLS.length; d++) {
          var dm = line.match(DECLS[d].re);
          if (!dm) continue;
          decl = { kind: DECLS[d].kind, parts: _splitDecl(dm[1]) };
          break;
        }
      }
      if (decl) {
        nodes.push({
          line: i, kind: decl.kind, label: decl.parts.label,
          detail: decl.parts.note || (decl.parts.name !== decl.parts.label ? decl.parts.name : ''),
          depth: depth, parent: _parentOf(declStack),
        });
        // `state Configured {` のように本体を開く宣言は、そこから `}` までが
        // 子の居場所。開き札を積まないと `}` が「対応する開始がない」になり、
        // 中の子状態・子の遷移が親と同じ深さ (= トップレベル) に見えてしまう。
        if (/\{\s*$/.test(line)) {
          open.push({ kind: decl.kind, line: i });
          declStack.push({ label: decl.parts.label, depth: depth });
          depth = open.length;
        }
        continue;
      }

      if ((m = line.match(REL_RE))) {
        nodes.push({
          line: i, kind: 'relation',
          label: _unquote(m[1]) + ' ' + m[2] + ' ' + _unquote(m[3]),
          from: _unquote(m[1]), to: _unquote(m[3]),
          detail: String(m[4] || '').trim(), depth: depth, parent: _parentOf(declStack),
        });
        continue;
      }

      if ((m = line.match(ACT_RE))) {
        nodes.push({
          line: i, kind: 'lifeline', label: m[1].toLowerCase(),
          detail: String(m[2] || '').trim(), depth: depth,
        });
        continue;
      }

      // 括弧なしのアクティビティ (`:処理;`) や独立宣言 (`Idle`) は要素として拾う。
      // `:処理;` はアクティビティ図のアクション。状態と同じ札にすると、構造タブの
      // 種別バッジも下部の数え方も「state」になってしまう (design 4b は actions と数える)。
      if (/^:.*;$/.test(line)) {
        nodes.push({ line: i, kind: 'action', label: line.replace(/^:/, '').replace(/;$/, '').trim(), detail: '', depth: depth, parent: _parentOf(declStack) });
        continue;
      }
      if (/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(line)) {
        nodes.push({ line: i, kind: 'state', label: line, detail: '', depth: depth, parent: _parentOf(declStack) });
        continue;
      }
    }

    for (var k = 0; k < open.length; k++) {
      errors.push({
        line: open[k].line,
        message: (open[k].line + 1) + ' 行目の `' + open[k].kind + '` が閉じられていません',
      });
    }
    if (!sawStart) errors.push({ line: 0, message: '@startuml がありません' });
    if (!sawEnd) errors.push({ line: Math.max(0, lines.length - 1), message: '@enduml がありません' });

    var elements = 0, relations = 0;
    var classes = 0, actions = 0, branches = 0;
    // 状態は「宣言された state」と「遷移の端に出てくる名前」の和集合。状態遷移図は
    // `Idle --> Running : start` だけで状態を導入できるので、宣言だけを数えると 0 になる。
    var stateNames = {};
    for (var n = 0; n < nodes.length; n++) {
      var k = nodes[n].kind;
      if (k === 'relation') {
        relations++;
        [nodes[n].from, nodes[n].to].forEach(function(end) {
          var name = String(end || '').trim();
          // BLK-owner-20260923-2332-1: `Idle.Standby` と修飾した端は、`state Idle { state Standby }` の
          // Standby と同じ状態 (PlantUML は入れ子の子として描く)。別の状態として数えない。
          if (name.indexOf('.') >= 0) name = name.split('.').pop();
          if (name && name !== '[*]') stateNames[name] = 1;
        });
        continue;
      }
      if (k === 'block') {
        // 分岐・繰り返し・並行は「枝分かれ」1 つと数える。else / elseif は
        // 同じ分岐の 2 本目なので数えない (design 4b は if 1 つを 1 branch と出す)。
        if (BRANCH_LABELS[nodes[n].label]) branches++;
        continue;
      }
      if (k === 'note' || k === 'title' || k === 'lifeline') continue;
      elements++;
      if (k === 'class') classes++;
      else if (k === 'action') actions++;
      else if (k === 'state' && nodes[n].label) stateNames[nodes[n].label] = 1;
    }
    var states = 0;
    for (var sn in stateNames) if (Object.prototype.hasOwnProperty.call(stateNames, sn)) states++;

    return {
      ok: errors.length === 0,
      errors: errors,
      nodes: nodes,
      counts: {
        elements: elements, relations: relations,
        classes: classes, actions: actions, states: states, branches: branches,
      },
    };
  }

  // 絞り込み。label と detail の部分一致(大小無視)。
  // 親のブロック行はヒットした子があれば残す(入れ子の文脈を失わないため)。
  function filter(nodes, query) {
    var list = nodes || [];
    var q = String(query == null ? '' : query).trim().toLowerCase();
    if (q === '') return list.slice();
    var keep = [];
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      var hay = (String(n.label || '') + ' ' + String(n.detail || '')).toLowerCase();
      if (hay.indexOf(q) >= 0) keep.push(i);
    }
    var mark = {};
    for (var k = 0; k < keep.length; k++) {
      var idx = keep[k];
      mark[idx] = true;
      // 直前にある、より浅いブロック行を親として残す
      var want = list[idx].depth;
      for (var j = idx - 1; j >= 0 && want > 0; j--) {
        if (list[j].kind === 'block' && list[j].depth < want) { mark[j] = true; want = list[j].depth; }
      }
    }
    var out = [];
    for (var p = 0; p < list.length; p++) if (mark[p]) out.push(list[p]);
    return out;
  }

  // 画面下部の一行で何を数えたのかは図種で変わる (design 4a/4b/4c)。
  //   Class    → 3 classes · 2 relations
  //   Activity → 3 actions · 1 branch
  //   State    → 2 states · 4 transitions
  //   その他   → 3 elements · 4 relations (1a の Sequence)
  // 名前を変えるだけで、数える規則そのものは build が 1 本で持っている。
  var COUNT_TERMS = {
    'plantuml-class':    [['classes', 'class', 'classes'], ['relations', 'relation', 'relations']],
    'plantuml-activity': [['actions', 'action', 'actions'], ['branches', 'branch', 'branches']],
    'plantuml-state':    [['states', 'state', 'states'], ['relations', 'transition', 'transitions']],
  };
  var DEFAULT_TERMS = [['elements', 'element', 'elements'], ['relations', 'relation', 'relations']];

  function _term(spec, n) {
    // [countsKey, 単数形, 複数形]。複数形を省いたら単数形をそのまま使う。
    var one = spec[1];
    var many = spec.length > 2 ? spec[2] : spec[1];
    return n + ' ' + (n === 1 ? one : many);
  }

  function countLabel(counts, diagramType) {
    var c = counts || {};
    var terms = COUNT_TERMS[String(diagramType)] || DEFAULT_TERMS;
    return terms.map(function(spec) { return _term(spec, c[spec[0]] || 0); }).join(' · ');
  }

  function summary(result, diagramType) {
    if (!result) return '';
    var head = result.ok ? 'パース OK' : ('パース NG · ' + result.errors.length + ' 件');
    return head + ' · ' + countLabel(result.counts, diagramType);
  }

  // 図種ごとに「何を数えるか」の並び。数合わせ (count-compare) が同じ語彙で
  // 差を出せるように、名前の表を 1 か所から配る。
  function countTerms(diagramType) {
    return (COUNT_TERMS[String(diagramType)] || DEFAULT_TERMS).map(function(spec) {
      return { key: spec[0], one: spec[1], many: spec.length > 2 ? spec[2] : spec[1] };
    });
  }

  return {
    build: build,
    filter: filter,
    countTerms: countTerms,
    countLabel: countLabel,
    summary: summary,
  };
})();
