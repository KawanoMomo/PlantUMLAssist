'use strict';
window.MA = window.MA || {};

// pattern-check — レビュー指摘 1 件を「観点」として開いている図全部に当て、
// 欠けている図だけを出す。
//
// BLK-junior-20260908-0003-wish: 「GpioDrv にコンストラクタが無い」を 1 枚直した
// あと、同じ観点が UART / CAN の対応する図にも当てはまるかは、図を 1 枚ずつ開いて
// 目で確かめるしかなかった。指摘は 1 件でも対象は題材の数だけあるので、手順が
// 図の枚数に比例して増える。ここは観点を先に選び、当たる図種の図を横断で見て
// 「欠けている図」だけを残す。開く前に対象が決まるので、手順は欠けた枚数に比例する。
//
// 観点は「その図種の図なら普通あるはずの形」を機械的に見るものだけを持つ。
// 意味の正しさ (この遷移は妥当か) は見ない — それは reviewer の職掌で、
// ここで曖昧に判定すると「出たけれど直す必要がない」行が増えて棚卸しにならない。
// DOM には触らない。表示と結線は app.js。
window.MA.patternCheck = (function() {
  function _lines(dsl) {
    return String(dsl == null ? '' : dsl).split(/\r?\n/);
  }

  function _isSkip(line) {
    return /^\s*'/.test(line) || /^\s*@/.test(line);
  }

  // ── 観点 1: クラス図のコンストラクタ ──────────────────────────────
  // class.js と同じ定義: クラス名と同じ名前のメソッド。
  function _classCtor(dsl) {
    var MAu = window.MA.methodAudit;
    if (!MAu) return { applicable: false, ok: true, missing: [] };
    var parsed = MAu.parseClassDoc(dsl);
    if (!parsed.classes.length) return { applicable: false, ok: true, missing: [] };
    var has = {};
    parsed.methods.forEach(function(m) {
      if (String(m.method) === String(m.cls)) has[m.cls] = true;
    });
    var missing = parsed.classes.filter(function(c) { return !has[c]; })
      .map(function(c) { return { text: c, line: _declLine(dsl, c) }; });
    return { applicable: true, ok: missing.length === 0, missing: missing };
  }

  // 名前が最初に宣言された行。画面から「その行へ飛ぶ」ために持つ。
  function _declLine(dsl, name) {
    var lines = _lines(dsl);
    for (var i = 0; i < lines.length; i++) {
      if (_isSkip(lines[i])) continue;
      if (new RegExp('(^|[\\s"{])' + name.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '($|[\\s"{:])').test(lines[i])) {
        return i + 1;
      }
    }
    return 1;
  }

  // ── 観点 2: 状態遷移図の復帰遷移 ─────────────────────────────────
  // エラー系の状態 (Error / Fault / Fail / Abort / 異常) から、別の状態へ
  // 戻る遷移があるか。終端 [*] への遷移は「復帰」ではないので数えない。
  var ERROR_NAME_RE = /(error|fault|fail|abort|invalid|timeout|異常|失敗|停止)/i;
  var STATE_ARROW_RE = /^\s*(?:\[\*\]|"[^"]*"|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*(?:-+\[[^\]]*\]-*>|-+>|<-+)\s*(?:\[\*\]|"[^"]*"|[A-Za-z0-9_][A-Za-z0-9_.-]*)/;

  function _stateTransitions(dsl) {
    var out = [];
    _lines(dsl).forEach(function(line, i) {
      if (_isSkip(line) || !STATE_ARROW_RE.test(line)) return;
      var head = line.split(':')[0];
      var m = head.match(/^\s*(\[\*\]|"[^"]*"|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*(-+\[[^\]]*\]-*>|-+>|<-+)\s*(\[\*\]|"[^"]*"|[A-Za-z0-9_][A-Za-z0-9_.-]*)/);
      if (!m) return;
      var from = m[1].replace(/^"|"$/g, '');
      var to = m[3].replace(/^"|"$/g, '');
      if (/^<-/.test(m[2])) { var t = from; from = to; to = t; }
      out.push({ from: from, to: to, line: i + 1 });
    });
    return out;
  }

  function _stateReturn(dsl) {
    var trans = _stateTransitions(dsl);
    if (!trans.length) return { applicable: false, ok: true, missing: [] };
    var errStates = [];
    var seen = {};
    trans.forEach(function(t) {
      [t.from, t.to].forEach(function(n) {
        if (n === '[*]' || seen[n] || !ERROR_NAME_RE.test(n)) return;
        seen[n] = true;
        errStates.push(n);
      });
    });
    if (!errStates.length) return { applicable: false, ok: true, missing: [] };
    var missing = errStates.filter(function(n) {
      return !trans.some(function(t) { return t.from === n && t.to !== '[*]' && t.to !== n; });
    }).map(function(n) { return { text: n, line: _declLine(dsl, n) }; });
    return { applicable: true, ok: missing.length === 0, missing: missing };
  }

  // ── 観点 3: シーケンス図のエラー応答 ────────────────────────────────
  // エラー系の呼び出し (メッセージ名にエラー語を含む実線) に対して、
  // その相手から戻る破線 (`-->` / `<--`) があるか。
  var SEQ_ARROW_RE = /^\s*("[^"]*"|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*(-->>?|<<?--|->>?|<<?-)\s*("[^"]*"|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*(?::\s*(.*))?$/;

  function _seqMessages(dsl) {
    var out = [];
    _lines(dsl).forEach(function(line, i) {
      if (_isSkip(line)) return;
      var m = line.match(SEQ_ARROW_RE);
      if (!m) return;
      var from = m[1].replace(/^"|"$/g, '');
      var to = m[3].replace(/^"|"$/g, '');
      var arrow = m[2];
      if (/^<</.test(arrow) || /^<-/.test(arrow)) { var t = from; from = to; to = t; }
      out.push({
        from: from, to: to, dashed: arrow.indexOf('--') >= 0,
        label: (m[4] || '').trim(), line: i + 1,
      });
    });
    return out;
  }

  function _seqErrorReply(dsl) {
    var msgs = _seqMessages(dsl);
    if (!msgs.length) return { applicable: false, ok: true, missing: [] };
    var calls = msgs.filter(function(m) {
      return !m.dashed && ERROR_NAME_RE.test(m.label || '');
    });
    if (!calls.length) return { applicable: false, ok: true, missing: [] };
    var missing = calls.filter(function(c) {
      return !msgs.some(function(m) {
        return m.dashed && m.line > c.line && m.from === c.to && m.to === c.from;
      });
    }).map(function(c) {
      return { text: c.label + ' (' + c.from + ' → ' + c.to + ')', line: c.line };
    });
    return { applicable: true, ok: missing.length === 0, missing: missing };
  }

  // 観点の定義。kind は「その図種の図だけを対象にする」ためのもので、
  // check の applicable は「その図に見るべきものが実際にあったか」を返す。
  // 対象外 (図種違い) と「見たが何も無かった」を混ぜない。
  var PATTERNS = [
    {
      id: 'class-ctor', kind: 'class',
      label: 'クラスにコンストラクタが無い',
      hint: 'クラス名と同じ名前のメソッドを持たないクラスを出します',
      unit: 'クラス', check: _classCtor,
    },
    {
      id: 'state-return', kind: 'state',
      label: 'エラー状態からの復帰遷移が無い',
      hint: 'Error / Fault / 異常 などの状態から、終端以外へ戻る遷移が無いものを出します',
      unit: '状態', check: _stateReturn,
    },
    {
      id: 'seq-error-reply', kind: 'sequence',
      label: 'エラー呼び出しに応答が無い',
      hint: 'エラー系のメッセージに対して、相手からの破線の返信が無いものを出します',
      unit: 'メッセージ', check: _seqErrorReply,
    },
  ];

  function patterns() { return PATTERNS.slice(); }

  function findPattern(id) {
    for (var i = 0; i < PATTERNS.length; i++) if (PATTERNS[i].id === id) return PATTERNS[i];
    return null;
  }

  // 図 1 枚に観点 1 つを当てる。
  // status: 'missing' (欠けている) / 'ok' (満たしている) / 'na' (対象外)
  function checkDoc(doc, patternId) {
    var p = findPattern(patternId);
    var dsl = window.MA.dslUtils ? window.MA.dslUtils.docDsl(doc) : (doc && doc.dsl) || '';
    var is = window.MA.impactScan;
    var kind = is ? is.detectKind(dsl) : 'other';
    var base = {
      id: doc && doc.id, name: doc && doc.name, kind: kind,
      kindLabel: is ? (is.KIND_LABEL[kind] || 'その他') : 'その他',
      missing: [], status: 'na',
    };
    if (!p || !dsl || kind !== p.kind) return base;
    var r = p.check(dsl);
    if (!r.applicable) return base;
    base.missing = r.missing;
    base.status = r.ok ? 'ok' : 'missing';
    return base;
  }

  // 開いている図全部に当てる。
  // { pattern, rows (欠けている図だけ), okCount, naCount, checked }
  function run(docs, patternId) {
    var p = findPattern(patternId);
    var rows = [];
    var okCount = 0;
    var naCount = 0;
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (!d) return;
      var r = checkDoc(d, patternId);
      if (r.status === 'missing') rows.push(r);
      else if (r.status === 'ok') okCount++;
      else naCount++;
    });
    return {
      pattern: p, rows: rows, okCount: okCount, naCount: naCount,
      checked: rows.length + okCount,
    };
  }

  // 見出し 1 行。「棚卸しは終わったのか」がここだけで分かるようにする。
  function summaryText(result) {
    if (!result || !result.pattern) return '観点を選ぶと、欠けている図だけが出ます';
    if (result.checked === 0) {
      return '当たる図がありません (この観点を見られる図が開かれていない)';
    }
    if (result.rows.length === 0) {
      return result.checked + ' 図を見て、欠けている図はありません';
    }
    return result.checked + ' 図中 ' + result.rows.length + ' 図で欠けています'
      + ' / 満たしている ' + result.okCount + ' 図'
      + (result.naCount ? ' / 対象外 ' + result.naCount + ' 図' : '');
  }

  // 指摘文からいちばん近い観点を選ぶ。指摘.md の一文をそのまま貼れるように。
  // 当たらなければ null (勝手に 1 件目を選ばない — 選ばれた観点が違うと
  // 「欠けている図なし」を信じてしまう)。
  var PATTERN_WORDS = {
    'class-ctor': ['コンストラクタ', 'constructor', 'クラス'],
    'state-return': ['復帰', '遷移', '戻', 'state', 'エラー状態'],
    'seq-error-reply': ['応答', '返信', 'シーケンス', 'reply', 'エラー応答'],
  };

  function suggest(text) {
    var s = String(text == null ? '' : text).toLowerCase();
    if (!s.trim()) return null;
    var best = null;
    var bestScore = 0;
    PATTERNS.forEach(function(p) {
      var n = 0;
      (PATTERN_WORDS[p.id] || []).forEach(function(w) {
        if (s.indexOf(String(w).toLowerCase()) >= 0) n++;
      });
      if (n > bestScore) { bestScore = n; best = p; }
    });
    return bestScore > 0 ? best : null;
  }

  return {
    PATTERNS: PATTERNS,
    patterns: patterns,
    findPattern: findPattern,
    checkDoc: checkDoc,
    run: run,
    summaryText: summaryText,
    suggest: suggest,
  };
})();
