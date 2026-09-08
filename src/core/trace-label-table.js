'use strict';

// trace-label-table — 系統 1 つの「状態遷移のラベル → 対応するシーケンスの
// メッセージ名」の突合表。対応が無い行を先頭に置き、架空のラベルには
// 実在するメッセージ名の候補を添える。
//
// BLK-primary-20260908-1603-wish: 遷移密度 (transition-density) は件数しか
// 見ないので、「件数は揃っているのにラベルだけが架空」(dma_state の
// Dma_Configure がシーケンスのどのメッセージとも一致しない) は表に出ない。
// トレースカバレッジの表は現れた**図の名前**までしか出さないため、
// 「では何という名前に直せばよいか」はシーケンス図を開いて探すことになる。
//
// ここは trace-coverage.coverFamily() の結果 (rows / messages) を受け取り、
// 行を「対応なし → 部分一致 → 一致 → 対象外」の順に並べ替え、対応なしの行に
// 実在メッセージ名の候補を付ける。突合そのものは trace-coverage の職掌。
// DOM にもサーバにも触らない。node からも require できる。
(function() {

  // 並び順。対応が無い行が先頭に来る (探しに行かずに済む)。
  var ORDER = { missing: 0, partial: 1, covered: 2, unknown: 3, 'out-of-scope': 4 };

  var STATUS_LABEL = {
    missing: '対応なし',
    partial: '部分一致',
    covered: '一致',
    unknown: '未突合',
    'out-of-scope': '対象外',
  };

  // 候補として出す最小の近さと件数。近くない名前を並べると、
  // 「候補がある = 直せばよい」という読みが崩れる。
  var SUGGEST_MIN = 0.34;
  var SUGGEST_MAX = 3;

  function _s(v) { return v == null ? '' : String(v); }
  function _list(v) { return Array.isArray(v) ? v : []; }

  // 文字 2-gram の Dice 係数。1 文字違いを別名としないための近さで、
  // 綴りの近い実在名 (ArmChannel ⇄ ArmChannels) を拾う。
  function similarity(a, b) {
    var x = _s(a), y = _s(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    if (x.length < 2 || y.length < 2) return x === y ? 1 : 0;
    var grams = {}, total = 0, hit = 0, i, g;
    for (i = 0; i < x.length - 1; i++) {
      g = x.substr(i, 2);
      grams[g] = (grams[g] || 0) + 1;
    }
    for (i = 0; i < y.length - 1; i++) {
      g = y.substr(i, 2);
      total++;
      if (grams[g] > 0) { grams[g]--; hit++; }
    }
    return (2 * hit) / ((x.length - 1) + total);
  }

  // 遷移のキー (ラベル・trigger・action) に一番近い実在メッセージ名。
  function suggestFor(row, messages) {
    var keys = _list(row && row.keys);
    if (!keys.length) keys = [_s(row && row.label).toLowerCase().replace(/[^a-z0-9]/g, '')];
    var out = [];
    _list(messages).forEach(function(m) {
      var best = 0;
      keys.forEach(function(k) {
        var v = similarity(k, _s(m.key));
        if (v > best) best = v;
      });
      if (best < SUGGEST_MIN) return;
      out.push({ name: _s(m.name), doc: _s(m.doc), score: Math.round(best * 100) / 100 });
    });
    out.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
    });
    return out.slice(0, SUGGEST_MAX);
  }

  function _row(r, messages) {
    var status = _s(r.status) || 'unknown';
    var matched = _list(r.matched).map(function(m) {
      return { name: _s(m.name), doc: _s(m.doc) };
    });
    return {
      docId: r.docId, docName: _s(r.docName), line: r.line || 0,
      from: _s(r.from), to: _s(r.to), label: _s(r.label),
      status: status, statusLabel: STATUS_LABEL[status] || status,
      seenIn: _list(r.seenIn).map(_s),
      matched: matched,
      // 対応が無い行にだけ候補を出す (一致した行に候補を並べても迷うだけ)。
      suggest: status === 'missing' ? suggestFor(r, messages) : [],
      reason: _s(r.reason),
    };
  }

  // 綴りの近い名前が 1 つも無いときの代わり。今回の実例 (Dma_Configure に対し
  // 実在するのは SetSrcDst / ArmChannel …) のように、架空のラベルは実在名と
  // 綴りが似ていないことの方が多い。候補が空のまま「対応なし」とだけ出すと、
  // 直す先を探しにシーケンス図を開くことになるので、系統に実在する名前を出す。
  function _withFallback(row, messages) {
    if (row.status !== 'missing' || row.suggest.length) return row;
    row.fallback = true;
    row.suggest = _list(messages).slice(0, SUGGEST_MAX).map(function(m) {
      return { name: _s(m.name), doc: _s(m.doc), score: 0 };
    });
    return row;
  }

  // family: trace-coverage.coverFamily() の結果 (key つき)。
  function build(family) {
    var f = family || {};
    var messages = _list(f.messages);
    var rows = _list(f.rows).map(function(r) { return _withFallback(_row(r, messages), messages); })
      .concat(_list(f.outOfScope).map(function(r) { return _row(r, messages); }));

    rows.forEach(function(r, i) { r._i = i; });
    rows.sort(function(a, b) {
      var oa = ORDER[a.status], ob = ORDER[b.status];
      if (oa == null) oa = 9;
      if (ob == null) ob = 9;
      if (oa !== ob) return oa - ob;
      return a._i - b._i;   // 同じ状態なら図に書かれた順のまま
    });
    rows.forEach(function(r) { delete r._i; });

    var counts = { missing: 0, partial: 0, covered: 0, unknown: 0, outOfScope: 0 };
    rows.forEach(function(r) {
      if (r.status === 'out-of-scope') counts.outOfScope++;
      else if (counts[r.status] != null) counts[r.status]++;
    });

    return {
      key: _s(f.key),
      rows: rows,
      counts: counts,
      messages: messages,
      // 突き合わせが成立したか。成立していない系統で「対応なし 0 件」と言わない。
      comparable: !!f.comparable,
      seqDocs: _list(f.seqDocs).map(function(d) { return _s(d.name); }),
    };
  }

  function summaryLine(table) {
    var t = table || { counts: {}, rows: [], seqDocs: [] };
    var c = t.counts || {};
    if (!_list(t.seqDocs).length) return 'この系統にシーケンス図が無いため突き合わせていません';
    if (!_list(t.rows).length) return 'ラベルの付いた遷移がありません';
    if (!c.missing) {
      return '遷移 ' + (c.covered + c.partial) + ' 件はシーケンスのメッセージに対応しています'
        + (c.partial ? '（部分一致 ' + c.partial + ' 件）' : '')
        + (c.outOfScope ? ' / 対象外 ' + c.outOfScope + ' 件' : '');
    }
    return '対応するメッセージが無いラベル ' + c.missing + ' 件'
      + (c.partial ? ' / 部分一致 ' + c.partial + ' 件' : '')
      + (c.outOfScope ? ' / 対象外 ' + c.outOfScope + ' 件' : '');
  }

  // 行 1 つの「対応」欄の文言。
  function matchText(row) {
    var r = row || {};
    if (r.status === 'covered' || r.status === 'partial') {
      var names = _list(r.matched).map(function(m) { return m.name; });
      if (!names.length) return _list(r.seenIn).join(' / ');
      return names.join(' / ') + (r.status === 'partial' ? '（部分一致）' : '');
    }
    if (r.status === 'out-of-scope') {
      return r.reason === 'declared' ? '宣言の対象外' : '粒度が違うため対象外';
    }
    if (r.status === 'unknown') return '(突き合わせていません)';
    if (_list(r.suggest).length) {
      var names = _list(r.suggest).map(function(s) { return s.name; }).join(' / ');
      return r.fallback
        ? '対応なし → 実在するメッセージ: ' + names
        : '対応なし → 候補: ' + names;
    }
    return '対応なし';
  }

  var api = {
    ORDER: ORDER, STATUS_LABEL: STATUS_LABEL,
    SUGGEST_MIN: SUGGEST_MIN, SUGGEST_MAX: SUGGEST_MAX,
    similarity: similarity, suggestFor: suggestFor,
    build: build, summaryLine: summaryLine, matchText: matchText,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.traceLabelTable = api;
  }
})();
