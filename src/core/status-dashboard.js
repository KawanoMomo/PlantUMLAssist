'use strict';

// status-dashboard — 図 1 枚を 1 行にして、整合状態を 1 枚の表に横に並べる。
//
// BLK-reviewer-20260915-0606-wish: 突合の結果は既に各所にある
// (findings.js の継続追跡 / pins.js の着手状況 / svg-freshness の内容判定 /
//  name-registry の要決定 / audit-scope.diffFiles の前回控えとの差分)。
// ただし出口が 6 本の別コマンドに分かれているので、reviewer は毎 tick それぞれを
// 叩いて結果を頭の中で突き合わせ、指摘.md にまとめていた。CLI 同士が食い違う場合
// (`--board` が「SVG 内容ずれ」と言い、`/verify-svg` は体裁差だけと言う) も、
// 別々の出力を目で見比べて初めて気づける。
//
// ここは各出口の結果を受け取り、図名を鍵に 1 行へ畳む。判定は一切やり直さない
// (どの判定がどのモジュールの職掌かを動かさない)。食い違いは消さずに、同じ行の
// 「気づき」列に両方の言い分を残す。
//
// DOM にもサーバにもファイルにも触らない。node からも require できる。
(function() {

  // 列の並び。表と markdown で同じ順・同じ呼び名を使う。
  var COLUMNS = [
    { key: 'doc', label: '図' },
    { key: 'findings', label: '指摘(未解消)' },
    { key: 'pins', label: '📌' },
    { key: 'svg', label: 'SVG' },
    { key: 'registry', label: '表記(要決定)' },
    { key: 'diff', label: '前回控え' },
    { key: 'note', label: '気づき' },
  ];

  // svg-freshness の content をそのまま列の言葉にする (呼び名を増やさない)。
  var SVG_TEXT = {
    match: '一致',
    format: '体裁差のみ',
    differ: '内容ずれ',
    missing: 'SVG 無',
    unverified: '未刻印',
  };

  // 前回控えとの差分。diffFiles の区分をそのまま 1 語にする。
  var DIFF_TEXT = {
    changed: '変わった',
    added: '新規',
    renamed: '改名',
    removed: '消えた',
    same: '—',
    unknown: '?',
  };

  function _s(v) { return v == null ? '' : String(v); }
  function _list(v) { return Array.isArray(v) ? v : []; }

  // 図名の突き合わせ鍵。出口ごとに `dir/x.puml` / `x.puml` / `x` と形が違うので、
  // 末尾の名前から拡張子を落とした形に揃える (揃えないと同じ図が 2 行に割れる)。
  function docKey(name) {
    var s = _s(name).replace(/\\/g, '/');
    var i = s.lastIndexOf('/');
    if (i >= 0) s = s.slice(i + 1);
    return s.replace(/\.(puml|svg)$/i, '');
  }

  function _blank(doc) {
    return {
      doc: doc,
      findings: { open: 0, total: 0, ids: [] },
      pins: { open: 0, total: 0, label: '' },
      svg: { content: '', text: '', basis: '', status: '' },
      registry: { pending: 0, names: [] },
      diff: 'unknown',
      notes: [],
    };
  }

  function _pick(map, order, doc) {
    var k = docKey(doc);
    if (!k) return null;
    if (!map[k]) { map[k] = _blank(k); order.push(k); }
    return map[k];
  }

  // ---- 各出口 → 列 ---------------------------------------------------------

  // findings.js (finding-tracker.rows) と、画面の手動指摘 (manual-findings) の
  // どちらの形も受ける (docs の配列か doc の 1 枚か)。1 件が複数の図にまたがるので、
  // またいでいる図それぞれに数える (絞った側から消えると無かったことになる)。
  function _docsOfFinding(r) {
    var docs = _list(r && r.docs);
    if (docs.length) return docs;
    return _s(r && r.doc) ? [r.doc] : [];
  }

  // 未解消かどうか。tracker は open を持ち、画面の手動指摘は持たない
  // (画面側は「前回判定を維持 (keep)」以外を未解消として出している)。
  function _isOpen(r) {
    if (r && typeof r.open === 'boolean') return r.open;
    return !(r && r.keep);
  }

  function _fromFindings(rows, map, order) {
    _list(rows).forEach(function(r) {
      var docs = _docsOfFinding(r);
      if (!docs.length) return;
      docs.forEach(function(d) {
        var row = _pick(map, order, d);
        if (!row) return;
        row.findings.total++;
        if (_isOpen(r)) {
          row.findings.open++;
          if (_s(r.id)) row.findings.ids.push(_s(r.id));
        }
      });
    });
  }

  // pins.js (pin-report.build().entries)。open かどうかは pin-progress が決めた
  // status をそのまま読む (ここで仕分け直さない)。
  function _fromPins(entries, map, order, openStatuses) {
    // 開いている状況の名前は pin-progress が決める。呼び出し側が STATUS から
    // 作って渡す (ここに写すと、状況が増えたときに数え落とす)。
    var open = openStatuses || { untouched: true, started: true };
    _list(entries).forEach(function(e) {
      // pin-report の entries は doc を持ち、画面の観測結果は item の中に持つ。
      var row = _pick(map, order, e && (e.doc || (e.item && e.item.doc)));
      if (!row) return;
      row.pins.total++;
      if (open[_s(e.status)]) {
        row.pins.open++;
        if (!row.pins.label) row.pins.label = _s(e.label);
      }
    });
  }

  // 印が無い svg でも、書き出し当時の DSL が svg に畳まれていれば中身で言える
  // (audit-report.withStaleReasons が描かれる行だけで比べた結果)。
  //   same   — 描かれる行は同じ。体裁・コメントだけの差
  //   differ — 描かれる行が違う。作り直しが要る
  // ここを読まないと、畳まれた DSL のある図まで「未刻印」で止まり、reviewer は
  // 1 枚ずつ /verify-svg を叩き直すことになる。
  var STALE_REASON = { same: 'format', differ: 'differ' };

  // svg-freshness.scan().rows。match / 体裁差 / 内容ずれ を潰さずに持つ。
  function _fromSvg(scan, map, order) {
    var reasons = (scan && scan.staleReasons) || {};
    _list(scan && scan.rows).forEach(function(r) {
      var row = _pick(map, order, r && r.name);
      if (!row) return;
      var content = _s(r.content), basis = _s(r.basis);
      if (content === 'unverified' && STALE_REASON[_s(reasons[_s(r.name)])]) {
        content = STALE_REASON[_s(reasons[_s(r.name)])];
        basis = 'embedded';
      }
      row.svg = {
        content: content,
        text: SVG_TEXT[content] || content,
        basis: basis,
        status: _s(r.status),
      };
    });
  }

  // name-registry.pending() の組。組は図をまたぐので、綴りが出てくる図すべてに数える。
  function _fromRegistry(pending, map, order) {
    _list(pending).forEach(function(g) {
      var names = _list(g && g.members).map(function(m) { return _s(m && m.name); });
      var docs = [];
      _list(g && g.members).forEach(function(m) {
        _list(m && m.docs).forEach(function(d) {
          var k = docKey(d);
          if (k && docs.indexOf(k) < 0) docs.push(k);
        });
      });
      docs.forEach(function(d) {
        var row = _pick(map, order, d);
        if (!row) return;
        row.registry.pending++;
        row.registry.names.push(names.join(' ⇔ '));
      });
    });
  }

  // audit-scope.diffFiles()。比べられていない run は 'unknown' のままにして、
  // 「変化なし」と混ぜない (控えが無いのか、動いていないのかを潰さない)。
  function _fromFileDiff(fd, map, order, docs) {
    if (!fd) return;
    var comparable = fd.contentComparable !== false;
    var mark = function(list, kind) {
      _list(list).forEach(function(f) {
        var row = _pick(map, order, f && (f.name || f.to || f));
        if (row) row.diff = kind;
      });
    };
    mark(fd.changed, 'changed');
    mark(fd.added, 'added');
    mark(fd.removed, 'removed');
    _list(fd.renamed).forEach(function(r) {
      var row = _pick(map, order, r && r.to);
      if (row) row.diff = 'renamed';
    });
    if (!comparable) return;
    // 名指しされなかった図は「変化なし」。控えと比べていない run では触らない。
    _list(docs).forEach(function(d) {
      var row = map[docKey(d)];
      if (row && row.diff === 'unknown') row.diff = 'same';
    });
  }

  // ---- 食い違いの気づき ----------------------------------------------------

  // 同じ図について 2 つの出口が違うことを言っている箇所を、行の中に残す。
  // 消して片方に寄せない (どちらが正しいかはここでは決められない)。
  function _notes(row) {
    var out = [];
    var svg = row.svg.content;
    // 指摘トラッカーが「SVG の内容ずれ/古」で数えている図が、内容判定では
    // 体裁差だけだった場合。作り直しの要否がこの 1 行で決まる。
    var svgFinding = row.findings.svgOpen;
    if (svgFinding && svg === 'format') {
      out.push('指摘は「SVG ずれ」だが内容は一致 (体裁差のみ・作り直し不要)');
    }
    if (svg === 'unverified') {
      out.push('印が無く内容で言い切れない (/verify-svg で確定)');
    }
    if (svg === 'differ' && row.svg.basis === 'stamp') {
      out.push('印の突合だけのずれ (体裁差でも出る・要確定)');
    }
    return out;
  }

  // findings の「出力物/SVG …」の行だけを別に数える (気づきの材料)。
  function _markSvgFindings(rows, map) {
    _list(rows).forEach(function(r) {
      if (!r || !_isOpen(r)) return;
      var cats = _list(r.cats).concat([_s(r.category), _s(r.kind), _s(r.label)]).join(' ');
      if (cats.indexOf('SVG') < 0 && cats.indexOf('svg') < 0) return;
      _docsOfFinding(r).forEach(function(d) {
        var row = map[docKey(d)];
        if (row) row.findings.svgOpen = (row.findings.svgOpen || 0) + 1;
      });
    });
  }

  // ---- 組み立て ------------------------------------------------------------

  // input: { docs, findings, pins, svg, registry, fileDiff, pinOpenStatuses }
  function build(input) {
    var inp = input || {};
    var map = {}, order = [];

    // 図の一覧を先に置く。どの出口にも出てこない図 (=指摘なし) を表から落とさない。
    _list(inp.docs).forEach(function(d) { _pick(map, order, d && (d.name || d)); });

    _fromFindings(inp.findings, map, order);
    _fromPins(inp.pins, map, order, inp.pinOpenStatuses);
    _fromSvg(inp.svg, map, order);
    _fromRegistry(inp.registry && inp.registry.pending, map, order);
    _fromFileDiff(inp.fileDiff, map, order, order.slice());

    _markSvgFindings(inp.findings, map);

    // 見ていない出口の列は 0 件と区別する (「—」と「?」を混ぜない)。
    var seenCols = {
      findings: Array.isArray(inp.findings),
      pins: Array.isArray(inp.pins),
      svg: !!(inp.svg && Array.isArray(inp.svg.rows)),
      registry: !!(inp.registry && Array.isArray(inp.registry.pending)),
    };
    Object.keys(map).forEach(function(k) { map[k].seen = seenCols; });

    order.sort(function(a, b) { return a < b ? -1 : (a > b ? 1 : 0); });
    var rows = order.map(function(k) {
      var r = map[k];
      r.notes = _notes(r);
      return r;
    });

    return {
      rows: rows,
      columns: COLUMNS,
      totals: {
        docs: rows.length,
        findings: rows.reduce(function(n, r) { return n + r.findings.open; }, 0),
        pins: rows.reduce(function(n, r) { return n + r.pins.open; }, 0),
        registry: rows.reduce(function(n, r) { return n + r.registry.pending; }, 0),
        // 作り直しが要る図 (体裁差は数えない)。
        needsRender: rows.filter(function(r) { return r.svg.content === 'differ' || r.svg.content === 'missing'; }).length,
        formatOnly: rows.filter(function(r) { return r.svg.content === 'format'; }).length,
        changed: rows.filter(function(r) { return r.diff === 'changed' || r.diff === 'added'; }).length,
        notes: rows.reduce(function(n, r) { return n + r.notes.length; }, 0),
      },
      // 見ていない出口は 0 件と区別する。
      seen: seen(inp),
    };
  }

  function seen(inp) {
    var out = [];
    if (Array.isArray(inp.findings)) out.push('指摘');
    if (Array.isArray(inp.pins)) out.push('📌');
    if (inp.svg && Array.isArray(inp.svg.rows)) out.push('SVG');
    if (inp.registry && Array.isArray(inp.registry.pending)) out.push('表記');
    if (inp.fileDiff) out.push('前回控え');
    return out;
  }

  // 「手を入れる必要がある図」だけ。体裁差だけの図・変化なしの図は落ちる。
  function actionable(board) {
    return _list(board && board.rows).filter(function(r) {
      return r.findings.open > 0 || r.pins.open > 0 || r.registry.pending > 0
        || r.svg.content === 'differ' || r.svg.content === 'missing';
    });
  }

  // ---- 表示 ----------------------------------------------------------------

  function cell(row, key) {
    var seen = row.seen || {};
    if (key === 'doc') return row.doc;
    if (seen[key] === false) return '?';
    if (key === 'findings') return row.findings.open ? String(row.findings.open) + ' 件' : '—';
    if (key === 'pins') return row.pins.open ? String(row.pins.open) + ' 件' + (row.pins.label ? '(' + row.pins.label + ')' : '') : '—';
    if (key === 'svg') return row.svg.text || '—';
    if (key === 'registry') return row.registry.pending ? String(row.registry.pending) + ' 組' : '—';
    if (key === 'diff') return DIFF_TEXT[row.diff] || DIFF_TEXT.unknown;
    if (key === 'note') return row.notes.join(' / ');
    return '';
  }

  // 全角を 2 と数える桁合わせ (等幅端末で列が折れないように)。
  function width(s) {
    var n = 0, t = _s(s);
    for (var i = 0; i < t.length; i++) {
      n += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦←-⇿■-➿]/.test(t[i]) ? 2 : 1;
    }
    return n;
  }

  function pad(s, w) {
    var t = _s(s), d = w - width(t);
    return d > 0 ? t + new Array(d + 1).join(' ') : t;
  }

  function summaryLine(board) {
    var b = (board && board.totals) || { docs: 0 };
    if (!b.docs) return '対象の図がありません';
    var s = b.docs + ' 枚 / 指摘 ' + b.findings + ' 件 / 📌 ' + b.pins + ' 件'
      + ' / 表記 要決定 ' + b.registry + ' 組 / 作り直し要 ' + b.needsRender + ' 枚';
    if (b.formatOnly) s += '（体裁差のみ ' + b.formatOnly + ' 枚は作り直し不要）';
    if (b.changed) s += ' / 前回から変わった ' + b.changed + ' 枚';
    return s;
  }

  function text(board, title) {
    var b = board || { rows: [], columns: COLUMNS };
    var rows = _list(b.rows);
    var cols = _list(b.columns).length ? b.columns : COLUMNS;
    // 気づきが 1 つも無ければ列ごと落とす (空の列で表を横に広げない)。
    var useCols = cols.filter(function(c) {
      return c.key !== 'note' || rows.some(function(r) { return r.notes.length; });
    });
    var w = useCols.map(function(c) { return width(c.label); });
    rows.forEach(function(r) {
      useCols.forEach(function(c, i) { w[i] = Math.max(w[i], width(cell(r, c.key))); });
    });
    var out = [];
    if (_s(title)) out.push(_s(title));
    out.push(summaryLine(b));
    if (b.seen && b.seen.length) out.push('見た出口: ' + b.seen.join('・'));
    out.push('');
    out.push(useCols.map(function(c, i) { return pad(c.label, w[i]); }).join('  '));
    out.push(useCols.map(function(c, i) { return new Array(w[i] + 1).join('-'); }).join('  '));
    rows.forEach(function(r) {
      out.push(useCols.map(function(c, i) { return pad(cell(r, c.key), w[i]); }).join('  ').replace(/\s+$/, ''));
    });
    var act = actionable(b);
    out.push('');
    out.push(act.length
      ? '手を入れる図: ' + act.map(function(r) { return r.doc; }).join(', ')
      : '手を入れる図はありません');
    return out.join('\n');
  }

  // 指摘.md に貼る形。表の列はそのまま markdown の表にする。
  function markdown(board, title) {
    var b = board || { rows: [], columns: COLUMNS };
    var cols = _list(b.columns).length ? b.columns : COLUMNS;
    var out = ['# ' + (_s(title) || '整合ダッシュボード'), '', summaryLine(b), ''];
    out.push('| ' + cols.map(function(c) { return c.label; }).join(' | ') + ' |');
    out.push('|' + cols.map(function() { return ' --- '; }).join('|') + '|');
    _list(b.rows).forEach(function(r) {
      out.push('| ' + cols.map(function(c) { return cell(r, c.key) || ''; }).join(' | ') + ' |');
    });
    return out.join('\n');
  }

  var api = {
    COLUMNS: COLUMNS, SVG_TEXT: SVG_TEXT, DIFF_TEXT: DIFF_TEXT,
    docKey: docKey, build: build, actionable: actionable, cell: cell,
    summaryLine: summaryLine, text: text, markdown: markdown, width: width,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.statusDashboard = api;
  }
})();
