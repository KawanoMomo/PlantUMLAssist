'use strict';

// finding-origins — 指摘 1 件を 1 行にして、「何を比較して出たか」(出典) ごとに畳む。
//
// BLK-reviewer-20260915-2240-wish: status-dashboard は「図 1 枚 = 1 行」に畳んだ。
// 残っているのは逆の軸で、reviewer は手順 2・7・8 で
// `audit.js --board` / `findings.js` / `pins.js --all` / `POST /verify-svg` の
// 出力を並べ、「この行とあの行は同じ指摘の別表現か、本当に別物か」を頭の中で
// 突き合わせている。今回も F-01 が別の図に再掲されただけなのを【新規】と
// 誤読しかけた。
//
// ここは各出口の結果を受け取り、**指摘 ID** を鍵に 1 行へ畳む。1 行は
//   - その指摘がどの出口の、どの根拠から来たか (origins)
//   - 同じ指摘が何枚の図に出ているか (再掲か、本当に別件か)
//   - 出口同士が食い違っている点 (conflicts)
// を持つ。判定は一切やり直さない (どの判定がどのモジュールの職掌かを動かさない)。
//
// DOM にもサーバにもファイルにも触らない。node からも require できる。
(function() {

  // 出口の呼び名。表・markdown・JSON で同じ語を使う。
  var TOOLS = [
    { key: 'audit',  label: 'audit --board', note: '図同士の突合' },
    { key: 'pins',   label: 'pins',          note: '📌 の控え' },
    { key: 'svg',    label: 'verify-svg',    note: '出力物の中身' },
    { key: 'names',  label: '登録簿',         note: '表記の要決定' },
  ];

  var TOOL_LABEL = {};
  TOOLS.forEach(function(t) { TOOL_LABEL[t.key] = t.label; });

  function _s(v) { return v == null ? '' : String(v); }
  function _list(v) { return Array.isArray(v) ? v : []; }

  // 図名の突き合わせ鍵。status-dashboard と同じ規則 (出口ごとに
  // `dir/x.puml` / `x.puml` / `x` と形が違う)。
  function docKey(name) {
    var s = _s(name).replace(/\\/g, '/');
    var i = s.lastIndexOf('/');
    if (i >= 0) s = s.slice(i + 1);
    return s.replace(/\.(puml|svg)$/i, '');
  }

  // 📌 の本文に書かれた指摘 ID (`F-01継続3tick目` のように地の文に混ざる)。
  var ID_RE = /F-\d+/g;
  function idsInText(text) {
    var m = _s(text).match(ID_RE);
    return m ? m.slice() : [];
  }

  function _open(r) {
    if (r && typeof r.open === 'boolean') return r.open;
    return !(r && r.keep);
  }

  function _docsOf(r) {
    var docs = _list(r && r.docs);
    if (docs.length) return docs;
    return _s(r && r.doc) ? [r.doc] : [];
  }

  // 指摘の分類 (`cats`) は audit のどの比較から出たかそのもの。ここを出典の
  // 「根拠」に使う (呼び名を作り直さない)。
  function _cats(r) {
    var cats = _list(r && r.cats).map(_s).filter(Boolean);
    if (cats.length) return cats;
    var one = _s(r && (r.category || r.kind));
    return one ? [one] : [];
  }

  function _isSvgCat(cats) {
    return cats.join(' ').toLowerCase().indexOf('svg') >= 0
        || cats.join(' ').indexOf('出力物') >= 0;
  }

  // ---- 組み立て ------------------------------------------------------------

  // input: { findings, pins, svg, registry, pinOpenStatuses }
  //   findings — finding-tracker.rows()
  //   pins     — pin-report.build().entries
  //   svg      — svg-freshness.scan() (rows / staleReasons)
  //   registry — { pending: [...] } (name-registry.pending)
  function build(input) {
    var inp = input || {};
    var openPin = inp.pinOpenStatuses || { untouched: true, started: true };
    var svgByDoc = _svgByDoc(inp.svg);
    var pendingNames = _pendingNames(inp.registry);

    var rows = _list(inp.findings).map(function(r) {
      var cats = _cats(r);
      var docs = _docsOf(r);
      return {
        id: _s(r.id),
        title: _s(r.title),
        entity: _s(r.entity),
        state: _s(r.state),
        label: _s(r.label),
        open: _open(r),
        streak: Number(r.streak || 0),
        docs: docs.slice(),
        cats: cats,
        origins: [],
        pins: [],
        conflicts: [],
        restated: docs.length > 1,
      };
    });

    var byId = {};
    rows.forEach(function(row) { if (row.id) byId[row.id] = row; });

    rows.forEach(function(row) {
      // 出典 1: audit の突合。分類がそのまま「何を比較して出たか」。
      if (row.cats.length) {
        row.origins.push({ tool: 'audit', label: TOOL_LABEL.audit, basis: row.cats.join(' / ') });
      }

      // 出典 2: verify-svg。出力物を見る分類の指摘だけ、図ごとの判定を添える。
      if (_isSvgCat(row.cats)) {
        var verdicts = row.docs.map(function(d) {
          var v = svgByDoc[docKey(d)];
          return v ? (docKey(d) + ': ' + v.text) : (docKey(d) + ': 未取得');
        });
        row.origins.push({ tool: 'svg', label: TOOL_LABEL.svg, basis: verdicts.join(' / ') });
        // 食い違い: 指摘は「ずれ」と言うが、中身は体裁差だけ (作り直し不要)。
        row.docs.forEach(function(d) {
          var v = svgByDoc[docKey(d)];
          if (v && v.content === 'format') {
            row.conflicts.push('指摘は「SVG ずれ」だが ' + docKey(d) + ' の中身は一致 (体裁差のみ)');
          }
        });
      }

      // 出典 3: 登録簿。表記の要決定に同じ名前が挙がっているか。
      var nameHit = _nameHit(pendingNames, row);
      if (nameHit.length) {
        row.origins.push({ tool: 'names', label: TOOL_LABEL.names, basis: nameHit.join(' / ') });
      }
    });

    // 出典 4: 📌。本文に書かれた指摘 ID で結ぶ (reviewer が自分で書いた紐づけ)。
    // 画面側の指摘には ID が無いので、そのときは図で結ぶ (matchPinsByDoc)。
    _list(inp.pins).forEach(function(e) {
      var doc = _s(e && (e.doc || (e.item && e.item.doc)));
      var hits = idsInText(e && e.text).filter(function(id) { return byId[id]; });
      if (!hits.length && inp.matchPinsByDoc) {
        hits = rows.filter(function(r) {
          return r.docs.some(function(d) { return docKey(d) === docKey(doc); });
        }).map(function(r) { return r.id; });
      }
      hits.forEach(function(id) {
        var row = byId[id];
        if (!row) return;
        var status = _s(e.status);
        row.pins.push({ doc: docKey(doc), line: e.line, status: status, label: _s(e.label) });
        var o = _findOrigin(row, 'pins');
        var piece = docKey(doc) + (e.line ? (' L' + e.line) : '') + ' ' + (_s(e.label) || status);
        if (o) o.basis += ' / ' + piece;
        else row.origins.push({ tool: 'pins', label: TOOL_LABEL.pins, basis: piece });
        // 食い違い: 指摘は片付いたのに 📌 は開いたまま (またはその逆)。
        if (!row.open && openPin[status]) {
          row.conflicts.push('指摘は解消済みだが 📌 ' + docKey(doc) + ' は ' + (_s(e.label) || status));
        }
      });
    });

    // 再掲の言い方。1 件の指摘が複数の図に出ているときは「新規」ではない。
    rows.forEach(function(row) {
      if (row.restated) {
        row.note = '同じ指摘が ' + row.docs.length + ' 枚に出ています (別図の再掲。新しい指摘ではありません)';
      } else {
        row.note = '';
      }
      row.originKey = row.origins.map(function(o) { return o.tool; }).sort().join('+') || '(出典なし)';
    });

    var groups = _group(rows);
    return {
      rows: rows,
      groups: groups,
      totals: {
        findings: rows.length,
        open: rows.filter(function(r) { return r.open; }).length,
        restated: rows.filter(function(r) { return r.restated; }).length,
        conflicts: rows.reduce(function(n, r) { return n + r.conflicts.length; }, 0),
        pinned: rows.filter(function(r) { return r.pins.length; }).length,
        groups: groups.length,
      },
    };
  }

  function _findOrigin(row, tool) {
    for (var i = 0; i < row.origins.length; i++) if (row.origins[i].tool === tool) return row.origins[i];
    return null;
  }

  function _svgByDoc(scan) {
    var out = {};
    var reasons = (scan && scan.staleReasons) || {};
    var TEXT = { match: '一致', format: '体裁差のみ', differ: '内容ずれ',
                 missing: 'SVG 無', unverified: '未刻印' };
    _list(scan && scan.rows).forEach(function(r) {
      var key = docKey(r && r.name);
      if (!key) return;
      var content = _content(r, reasons[_s(r.name)] || reasons[key]);
      out[key] = { content: content, text: TEXT[content] || content };
    });
    return out;
  }

  // svg-freshness の行を「中身でどうだったか」1 語にする。畳まれた DSL での
  // 判定 (staleReasons) があればそれを優先する (印だけの突合は体裁差でも出る)。
  function _content(r, reason) {
    if (reason === 'same') return 'format';
    if (reason === 'differ') return 'differ';
    var st = _s(r && r.status);
    if (st === 'missing') return 'missing';
    if (st === 'fresh') return 'match';
    if (st === 'stale') return 'differ';
    return 'unverified';
  }

  function _pendingNames(registry) {
    var out = [];
    _list(registry && registry.pending).forEach(function(p) {
      if (typeof p === 'string') { out.push(p); return; }
      var names = _list(p && p.names).map(_s);
      if (names.length) out.push(names.join(' ⇔ '));
      else if (_s(p && p.name)) out.push(_s(p.name));
    });
    return out;
  }

  // 指摘の見出し・対象に、要決定の表記が含まれているか。
  function _nameHit(pendingNames, row) {
    var hay = (row.title + ' ' + row.entity).toLowerCase();
    return pendingNames.filter(function(p) {
      return p.split(/\s*⇔\s*/).some(function(n) {
        var t = _s(n).trim().toLowerCase();
        return t && hay.indexOf(t) >= 0;
      });
    });
  }

  // 出典の組み合わせが同じ指摘をまとめる (これが「畳んで見せる」の畳み目)。
  function _group(rows) {
    var map = {};
    var order = [];
    rows.forEach(function(r) {
      if (!map[r.originKey]) { map[r.originKey] = { key: r.originKey, rows: [] }; order.push(r.originKey); }
      map[r.originKey].rows.push(r);
    });
    return order.map(function(k) {
      var g = map[k];
      g.label = k.split('+').map(function(t) { return TOOL_LABEL[t] || t; }).join(' + ');
      g.open = g.rows.filter(function(r) { return r.open; }).length;
      return g;
    }).sort(function(a, b) { return b.rows.length - a.rows.length; });
  }

  // ---- 見せ方 --------------------------------------------------------------

  function _width(s) {
    var n = 0;
    for (var i = 0; i < _s(s).length; i++) n += _s(s).charCodeAt(i) > 0x2000 ? 2 : 1;
    return n;
  }
  function _pad(s, w) {
    var out = _s(s);
    while (_width(out) < w) out += ' ';
    return out;
  }

  function summaryLine(board) {
    var t = board.totals;
    return '指摘 ' + t.findings + ' 件 (未解消 ' + t.open + ') / 出典の組み合わせ ' + t.groups
      + ' 通り / 別図の再掲 ' + t.restated + ' / 食い違い ' + t.conflicts;
  }

  function text(board, title) {
    var out = [];
    if (title) out.push(title);
    out.push(summaryLine(board));
    board.groups.forEach(function(g) {
      out.push('');
      out.push('── 出典: ' + g.label + ' — ' + g.rows.length + ' 件 (未解消 ' + g.open + ')');
      var idW = 0, titleW = 0;
      g.rows.forEach(function(r) {
        idW = Math.max(idW, _width(r.id));
        titleW = Math.max(titleW, _width(r.title));
      });
      g.rows.forEach(function(r) {
        out.push('  ' + _pad(r.id, idW) + '  ' + _pad(r.title, titleW)
          + '  ' + _pad(r.label || (r.open ? '未解消' : '解消'), 6)
          + '  ' + r.docs.map(docKey).join(', '));
        r.origins.forEach(function(o) {
          out.push('      ' + _pad(o.label, 14) + ' ' + o.basis);
        });
        if (r.note) out.push('      ⤷ ' + r.note);
        r.conflicts.forEach(function(c) { out.push('      ⚠ ' + c); });
      });
    });
    return out.join('\n');
  }

  function markdown(board, title) {
    var out = [];
    if (title) out.push('# ' + title, '');
    out.push(summaryLine(board), '');
    out.push('| 指摘 | 見出し | 状態 | 図 | 出典 (何を比較して出たか) | 気づき |');
    out.push('| --- | --- | --- | --- | --- | --- |');
    board.rows.forEach(function(r) {
      var origins = r.origins.map(function(o) { return o.label + ': ' + o.basis; }).join('<br>') || '—';
      var notes = [].concat(r.note ? [r.note] : [], r.conflicts).join('<br>') || '—';
      out.push('| ' + [r.id, r.title, (r.label || (r.open ? '未解消' : '解消')),
        r.docs.map(docKey).join('<br>'), origins, notes].join(' | ') + ' |');
    });
    return out.join('\n');
  }

  var api = {
    TOOLS: TOOLS,
    docKey: docKey,
    idsInText: idsInText,
    build: build,
    text: text,
    markdown: markdown,
    summaryLine: summaryLine,
  };

  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.findingOrigins = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
