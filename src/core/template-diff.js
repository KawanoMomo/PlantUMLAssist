'use strict';
window.MA = window.MA || {};

// template-diff — 「この図は別の図の雛形違い」を機械的に言う
// (BLK-junior-20260908-1303-wish)。
//
// UART / CAN / GPIO の初期化アクティビティ図は、同じ雛形 (クロック有効化 → 設定 →
// 割込み有効化 → 成否分岐) をペリフェラル名だけ変えて複製したものだった。しかし
// GUI にはその関係を残す場所が無く、毎回まっさらな 2 枚として全文を読み比べ、
// 構造が同じかどうかを目で判断し直していた。
//
// ここは 2 枚を「題材語を伏せた行」の集合として突き合わせ、
//   共通   — 雛形どおりの行 (題材語の違いは差分にしない)
//   追加   — 派生図にだけある行
//   削除   — 雛形にだけあって派生図に無い行
// を出す。行の並び替えは差分にしない (雛形違いの判断に効かないため)。
// 題材語は与えられなければ推測する。DOM には触らない。
window.MA.templateDiff = (function() {

  var SUBJ = '<題材>';

  function _s(v) { return v == null ? '' : String(v); }

  // 図の骨組みと飾りは比べない。構造 (どの手順があるか) だけを見る。
  var SKIP_RE = /^\s*(?:@|'|!|title|header|footer|legend|skinparam|hide|show|scale|caption|autonumber)/i;

  function lines(dsl) {
    return _s(dsl).split('\n')
      .map(function(l) { return l.trim(); })
      .filter(function(l) { return l !== '' && !SKIP_RE.test(l); });
  }

  // 語の出現数 (1 行に何度出ても 1 回)。
  function _wordCounts(dsl) {
    var counts = {};
    lines(dsl).forEach(function(l) {
      var ws = l.match(/[A-Za-z][A-Za-z0-9_]*/g) || [];
      var seen = {};
      ws.forEach(function(w) {
        if (w.length < 2 || seen[w]) return;
        seen[w] = true;
        counts[w] = (counts[w] || 0) + 1;
      });
    });
    return counts;
  }

  function _pickTop(counts, exclude) {
    var best = '', bestN = 0;
    Object.keys(counts).forEach(function(w) {
      if (exclude && exclude[w]) return;      // 相手にも出る語は題材語ではない
      if (counts[w] > bestN || (counts[w] === bestN && w < best)) {
        best = w; bestN = counts[w];
      }
    });
    return best;
  }

  // 題材語。「相手の図に出てこない語のうち、いちばん多く出るもの」を採る。
  // 雛形から複製した図は題材語だけが入れ替わっているので、これが当たる。
  // 1 枚だけを見る場合は、2 行以上に出る語を題材語とみなす。
  function subjectOf(dsl, otherDsl) {
    var counts = _wordCounts(dsl);
    if (arguments.length >= 2) return _pickTop(counts, _wordCounts(otherDsl));
    var best = _pickTop(counts, null);
    return (counts[best] || 0) >= 2 ? best : '';
  }

  // 題材語を伏せた行。大小と区切りの違いは同じ行として扱う。
  // subject は 1 語でも語の配列でもよい。雛形と派生図の題材語をどちらも伏せるので、
  // どちら側の行かに関係なく同じ形になる。
  function normalizeLine(line, subject) {
    var s = _s(line);
    var subs = (subject == null) ? []
      : (Object.prototype.toString.call(subject) === '[object Array]' ? subject : [subject]);
    subs.forEach(function(sub) {
      if (!sub) return;
      s = s.replace(new RegExp(String(sub).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), SUBJ);
    });
    return s.replace(/\s+/g, ' ').replace(/[_-]+/g, '').toLowerCase().trim();
  }

  // 行の集合 (同じ行が 2 度出る図もあるので件数で持つ)。
  function _bag(dsl, subject) {
    var bag = {};
    lines(dsl).forEach(function(l) {
      var k = normalizeLine(l, subject);
      if (!bag[k]) bag[k] = { key: k, count: 0, samples: [] };
      bag[k].count++;
      bag[k].samples.push(l);
    });
    return bag;
  }

  // 雛形と派生図の差分。subjects を渡さなければ両側から推測する。
  function build(templateDsl, derivedDsl, subjects) {
    var tSub = (subjects && subjects.template) || subjectOf(templateDsl, derivedDsl);
    var dSub = (subjects && subjects.derived) || subjectOf(derivedDsl, templateDsl);
    var both = [tSub, dSub];
    var tBag = _bag(templateDsl, both);
    var dBag = _bag(derivedDsl, both);
    var rows = [];

    Object.keys(tBag).forEach(function(k) {
      var t = tBag[k], d = dBag[k];
      var shared = d ? Math.min(t.count, d.count) : 0;
      for (var i = 0; i < shared; i++) {
        rows.push({ kind: 'same', template: t.samples[i], derived: d.samples[i] });
      }
      for (var j = shared; j < t.count; j++) {
        rows.push({ kind: 'removed', template: t.samples[j], derived: '' });
      }
    });
    Object.keys(dBag).forEach(function(k) {
      var d = dBag[k], t = tBag[k];
      var shared = t ? Math.min(t.count, d.count) : 0;
      for (var j = shared; j < d.count; j++) {
        rows.push({ kind: 'added', template: '', derived: d.samples[j] });
      }
    });

    // 見るのは差分なので、追加・削除を先に、共通は後ろにまとめる。
    var order = { 'added': 0, 'removed': 1, 'same': 2 };
    rows.sort(function(a, b) { return order[a.kind] - order[b.kind]; });
    return { rows: rows, templateSubject: tSub, derivedSubject: dSub };
  }

  function count(diff, kind) {
    return ((diff && diff.rows) || []).filter(function(r) { return r.kind === kind; }).length;
  }

  // 見出し。まず知りたいのは「雛形どおりか、どこが違うか」。
  function summary(diff) {
    var rows = (diff && diff.rows) || [];
    if (rows.length === 0) return '比べる行がありません';
    var added = count(diff, 'added');
    var removed = count(diff, 'removed');
    var same = count(diff, 'same');
    if (added === 0 && removed === 0) {
      return '雛形どおり (題材語だけの違い。共通 ' + same + ' 行)';
    }
    return '追加 ' + added + ' / 削除 ' + removed + ' (共通 ' + same + ' 行)';
  }

  // 推測した題材語を言う。当たっていなければ人が読んで気づけるように出す。
  function subjectNote(diff) {
    if (!diff) return '';
    var t = diff.templateSubject, d = diff.derivedSubject;
    if (!t && !d) return '題材語は見つかりませんでした (そのまま比べています)';
    return '題材語: 雛形 ' + (t || '—') + ' / この図 ' + (d || '—') + ' を伏せて比べています';
  }

  var KIND_LABEL = { 'added': 'この図だけ', 'removed': '雛形だけ', 'same': '雛形どおり' };

  function kindLabel(kind) { return KIND_LABEL[kind] || _s(kind); }

  return {
    SUBJ: SUBJ,
    lines: lines,
    subjectOf: subjectOf,
    normalizeLine: normalizeLine,
    build: build,
    count: count,
    summary: summary,
    subjectNote: subjectNote,
    kindLabel: kindLabel,
  };
})();
