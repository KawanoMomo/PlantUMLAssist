'use strict';
window.MA = window.MA || {};

// state-map — 2 枚の状態遷移図の「対応表」を作る (BLK-junior-20260908-0823-wish)。
//
// 同じ GPIO ドライバの状態遷移でも、書いた人が違えば状態名・イベント名・抽象度が
// ばらばらになる。目で読み比べて「先輩が後から足した 1 要素」を当てる作業は、
// 名前が揃っていないと成立しない。そこで名前の一致だけを機械的に取り、
// 対応が付いた組・付かなかった片側だけの要素を分けて出す。
//
// 対応の強さは 3 段。判断は名前の形だけで、意味は見ない。
//   exact   — 正規化して完全一致 (Idle と idle、Wait_Ready と wait ready)
//   partial — 片方がもう片方を含む、語を共有する、または 1〜2 文字違い
//   (無し)  — どちらか片方にしか無い。ここが「足された要素」の候補になる
//
// ここは DOM に触らない純関数だけを置き、描画と結線は app.js。
window.MA.stateMap = (function() {

  function _s(v) { return v == null ? '' : String(v).trim(); }

  // 正規化。大小・記号・空白の違いは「別の名前」ではないので消す。
  // 日本語はそのまま残す (漢字かなの違いは意味の違いとして扱う)。
  function normalize(name) {
    return _s(name).toLowerCase().replace(/[\s_\-.]+/g, '');
  }

  // 語に割る。CamelCase・snake_case・空白のどれで書かれていても同じ語列にする。
  function words(name) {
    var s = _s(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    return s.split(/[\s_\-.]+/)
      .map(function(w) { return w.toLowerCase(); })
      .filter(function(w) { return w !== ''; });
  }

  // 編集距離。1〜2 文字違い (打ち間違い・単複) を部分一致に拾うためだけに使う。
  function editDistance(a, b) {
    var s = _s(a), t = _s(b);
    if (s === t) return 0;
    if (s === '' || t === '') return Math.max(s.length, t.length);
    var prev = [], cur = [], i, j;
    for (j = 0; j <= t.length; j++) prev[j] = j;
    for (i = 1; i <= s.length; i++) {
      cur[0] = i;
      for (j = 1; j <= t.length; j++) {
        var cost = s.charAt(i - 1) === t.charAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      for (j = 0; j <= t.length; j++) prev[j] = cur[j];
    }
    return prev[t.length];
  }

  // 2 つの名前の近さ。0 は無関係、1 は完全一致。
  // 対応表は「どれとどれを結ぶか」を決められればよいので、点数は順序付けにだけ使う。
  function score(a, b) {
    var na = normalize(a), nb = normalize(b);
    if (na === '' || nb === '') return 0;
    if (na === nb) return 1;

    var wa = words(a), wb = words(b);
    var shared = wa.filter(function(w) { return wb.indexOf(w) >= 0; });
    if (shared.length > 0) {
      // 共有した語の長さが両方に占める割合。Wait_Ready と Ready は 0.5 前後。
      var len = shared.join('').length;
      return 0.4 + 0.4 * ((len / na.length) + (len / nb.length)) / 2;
    }
    if (na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0) {
      return 0.4 + 0.3 * (Math.min(na.length, nb.length) / Math.max(na.length, nb.length));
    }
    var d = editDistance(na, nb);
    var maxLen = Math.max(na.length, nb.length);
    // 短い名前で 2 文字違うのは別物 (on と off)。長さに応じて許す差を変える。
    var allowed = maxLen <= 4 ? 1 : 2;
    if (d <= allowed) return 0.4 + 0.2 * (1 - d / maxLen);
    return 0;
  }

  function kindOf(sc) {
    if (sc >= 1) return 'exact';
    if (sc >= 0.4) return 'partial';
    return 'none';
  }

  // 貪欲な組み合わせ。点数の高い組から順に確定し、片側が既に使われていれば飛ばす。
  // 総当たりで最適解を取ることもできるが、対応表は人が見て直すものなので、
  // 「なぜこの組になったか」を説明できる単純な規則の方が使える。
  function _pair(left, right, keyOf) {
    var cands = [];
    left.forEach(function(l, li) {
      right.forEach(function(r, ri) {
        var sc = score(keyOf(l), keyOf(r));
        if (sc > 0) cands.push({ li: li, ri: ri, score: sc });
      });
    });
    cands.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.li !== b.li) return a.li - b.li;
      return a.ri - b.ri;
    });
    var usedL = {}, usedR = {}, pairs = [];
    cands.forEach(function(c) {
      if (usedL[c.li] || usedR[c.ri]) return;
      usedL[c.li] = true;
      usedR[c.ri] = true;
      pairs.push(c);
    });
    return { pairs: pairs, usedL: usedL, usedR: usedR };
  }

  // 状態の表示名。id しか無い状態は id を名前として扱う。
  function stateName(st) {
    if (!st) return '';
    return _s(st.label) || _s(st.id);
  }

  function _states(parsed) {
    return ((parsed && parsed.states) || []).filter(function(st) {
      return st && _s(st.id) !== '' && _s(st.id) !== '[*]';
    });
  }

  // 状態の対応表。ref が参照図 (先輩)、mine が編集中の図。
  // 行は [対応が付いた組] → [参照図だけ] → [自分の図だけ] の順。
  // 「片方だけ」を下にまとめるのは、そこが選ぶ対象だから。
  function mapStates(refParsed, mineParsed) {
    var refs = _states(refParsed);
    var mines = _states(mineParsed);
    var res = _pair(refs, mines, stateName);
    var rows = [];

    res.pairs.forEach(function(p) {
      var r = refs[p.li], m = mines[p.ri];
      rows.push({
        type: 'state',
        match: kindOf(p.score),
        score: p.score,
        ref: stateName(r), refId: r.id, refLine: r.line,
        mine: stateName(m), mineId: m.id, mineLine: m.line,
      });
    });
    rows.sort(function(a, b) { return b.score - a.score; });

    refs.forEach(function(r, i) {
      if (res.usedL[i]) return;
      rows.push({
        type: 'state', match: 'ref-only', score: 0,
        ref: stateName(r), refId: r.id, refLine: r.line,
        mine: '', mineId: null, mineLine: null,
      });
    });
    mines.forEach(function(m, i) {
      if (res.usedR[i]) return;
      rows.push({
        type: 'state', match: 'mine-only', score: 0,
        ref: '', refId: null, refLine: null,
        mine: stateName(m), mineId: m.id, mineLine: m.line,
      });
    });
    return rows;
  }

  // 遷移の表示名。「From -(きっかけ)-> To」。状態は表示名に直す。
  function transitionName(tr, parsed) {
    if (!tr) return '';
    var from = _s(tr.from) === '[*]' ? '[*]' : _labelOf(tr.from, parsed);
    var to = _s(tr.to) === '[*]' ? '[*]' : _labelOf(tr.to, parsed);
    var trig = _s(tr.trigger);
    return from + ' -' + (trig ? '(' + trig + ')' : '') + '-> ' + to;
  }

  function _labelOf(id, parsed) {
    var list = _states(parsed);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === _s(id)) return stateName(list[i]);
    }
    return _s(id);
  }

  // 遷移の対応表。状態の対応が付いていれば、それを踏まえて端点を読み替えてから
  // 名前を突き合わせる。状態名が違うだけで遷移まで「片方だけ」に落ちるのを防ぐ。
  function mapTransitions(refParsed, mineParsed, stateRows) {
    var refs = ((refParsed && refParsed.transitions) || []).slice();
    var mines = ((mineParsed && mineParsed.transitions) || []).slice();

    // 参照図の状態 id → 自分の図の状態 id
    var alias = {};
    (stateRows || []).forEach(function(row) {
      if (row.refId && row.mineId) alias[row.refId] = row.mineId;
    });

    function refKey(tr) {
      var from = alias[_s(tr.from)] || _s(tr.from);
      var to = alias[_s(tr.to)] || _s(tr.to);
      return from + ' ' + _s(tr.trigger) + ' ' + to;
    }
    function mineKey(tr) {
      return _s(tr.from) + ' ' + _s(tr.trigger) + ' ' + _s(tr.to);
    }

    var cands = [];
    refs.forEach(function(r, li) {
      mines.forEach(function(m, ri) {
        var sc = score(refKey(r), mineKey(m));
        if (sc > 0) cands.push({ li: li, ri: ri, score: sc });
      });
    });
    cands.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.li !== b.li) return a.li - b.li;
      return a.ri - b.ri;
    });
    var usedL = {}, usedR = {}, rows = [];
    cands.forEach(function(c) {
      if (usedL[c.li] || usedR[c.ri]) return;
      usedL[c.li] = true; usedR[c.ri] = true;
      var r = refs[c.li], m = mines[c.ri];
      rows.push({
        type: 'transition', match: kindOf(c.score), score: c.score,
        ref: transitionName(r, refParsed), refId: r.id, refLine: r.line,
        mine: transitionName(m, mineParsed), mineId: m.id, mineLine: m.line,
      });
    });
    rows.sort(function(a, b) { return b.score - a.score; });

    refs.forEach(function(r, i) {
      if (usedL[i]) return;
      rows.push({
        type: 'transition', match: 'ref-only', score: 0,
        ref: transitionName(r, refParsed), refId: r.id, refLine: r.line,
        mine: '', mineId: null, mineLine: null,
      });
    });
    mines.forEach(function(m, i) {
      if (usedR[i]) return;
      rows.push({
        type: 'transition', match: 'mine-only', score: 0,
        ref: '', refId: null, refLine: null,
        mine: transitionName(m, mineParsed), mineId: m.id, mineLine: m.line,
      });
    });
    return rows;
  }

  // 対応表 1 回分。状態と遷移をこの順で作る (遷移は状態の対応に依存する)。
  function build(refParsed, mineParsed) {
    var states = mapStates(refParsed, mineParsed);
    var transitions = mapTransitions(refParsed, mineParsed, states);
    return { states: states, transitions: transitions };
  }

  function _count(rows, match) {
    return (rows || []).filter(function(r) { return r.match === match; }).length;
  }

  // 見出し。人が最初に知りたいのは「片方にしか無いものが何件あるか」なので、
  // それを先に出す。0 件なら「対応が全部付いた」と言い切る。
  function summary(map) {
    var rows = ((map && map.states) || []).concat((map && map.transitions) || []);
    if (rows.length === 0) return '状態遷移が読めません';
    var refOnly = _count(rows, 'ref-only');
    var mineOnly = _count(rows, 'mine-only');
    var exact = _count(rows, 'exact');
    var partial = _count(rows, 'partial');
    if (refOnly === 0 && mineOnly === 0) {
      return '片方だけ 0 件 (一致 ' + exact + ' / 部分一致 ' + partial + ')';
    }
    return '参照図だけ ' + refOnly + ' / 自分だけ ' + mineOnly
      + ' (一致 ' + exact + ' / 部分一致 ' + partial + ')';
  }

  // 抽象度が違いすぎて対応が取れない状態を、行き詰まる前に言う。
  // 対応が付いた組が状態の半分に満たなければ、名前で突き合わせても意味がない。
  function abstractionWarning(map) {
    var states = (map && map.states) || [];
    if (states.length === 0) return '';
    var paired = _count(states, 'exact') + _count(states, 'partial');
    if (paired * 2 >= states.length) return '';
    return '状態名の対応が ' + paired + '/' + states.length
      + ' しか付きません。抽象度が違う図どうしの可能性があります';
  }

  var MATCH_LABEL = {
    'exact': '一致',
    'partial': '部分一致',
    'ref-only': '参照図だけ',
    'mine-only': '自分だけ',
  };

  function matchLabel(match) { return MATCH_LABEL[match] || String(match || ''); }

  return {
    normalize: normalize,
    words: words,
    editDistance: editDistance,
    score: score,
    stateName: stateName,
    transitionName: transitionName,
    mapStates: mapStates,
    mapTransitions: mapTransitions,
    build: build,
    summary: summary,
    abstractionWarning: abstractionWarning,
    matchLabel: matchLabel,
  };
})();
