'use strict';
window.MA = window.MA || {};

// semantic-refs — 部品名の出現を「行の種類」ではなく「その出現が意味的に何か」で
// 呼び分け、役割ごとに参照元の図を並べる (BLK-primary-20260909-0103-wish)。
//
// 一括置換の影響プレビュー (impactScan) は行を 1 つの役割に決めるので、
// `Idle --> Busy : SpiDrv_Fault` は「遷移 1 本」としか出ない。知りたいのは
// 「この名前が遷移の端点なのか、遷移のイベント名なのか」であり、前者なら状態が
// 消え、後者なら発火条件が変わる。壊れ方が違うのに同じ数字になってしまう。
// クラス図の本体行 `+Spi_Init() : void` に至っては、宣言でも矢印でもないので
// 「その他」に落ちて、メソッド宣言から参照されている事実が読めない。
//
// ここは出現 1 個ずつを見る。行のどの位置に出たか (矢印の左右か、`:` の後の
// ラベルか、括弧の前か) で役割を決め、役割ごとに「どの図の何から参照されて
// いるか」を並べる。数え方の単位は impactScan と同じ識別子境界なので、
// 役割の合計はヒット数と一致する。
window.MA.semanticRefs = (function() {
  var WORD = /[A-Za-z0-9_]/;

  // 矢印記号。impactScan と同じ語彙 (長いものから当てる)。
  var ARROWS = ['<|--', '--|>', '<|..', '..|>', '*--', '--*', 'o--', '--o',
    '<..', '..>', '<--', '-->', '<-', '->', '..', '--'];

  function _escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // 役割。壊れ方が違うものだけを分ける (同じ直し方で済むものは束ねる)。
  var ROLE_LABEL = {
    decl: '宣言',
    method: 'メソッド宣言',
    field: '属性宣言',
    event: '遷移イベント',
    message: 'メッセージ名',
    linkLabel: '線のラベル',
    stateNode: '遷移の端点 (状態)',
    participantRef: '呼び出しの相手',
    inherit: '継承の端点',
    compose: '集約/合成の端点',
    depend: '依存の端点',
    relate: '関連の端点',
    note: 'ノート本文',
    title: '題',
    other: 'その他',
  };

  var ROLE_UNIT = {
    decl: '件', method: '件', field: '件', event: '件', message: '件',
    linkLabel: '件', stateNode: '箇所', participantRef: '箇所',
    inherit: '本', compose: '本', depend: '本', relate: '本',
    note: '件', title: '件', other: '件',
  };

  // 並び順。「これが変わると図の意味が変わる」ものを先に読ませる。
  var ROLE_ORDER = ['decl', 'method', 'field', 'event', 'message', 'linkLabel',
    'stateNode', 'participantRef', 'inherit', 'compose', 'depend', 'relate',
    'note', 'title', 'other'];

  var DECL_HEAD = /^\s*(?:participant|actor|boundary|control|entity|database|collections|queue|abstract\s+class|abstract|class|interface|enum|state|component|node|package|folder|rectangle|cloud|storage|usecase)\b/;

  // 行から矢印を 1 つ見つける。{ arrow, start, end } / 見つからなければ null。
  function findArrow(line) {
    var text = String(line == null ? '' : line);
    var best = null;
    for (var i = 0; i < ARROWS.length; i++) {
      var a = ARROWS[i];
      var idx = text.indexOf(a);
      if (idx < 0) continue;
      // 両端に識別子か [*] か "…" があるものだけを線とみなす。
      var left = text.slice(0, idx);
      var right = text.slice(idx + a.length);
      if (!/(?:"[^"]*"|\[\*\]|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*$/.test(left)) continue;
      if (!/^\s*(?:"[^"]*"|\[\*\]|[A-Za-z0-9_][A-Za-z0-9_.-]*)/.test(right)) continue;
      if (!best || idx < best.start || (idx === best.start && a.length > best.arrow.length)) {
        best = { arrow: a, start: idx, end: idx + a.length };
      }
    }
    return best;
  }

  // 矢印記号 + 図種 → 端点の役割。
  function endpointRole(arrow, kind) {
    if (arrow === '<|--' || arrow === '--|>' || arrow === '<|..' || arrow === '..|>') return 'inherit';
    if (arrow === '*--' || arrow === '--*' || arrow === 'o--' || arrow === '--o') return 'compose';
    if (arrow === '<..' || arrow === '..>' || arrow === '..') return 'depend';
    if (kind === 'state') return 'stateNode';
    if (kind === 'sequence') return 'participantRef';
    return 'relate';
  }

  // 矢印行のラベル (`:` の後) の役割。
  function labelRole(kind) {
    if (kind === 'state') return 'event';
    if (kind === 'sequence') return 'message';
    return 'linkLabel';
  }

  // 出現 1 個の役割。at は行内の開始位置。
  function classifyAt(line, kind, name, at) {
    var text = String(line == null ? '' : line);
    if (/^\s*(?:'|@)/.test(text)) return 'other';
    if (/^\s*title\b/.test(text)) return 'title';
    if (/^\s*(?:note|legend)\b/.test(text)) return 'note';

    var arrow = findArrow(text);
    if (arrow) {
      var colon = text.indexOf(':', arrow.end);
      if (colon >= 0 && at > colon) return labelRole(kind);
      return endpointRole(arrow.arrow, kind);
    }

    if (DECL_HEAD.test(text)) {
      // 宣言行でも、`as` の別名や説明文の中の出現は宣言そのものではない。
      var head = text.match(/^\s*(?:abstract\s+class|[A-Za-z]+)\s+"?([A-Za-z0-9_][A-Za-z0-9_.-]*)"?/);
      if (head && head[1] === name) return 'decl';
      return 'other';
    }

    // クラス/状態の本体行。`+Spi_Init() : void` はメソッド、`+count : int` は属性。
    var after = text.slice(at + name.length);
    if (/^\s*\(/.test(after)) return 'method';
    if (/^\s*(?::|$)/.test(after) && /^\s*[+\-#~]/.test(text)) return 'field';
    return 'other';
  }

  // 行の中の識別子境界の出現位置。impactScan.countIn と同じ規則。
  function positionsIn(line, name) {
    var text = String(line == null ? '' : line);
    var needle = String(name == null ? '' : name);
    var out = [];
    if (!needle) return out;
    var re = new RegExp(_escapeRe(needle), 'g');
    var m;
    while ((m = re.exec(text)) !== null) {
      var s = m.index;
      var e = s + m[0].length;
      var beforeOk = s === 0 || !WORD.test(text.charAt(s - 1));
      var afterOk = e >= text.length || !WORD.test(text.charAt(e));
      if (beforeOk && afterOk) out.push(s);
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    return out;
  }

  function _kindOf(dsl) {
    return window.MA.impactScan ? window.MA.impactScan.detectKind(dsl) : 'other';
  }

  function _kindLabel(kind) {
    var t = window.MA.impactScan ? window.MA.impactScan.KIND_LABEL : null;
    return (t && t[kind]) || 'その他';
  }

  // 1 本の DSL の出現一覧。[{ line, text, role, label }]
  function scanDoc(dsl, name) {
    var text = String(dsl == null ? '' : dsl);
    var kind = _kindOf(text);
    var refs = [];
    text.split('\n').forEach(function(line, i) {
      positionsIn(line, name).forEach(function(at) {
        var role = classifyAt(line, kind, name, at);
        refs.push({
          line: i + 1, text: String(line), at: at,
          role: role, label: ROLE_LABEL[role], unit: ROLE_UNIT[role],
        });
      });
    });
    return { kind: kind, kindLabel: _kindLabel(kind), refs: refs };
  }

  // docs: [{ id, name, dsl }] → 役割ごとの参照一覧。
  // { name, total, docs, roles: [{ role, label, unit, count, docs, refs }], sentence }
  function collect(docs, name) {
    var list = Array.isArray(docs) ? docs : [];
    var needle = String(name == null ? '' : name);
    var byRole = {};
    var total = 0;
    var docNames = {};
    if (!needle) return { name: '', total: 0, docs: 0, roles: [], sentence: '' };

    list.forEach(function(d, i) {
      if (!d) return;
      var dsl = window.MA.dslUtils && window.MA.dslUtils.docDsl ? window.MA.dslUtils.docDsl(d) : d.dsl;
      var s = scanDoc(dsl, needle);
      if (s.refs.length === 0) return;
      docNames[d.name] = true;
      s.refs.forEach(function(r) {
        var g = byRole[r.role] || (byRole[r.role] = { role: r.role, label: r.label, unit: r.unit, count: 0, docs: [], refs: [] });
        g.count++;
        total++;
        g.refs.push({
          docId: d.id, docName: d.name, order: i,
          kind: s.kind, kindLabel: s.kindLabel,
          line: r.line, text: r.text, label: r.label,
        });
        if (g.docs.indexOf(d.name) < 0) g.docs.push(d.name);
      });
    });

    var roles = ROLE_ORDER.filter(function(r) { return byRole[r]; }).map(function(r) {
      var g = byRole[r];
      g.refs.sort(function(a, b) { return a.order - b.order || a.line - b.line; });
      return g;
    });
    return {
      name: needle,
      total: total,
      docs: Object.keys(docNames).length,
      roles: roles,
      sentence: sentence(needle, roles),
    };
  }

  // 「SpiDrv は spi_state の遷移イベント / driver_common_class のメソッド宣言
  //   から参照されている」。役割の無い名前には黙らず「参照なし」と言う。
  function sentence(name, roles) {
    if (!roles || roles.length === 0) return name + ' を参照している図はありません';
    var parts = roles.map(function(g) {
      return g.docs.join('・') + ' の' + g.label;
    });
    return name + ' は ' + parts.join(' / ') + ' から参照されています';
  }

  // 置換後に開いて確かめるべき図。役割が意味を持つもの (端点・イベント・
  // メソッド宣言) を含む図だけを、役割の重い順に並べる。
  function docsToCheck(result) {
    var roles = (result && result.roles) || [];
    var seen = {};
    var out = [];
    roles.forEach(function(g) {
      if (g.role === 'note' || g.role === 'title' || g.role === 'other') return;
      g.refs.forEach(function(r) {
        if (seen[r.docName]) return;
        seen[r.docName] = true;
        out.push({ docId: r.docId, docName: r.docName, kindLabel: r.kindLabel, label: g.label, line: r.line });
      });
    });
    return out;
  }

  return {
    ROLE_LABEL: ROLE_LABEL,
    ROLE_UNIT: ROLE_UNIT,
    ROLE_ORDER: ROLE_ORDER,
    findArrow: findArrow,
    positionsIn: positionsIn,
    classifyAt: classifyAt,
    scanDoc: scanDoc,
    collect: collect,
    sentence: sentence,
    docsToCheck: docsToCheck,
  };
})();
