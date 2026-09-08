'use strict';
window.MA = window.MA || {};

// template-cohort — 同じ雛形から複製した図を「2 枚」ではなく「まとめて全部」
// 突き合わせ、どの行がどの図にあるかを行ごとに言う (BLK-junior-20260908-1403)。
//
// 雛形との差分 (template-diff) は 2 枚を相手にする。ところが実データでは、
// 先発版 (UART) と後発版 (CAN) の間に「後で作った方にだけある要素」が 1 つも
// 無いことがある。そのとき 2 枚比べは「違いは語の言い換えだけ」としか答えず、
// 「では取り込む対象はどこにあるのか / 本当にどこにも無いのか」は人が同じ 2 枚を
// 何度も読み直して判断し続けることになる。
//
// ここは 3 枚以上を一度に並べ、題材語を伏せた行ごとに
//   共通 (all)  — 並べた全部の図にある行 = 雛形の行
//   一部 (some) — 一部の図にだけある行
//   固有 (only) — 1 枚にだけある行 = 取り込み候補
// を出す。固有が 0 件なら「並べた N 枚は同じ雛形の複製で、固有の行は無い」と
// 言い切れる。判断が人の記憶からこの表に移る。
// 行の並び替えは差分にしない (template-diff と同じ)。DOM には触らない。
window.MA.templateCohort = (function() {

  function _s(v) { return v == null ? '' : String(v); }
  function _td() { return window.MA.templateDiff; }

  // 並べる図。name と dsl を持つものだけを採り、名前が無ければ番号を振る。
  function normalizeDocs(docs) {
    var out = [];
    (Array.isArray(docs) ? docs : []).forEach(function(d, i) {
      if (!d) return;
      out.push({ name: _s(d.name) || ('図 ' + (i + 1)), dsl: _s(d.dsl) });
    });
    return out;
  }

  // 各図の題材語。「自分以外の全部に出てこない語のうち、いちばん多く出るもの」。
  // 相手 1 枚ではなく残り全部を相手にするので、3 枚以上でも題材語を取り違えない。
  function subjects(docs) {
    var list = normalizeDocs(docs);
    var td = _td();
    if (!td) return [];
    return list.map(function(d, i) {
      var others = list.filter(function(_, j) { return j !== i; })
        .map(function(o) { return o.dsl; }).join('\n');
      return td.subjectOf(d.dsl, others);
    });
  }

  // 行ごとに「どの図にあるか」。同じ行が 1 枚の中に 2 度出ても 1 回と数える
  // (雛形の複製かどうかの判断に、重複の回数は効かない)。
  function build(docs) {
    var list = normalizeDocs(docs);
    var td = _td();
    if (!td || list.length === 0) return { docs: list, subjects: [], rows: [] };

    var subs = subjects(list);
    var all = subs.filter(function(w) { return !!w; });
    var byKey = {};
    var order = [];

    list.forEach(function(d, i) {
      var seen = {};
      td.lines(d.dsl).forEach(function(line) {
        // どの図の題材語も伏せる。伏せ方が図ごとに変わると、同じ行が
        // 別の行に見えてしまう。
        var key = td.normalizeLine(line, all);
        if (!byKey[key]) {
          byKey[key] = { key: key, sample: line, docs: [], missing: [] };
          order.push(key);
        }
        if (seen[key]) return;
        seen[key] = true;
        byKey[key].docs.push(d.name);
        if (!byKey[key].sample) byKey[key].sample = line;
        void i;
      });
    });

    var names = list.map(function(d) { return d.name; });
    var rows = order.map(function(k) {
      var r = byKey[k];
      r.missing = names.filter(function(n) { return r.docs.indexOf(n) < 0; });
      r.kind = (r.docs.length === list.length) ? 'all'
        : (r.docs.length === 1 ? 'only' : 'some');
      r.owner = (r.kind === 'only') ? r.docs[0] : '';
      return r;
    });

    // 見たいのは固有 → 一部 → 共通 の順。
    var rank = { 'only': 0, 'some': 1, 'all': 2 };
    rows.sort(function(a, b) { return rank[a.kind] - rank[b.kind]; });
    return { docs: list, subjects: subs, rows: rows };
  }

  function count(result, kind) {
    return ((result && result.rows) || []).filter(function(r) { return r.kind === kind; }).length;
  }

  // ある図にだけある行。台本の「後で作った方にだけある要素」はこれ。
  function uniqueTo(result, name) {
    var n = _s(name);
    return ((result && result.rows) || []).filter(function(r) {
      return r.kind === 'only' && r.owner === n;
    });
  }

  // 並べた枚数が足りないと、そもそも「一部にだけある」が意味を持たない。
  function isComparable(result) {
    return !!(result && result.docs && result.docs.length >= 2 && result.rows.length > 0);
  }

  // 見出し。固有が 0 件のときは「無い」と言い切る。ここを濁すと、
  // 人が同じ図をもう一度読み直す羽目になる。
  function summary(result) {
    if (!result || !result.docs || result.docs.length === 0) return '並べる図がありません';
    var n = result.docs.length;
    if (n < 2) return '並べる図が 1 枚しかありません (＋ でもう 1 枚開いてください)';
    if (!result.rows || result.rows.length === 0) return '比べる行がありません';
    var only = count(result, 'only');
    var some = count(result, 'some');
    var all = count(result, 'all');
    if (only === 0 && some === 0) {
      return n + ' 枚は同じ雛形の複製です (共通 ' + all + ' 行。1 枚にだけある行はありません)';
    }
    if (only === 0) {
      return n + ' 枚: 1 枚にだけある行はありません (一部だけ ' + some + ' 行 / 共通 ' + all + ' 行)';
    }
    return n + ' 枚: 1 枚にだけある行 ' + only + ' / 一部だけ ' + some + ' / 共通 ' + all;
  }

  // 取り込みの判断。台本の手順 2 (後発版にだけある要素を選ぶ) が成立するかを言う。
  function verdict(result, name) {
    if (!result || !result.docs || result.docs.length < 2) return '';
    var n = _s(name);
    if (!n) return '';
    var mine = uniqueTo(result, n);
    if (mine.length > 0) {
      return n + ' にだけある行が ' + mine.length + ' 件あります (取り込む対象)';
    }
    if (count(result, 'only') > 0 || count(result, 'some') > 0) {
      return n + ' にだけある行はありません (固有の行は他の図の側にあります)';
    }
    return n + ' にだけある行はありません。'
      + result.docs.length + ' 枚とも同じ雛形の複製なので、取り込む対象はありません';
  }

  // どの図にあるかの表示。無い図を先に言う (見たいのは欠けている方)。
  function whereLabel(row, total) {
    if (!row) return '';
    var have = (row.docs || []).length;
    if (total && have === total) return total + ' 枚すべて';
    var miss = (row.missing || []);
    if (row.kind === 'only') return (row.docs[0] || '') + ' だけ';
    return have + '/' + (total || have + miss.length) + ' 枚 (無: ' + miss.join(', ') + ')';
  }

  var KIND_LABEL = { 'only': '1 枚だけ', 'some': '一部だけ', 'all': '共通' };

  function kindLabel(kind) { return KIND_LABEL[kind] || _s(kind); }

  // 題材語の推測を人が確かめられるように出す。
  function subjectNote(result) {
    if (!result || !result.docs || result.docs.length === 0) return '';
    var parts = result.docs.map(function(d, i) {
      return d.name + ': ' + ((result.subjects && result.subjects[i]) || '—');
    });
    return '題材語を伏せて比べています — ' + parts.join(' / ');
  }

  return {
    normalizeDocs: normalizeDocs,
    subjects: subjects,
    build: build,
    count: count,
    uniqueTo: uniqueTo,
    isComparable: isComparable,
    summary: summary,
    verdict: verdict,
    whereLabel: whereLabel,
    kindLabel: kindLabel,
    subjectNote: subjectNote,
  };
})();
