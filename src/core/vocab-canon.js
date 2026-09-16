'use strict';
window.MA = window.MA || {};

// vocab-canon — 表記揺れの組の「統一先」(どちらの綴りが正式か) を言い切る。
//
// BLK-junior-20260917-0123-wish: vocab-match は指摘.md の組が自分の図のどこに
// 効いているかまでは出すが、組の左右どちらへ揃えるのかは出さない。指摘.md 本文にも
// 書かれていないので、junior は先輩フォルダ (persona-data\primary) の複数ファイルを
// grep して「先輩は実際どちらで書いているか」を数えていた。組が複数図種にまたがると
// その grep を図種ごとにやり直すことになる。
//
// 判定の根拠は 3 つ。強い順に:
//   registry … 保存フォルダの親の `_names.json` (人が決めた正式表記)。人の決定が
//              あるならそれが答えで、数を数える必要はない。
//   count    … 先輩フォルダ全体での出現数の多数決。
//   latest   … 同数のとき、その綴りを含む図の最終更新が新しい方 (先輩が最後に
//              書いた綴りを今の正式とみなす)。
// どれでも決まらなければ言い切らない (`unknown`)。根拠を偽らないことが要 —
// 「統一先はこちら」と出す以上、なぜそう言えるかが同じ行に出ていないと、
// junior は結局 grep で裏を取り直すことになる。
//
// 数え方は vocabMatch.ranges (= bulkRename と同じ識別子境界) をそのまま使う。
// 規則を 2 つ持たないので、ここが数えた件数は ⇄ 一括置換のヒット数と一致する。
// DOM も fetch も触らない (数えて決めるだけ)。読み込みと描画は app.js。
window.MA.vocabCanon = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  // 境界規則は vocabMatch が正本。読み込み順の都合で無いときだけ 0 件を返す
  // (別規則で数えて ⇄ 一括置換と食い違う件数を出すよりは、何も言わない方がよい)。
  function _ranges(line, term) {
    var VM = window.MA && window.MA.vocabMatch;
    return VM ? VM.ranges(line, term) : [];
  }

  function _lines(text) { return _s(text).replace(/\r\n?/g, '\n').split('\n'); }

  // ── 1 つの綴りを先輩フォルダ全体で数える ──────────────────────────────
  // docs: [{ folder, name, text, mtime }]。mtime は ISO 文字列 (無くてもよい)。
  // 返り値の files は件数の多い順 (junior が最初に開くべき図が先頭に来る)。
  function tally(term, docs) {
    var out = { term: _s(term), count: 0, files: [], latest: '' };
    if (!out.term) return out;
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (!d) return;
      var lines = _lines(d.text);
      var n = 0;
      var first = 0;
      for (var i = 0; i < lines.length; i++) {
        var rs = _ranges(lines[i], out.term);
        if (!rs.length) continue;
        if (!first) first = i + 1;
        n += rs.length;
      }
      if (!n) return;
      out.count += n;
      var mt = _s(d.mtime);
      if (mt > out.latest) out.latest = mt;
      out.files.push({ folder: _s(d.folder), name: _s(d.name), count: n,
                       line: first, mtime: mt });
    });
    out.files.sort(function(x, y) {
      if (y.count !== x.count) return y.count - x.count;
      return x.name < y.name ? -1 : 1;
    });
    return out;
  }

  // ── 1 組を判定する ────────────────────────────────────────────────────
  // reg: nameRegistry の登録簿 (省略可)。
  function decide(pair, docs, reg) {
    var p = pair || {};
    var a = tally(p.a, docs);
    var b = tally(p.b, docs);
    var v = { a: _s(p.a), b: _s(p.b), label: _s(p.label) || (_s(p.a) + '⇔' + _s(p.b)),
              canonical: '', other: '', source: 'unknown', tally: { a: a, b: b },
              files: [], registryNote: '' };

    // 1. 人が決めた正式表記。組の片方が登録簿の正式表記なら、そちらが答え。
    var NR = window.MA && window.MA.nameRegistry;
    if (NR && reg) {
      var hit = NR.find(reg, v.a) || NR.find(reg, v.b);
      var canon = hit ? _s(hit.canonical) : '';
      if (canon === v.a || canon === v.b) {
        v.canonical = canon;
        v.other = canon === v.a ? v.b : v.a;
        v.source = 'registry';
        v.registryNote = _s(hit.by) || '';
        v.files = (canon === v.a ? a : b).files;
        return v;
      }
    }

    // 2. 多数決。3. 同数なら最後に書かれた方。
    if (a.count !== b.count && (a.count || b.count)) {
      v.canonical = a.count > b.count ? v.a : v.b;
      v.source = 'count';
    } else if (a.count && b.count && a.latest !== b.latest) {
      v.canonical = a.latest > b.latest ? v.a : v.b;
      v.source = 'latest';
    } else {
      return v;   // どちらも 0 件、または同数同時刻 — 言い切らない
    }
    v.other = v.canonical === v.a ? v.b : v.a;
    v.files = (v.canonical === v.a ? a : b).files;
    return v;
  }

  function decideAll(pairs, docs, reg) {
    return (Array.isArray(pairs) ? pairs : []).map(function(p) {
      return decide(p, docs, reg);
    });
  }

  function decided(list) {
    return (Array.isArray(list) ? list : []).filter(function(v) {
      return v && v.source !== 'unknown';
    });
  }

  // ── 読ませる ──────────────────────────────────────────────────────────
  // 「統一先はこちら」と、そう言える根拠を 1 行に収める。
  function verdictText(v) {
    if (!v) return '';
    if (v.source === 'unknown') {
      var both = (v.tally.a.count | 0) + (v.tally.b.count | 0);
      return v.label + ': 統一先を決められません ('
        + (both ? '先輩も両方の綴りを同数で使っています' : '先輩の図にどちらの綴りもありません') + ')';
    }
    return v.label + ' → 統一先: ' + v.canonical + ' (' + reasonText(v) + ')';
  }

  function reasonText(v) {
    if (!v) return '';
    var a = v.tally.a, b = v.tally.b;
    var mine = v.canonical === v.a ? a : b;
    var theirs = v.canonical === v.a ? b : a;
    if (v.source === 'registry') {
      return '登録簿の正式表記' + (v.registryNote ? ' / 登録: ' + v.registryNote : '');
    }
    var counts = '先輩 ' + mine.count + '件 ' + mine.files.length + '図 ⇔ '
      + theirs.term + ' ' + theirs.count + '件';
    if (v.source === 'latest') return counts + '、同数につき更新が新しい方';
    return counts;
  }

  // 根拠にした図を「どこを見れば裏が取れるか」の形で出す。
  function fileText(f) {
    if (!f) return '';
    return (f.folder ? f.folder + '/' : '') + f.name
      + (f.line ? ' ' + f.line + '行目' : '') + ' (' + f.count + '件)';
  }

  function summaryText(list, docCount) {
    var all = Array.isArray(list) ? list : [];
    if (!all.length) return '';
    var ok = decided(all);
    if (!docCount) return '統一先: 先輩のフォルダを読めていません';
    if (!ok.length) return '統一先: ' + all.length + '組とも先輩の図から決められません';
    return '統一先: ' + all.length + '組中 ' + ok.length + '組を先輩 ' + docCount + '図から判定';
  }

  var api = {
    tally: tally,
    decide: decide,
    decideAll: decideAll,
    decided: decided,
    verdictText: verdictText,
    reasonText: reasonText,
    fileText: fileText,
    summaryText: summaryText,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  window.MA.vocabCanon = api;
  return api;
})();
