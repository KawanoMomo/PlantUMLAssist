'use strict';
window.MA = window.MA || {};

// impact-scan — 部品名を変える前に「どの図の、どの種類の線が影響するか」を出す。
//
// 一括置換は今まで「図ごとのヒット数」しか出さないので、置換してよいかを
// 判断するには置換後に各タブを開いて見比べるしかなかった。同じ綴りでも
// class 図の継承・sequence 図の participant・state 図の遷移では、直したときに
// 壊れる範囲が違う。名前を打った時点で内訳が読めれば、置換の前に影響範囲が
// 決められる。
//
// 数え方は bulkRename と同じ識別子単位 (前後が [A-Za-z0-9_] でない出現) なので、
// 内訳の合計は一括置換パネルのヒット数と必ず一致する。
window.MA.impactScan = (function() {
  var WORD = /[A-Za-z0-9_]/;

  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 1 行中の識別子単位の出現数。bulkRename.countIn と同じ規則。
  function countIn(line, needle) {
    var text = String(line == null ? '' : line);
    var from = String(needle == null ? '' : needle);
    if (!from) return 0;
    var re = new RegExp(escapeRe(from), 'g');
    var n = 0;
    var m;
    while ((m = re.exec(text)) !== null) {
      var s = m.index;
      var e = s + m[0].length;
      var beforeOk = s === 0 || !WORD.test(text.charAt(s - 1));
      var afterOk = e >= text.length || !WORD.test(text.charAt(e));
      if (beforeOk && afterOk) n++;
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    return n;
  }

  // 図種。同じ `-->` でも state 図なら遷移、class 図なら関連なので先に決める。
  function detectKind(dsl) {
    var text = String(dsl == null ? '' : dsl);
    if (/^\s*(?:abstract\s+class|class|interface|enum)\b/m.test(text)) return 'class';
    if (/^\s*state\b/m.test(text) || /\[\*\]/.test(text)) return 'state';
    if (/^\s*(?:participant|actor|boundary|control|entity|database|collections|queue)\b/m.test(text)) return 'sequence';
    if (/^\s*(?:component|node|rectangle|folder)\b/m.test(text)) return 'component';
    if (/^\s*(?:usecase)\b/m.test(text)) return 'usecase';
    if (/^\s*(?::.*;|start\b|stop\b)/m.test(text)) return 'activity';
    return 'other';
  }

  var KIND_LABEL = {
    class: 'クラス図',
    state: '状態遷移図',
    sequence: 'シーケンス図',
    component: 'コンポーネント図',
    usecase: 'ユースケース図',
    activity: 'アクティビティ図',
    other: 'その他',
  };

  // 宣言行。役割名は図種ではなくキーワードで決まる (participant / class / state …)。
  var DECLS = [
    { re: /^\s*(?:participant|actor|boundary|control|entity|database|collections|queue)\s+"?([A-Za-z0-9_][A-Za-z0-9_.-]*)"?/, role: 'participant' },
    { re: /^\s*(?:abstract\s+class|class|interface|enum)\s+"?([A-Za-z0-9_][A-Za-z0-9_.-]*)"?/, role: 'class' },
    { re: /^\s*state\s+"?([A-Za-z0-9_][A-Za-z0-9_.-]*)"?/, role: 'state' },
    { re: /^\s*(?:component|node|package|folder|rectangle)\s+"?([A-Za-z0-9_][A-Za-z0-9_.-]*)"?/, role: 'component' },
    { re: /^\s*usecase\s+"?([A-Za-z0-9_][A-Za-z0-9_.-]*)"?/, role: 'usecase' },
  ];

  var ROLE_LABEL = {
    participant: 'participant',
    class: 'class 宣言',
    state: 'state 宣言',
    component: 'component 宣言',
    usecase: 'usecase 宣言',
    inherit: '継承',
    compose: '集約/合成',
    depend: '依存',
    relate: '関連',
    transition: '遷移',
    message: '呼び出し',
    note: 'ノート',
    other: 'その他',
  };

  // 役割ごとの数え方の単位。「継承 1 本」「participant 1 個」のように出す。
  var ROLE_UNIT = {
    participant: '個', class: '個', state: '個', component: '個', usecase: '個',
    inherit: '本', compose: '本', depend: '本', relate: '本', transition: '本', message: '本',
    note: '件', other: '件',
  };

  var ROLE_ORDER = ['class', 'participant', 'state', 'component', 'usecase',
    'inherit', 'compose', 'depend', 'relate', 'transition', 'message', 'note', 'other'];

  // 矢印を含む行かどうかと、その矢印の記号。両端に識別子がある行だけを線とみなす。
  var ARROW_RE = /(?:"[^"]*"|\[\*\]|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*(<\|--|--\|>|\*--|--\*|o--|--o|<\.\.|\.\.>|<--|-->|<-|->|\.\.|--)\s*(?:"[^"]*"|\[\*\]|[A-Za-z0-9_][A-Za-z0-9_.-]*)/;

  // 矢印記号 + 図種 → 役割。仕様変更で怖いのは「どの意味の線が切れるか」なので、
  // 記号だけでなく図種も見て呼び分ける。
  function arrowRole(arrow, kind) {
    if (arrow === '<|--' || arrow === '--|>') return 'inherit';
    if (arrow === '*--' || arrow === '--*' || arrow === 'o--' || arrow === '--o') return 'compose';
    if (arrow === '<..' || arrow === '..>' || arrow === '..') return 'depend';
    if (kind === 'state') return 'transition';
    if (kind === 'sequence') return 'message';
    if (kind === 'class') return 'relate';
    return 'relate';
  }

  // 1 行の役割。宣言 → 矢印 → ノート → その他 の順に見る。
  function classifyLine(line, kind) {
    var text = String(line == null ? '' : line);
    for (var i = 0; i < DECLS.length; i++) {
      if (DECLS[i].re.test(text)) return DECLS[i].role;
    }
    if (/^\s*(?:note|legend)\b/.test(text)) return 'note';
    var a = text.match(ARROW_RE);
    if (a) return arrowRole(a[1], kind);
    return 'other';
  }

  // 1 本の DSL の内訳。
  // { kind, kindLabel, total, roles: [{ role, label, unit, count }], lines: [...] }
  // lines は出現した行そのもの。内訳だけでは「この図のどの記述が対象か」が
  // 分からず、結局タブを開いて探すことになるので、行番号と本文まで持たせる
  // (画面はこの行番号でエディタへ飛ぶ)。
  function scanDoc(dsl, name) {
    var text = String(dsl == null ? '' : dsl);
    var kind = detectKind(text);
    var counts = {};
    var total = 0;
    var lines = [];
    text.split('\n').forEach(function(line, i) {
      var n = countIn(line, name);
      if (n === 0) return;
      var role = classifyLine(line, kind);
      counts[role] = (counts[role] || 0) + n;
      total += n;
      lines.push({
        line: i + 1,
        text: String(line),
        role: role,
        label: ROLE_LABEL[role],
        count: n,
      });
    });
    var roles = ROLE_ORDER.filter(function(r) { return counts[r]; }).map(function(r) {
      return { role: r, label: ROLE_LABEL[r], unit: ROLE_UNIT[r], count: counts[r] };
    });
    return { kind: kind, kindLabel: KIND_LABEL[kind], total: total, roles: roles, lines: lines };
  }

  // 「継承 1 本・関連 1 本」のような 1 行の要約。出現が無ければ空文字。
  function summarize(scan) {
    if (!scan || !scan.roles || scan.roles.length === 0) return '';
    return scan.roles.map(function(r) { return r.label + ' ' + r.count + ' ' + r.unit; }).join('・');
  }

  // docs: [{ id, name, dsl }] → 出現のある図だけの内訳。多い順・同数なら元の並び順。
  function scan(docs, name) {
    if (!Array.isArray(docs) || !name) return [];
    var rows = [];
    docs.forEach(function(d, i) {
      if (!d) return;
      var s = scanDoc(d.dsl, name);
      if (s.total === 0) return;
      rows.push({
        id: d.id, name: d.name, order: i,
        kind: s.kind, kindLabel: s.kindLabel,
        total: s.total, roles: s.roles, lines: s.lines, summary: summarize(s),
      });
    });
    rows.sort(function(a, b) { return b.total - a.total || a.order - b.order; });
    return rows;
  }

  // パネル見出し用。「Spi_Driver は 6 図に出現 / 継承 1 本・participant 4 個」。
  function overview(docs, name) {
    var rows = scan(docs, name);
    var counts = {};
    var total = 0;
    rows.forEach(function(r) {
      r.roles.forEach(function(x) { counts[x.role] = (counts[x.role] || 0) + x.count; });
      total += r.total;
    });
    var roles = ROLE_ORDER.filter(function(r) { return counts[r]; }).map(function(r) {
      return { role: r, label: ROLE_LABEL[r], unit: ROLE_UNIT[r], count: counts[r] };
    });
    return { docs: rows.length, total: total, roles: roles, summary: summarize({ roles: roles }) };
  }

  return {
    countIn: countIn,
    detectKind: detectKind,
    classifyLine: classifyLine,
    scanDoc: scanDoc,
    summarize: summarize,
    scan: scan,
    overview: overview,
    KIND_LABEL: KIND_LABEL,
    ROLE_LABEL: ROLE_LABEL,
  };
})();
