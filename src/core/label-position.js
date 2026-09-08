'use strict';

// label-position — 遷移ラベルが「対応するシーケンスのメッセージの何番目」を
// 指しているかを系統横断で並べる。
//
// BLK-reviewer-20260908-1703-wish: ラベル突合 (trace-label-table) は
// 「そのラベルが実在するメッセージか」までしか見ない。実在していても、
// 系統ごとに指している位置が違うこと (他系統は「シーケンス冒頭のエントリ
// 呼び出し名」をラベルにしているのに dma だけ「末尾の内部呼び出し名」を
// 使っている) は、実在チェックでは一致と出るため見つからない。
// 見つけるには 9 系統 × 2 図を開いて「ラベルが何番目のメッセージか」を
// 目で数えるしかなかった。
//
// ここは系統ごとに「遷移ラベル → 対応メッセージの位置 (先頭 / 中間 / 末尾)」を
// 数え、多数派の位置をその系統の慣習とし、他系統の慣習からズレた系統を上に置く。
// 突合そのものは trace-coverage の職掌。DOM にもサーバにも触らない。
// node からも require できる。
(function() {

  // 位置の種類。single は「メッセージが 1 件しかない」で、先頭とも末尾とも
  // 言えないので慣習の投票からは外す (1 件の図で慣習を決めない)。
  var POSITIONS = ['head', 'middle', 'tail'];

  var POSITION_LABEL = {
    head: '先頭',
    middle: '中間',
    tail: '末尾',
    single: '単独',
  };

  function _s(v) { return v == null ? '' : String(v); }
  function _list(v) { return Array.isArray(v) ? v : []; }
  function _fa() { return (typeof window !== 'undefined' && window.MA && window.MA.familyAudit) || null; }

  // メッセージが何番目か → 位置。両端だけを名前で呼び、間は全部「中間」。
  // 「2 番目」まで数えて比べても系統ごとにメッセージ数が違うので揃わない。
  function positionOf(index, total) {
    if (!(total > 0) || !(index >= 0) || index >= total) return '';
    if (total === 1) return 'single';
    if (index === 0) return 'head';
    if (index === total - 1) return 'tail';
    return 'middle';
  }

  function positionLabel(pos) { return POSITION_LABEL[pos] || ''; }

  // 系統のシーケンス図 1 枚ぶんのメッセージ列 (書かれた順・重複は畳む)。
  function _messagesOf(doc) {
    var fa = _fa();
    if (!fa) return [];
    return fa.actionsOf(_s(doc && doc.dsl));
  }

  // 多数決。同数なら先頭 → 中間 → 末尾 の順で選ぶ (順番を決めておかないと
  // 同じ入力で慣習がぶれ、ズレの判定が run ごとに変わる)。
  function majority(counts) {
    var c = counts || {};
    var best = '', n = 0;
    POSITIONS.forEach(function(p) {
      if ((c[p] || 0) > n) { best = p; n = c[p] || 0; }
    });
    return best;
  }

  // 系統 1 つ。family は trace-coverage.coverFamily() の結果。
  function familyRow(family) {
    var f = family || {};
    var docs = _list(f.docs);
    var msgsOf = {};
    docs.forEach(function(d) {
      if (_s(d.kind) !== 'sequence') return;
      msgsOf[_s(d.name)] = _messagesOf(d);
    });

    var fa = _fa();
    var entries = [];
    var counts = { head: 0, middle: 0, tail: 0, single: 0 };

    _list(f.rows).forEach(function(r) {
      // 対応が付いた行だけを見る。対応が無いラベル (架空名) の位置は
      // そもそも決まらないし、それは trace-label-table の職掌。
      if (r.status !== 'covered' && r.status !== 'partial') return;
      var m = _list(r.matched)[0];
      if (!m) return;
      var docName = _s(m.doc);
      var msgs = msgsOf[docName] || [];
      var key = fa ? fa.normalizeAction(m.name) : '';
      var idx = -1;
      for (var i = 0; i < msgs.length; i++) {
        if (msgs[i].key === key) { idx = i; break; }
      }
      var pos = positionOf(idx, msgs.length);
      if (!pos) return;
      if (counts[pos] != null) counts[pos]++;
      entries.push({
        docId: r.docId, docName: _s(r.docName), line: r.line || 0,
        from: _s(r.from), to: _s(r.to), label: _s(r.label),
        message: _s(m.name), messageDoc: docName,
        index: idx, ordinal: idx + 1, total: msgs.length,
        position: pos, positionLabel: positionLabel(pos),
        status: _s(r.status),
      });
    });

    var convention = majority(counts);
    return {
      key: _s(f.key),
      entries: entries,
      counts: counts,
      matched: entries.length,
      convention: convention,
      conventionLabel: positionLabel(convention),
      // ラベルの位置が系統内で割れているか (慣習が 1 つに決まらない)。
      mixed: POSITIONS.filter(function(p) { return counts[p] > 0; }).length > 1,
      // 慣習を言えない理由。黙って空欄にすると「ズレなし」と読めてしまう。
      reason: convention ? '' : (entries.length
        ? 'メッセージが 1 件のシーケンスとしか対応していません'
        : (_list(f.seqDocs).length
          ? '対応の付いた遷移ラベルがありません'
          : 'この系統にシーケンス図がありません')),
    };
  }

  // 系統横断。多数派の慣習を求め、そこからズレた系統を上に置く。
  // families: trace-coverage.audit() の結果。
  function rank(families) {
    var rows = _list(families).map(familyRow);

    // 慣習の多数決は系統 1 つにつき 1 票 (遷移の多い系統に引きずられない)。
    var votes = { head: 0, middle: 0, tail: 0 };
    rows.forEach(function(r) {
      if (r.convention && votes[r.convention] != null) votes[r.convention]++;
    });
    var common = majority(votes);
    // 慣習を持つ系統が 1 つしか無ければ「多数派」とは呼ばない
    // (比べる相手が居ないのに、その 1 つを基準にして他をズレと言わない)。
    var voters = 0;
    POSITIONS.forEach(function(p) { voters += votes[p] || 0; });
    if (voters < 2) common = '';

    rows.forEach(function(r, i) {
      r.odd = !!(common && r.convention && r.convention !== common);
      r.commonLabel = positionLabel(common);
      r.entries.forEach(function(e) {
        e.odd = !!(common && POSITIONS.indexOf(e.position) >= 0 && e.position !== common);
      });
      r._i = i;
    });
    rows.sort(function(a, b) {
      if (a.odd !== b.odd) return a.odd ? -1 : 1;
      return a._i - b._i;
    });
    rows.forEach(function(r) { delete r._i; });

    return {
      rows: rows,
      votes: votes,
      common: common,
      commonLabel: positionLabel(common),
      odd: rows.filter(function(r) { return r.odd; }),
    };
  }

  // 系統 1 行ぶんの「位置」欄の文言。内訳まで出す (「末尾」とだけ書くと、
  // 全部が末尾なのか 1 件だけ末尾なのかが読めない)。
  function positionText(row) {
    var r = row || {};
    if (!r.convention) return r.reason || '';
    var parts = [];
    POSITIONS.forEach(function(p) {
      if (r.counts[p]) parts.push(positionLabel(p) + ' ' + r.counts[p]);
    });
    if (r.counts.single) parts.push(POSITION_LABEL.single + ' ' + r.counts.single);
    return positionLabel(r.convention) + '（' + parts.join(' / ') + '）';
  }

  function summaryLine(result) {
    var t = result || { rows: [], odd: [] };
    var rows = _list(t.rows);
    if (!rows.length) return '状態遷移図を持つ系統がありません';
    var known = rows.filter(function(r) { return r.convention; });
    if (!known.length) return 'ラベルとメッセージの対応が付いた系統がありません';
    if (!t.common) {
      return '慣習を比べられる系統が ' + known.length + ' 件しかありません';
    }
    if (!_list(t.odd).length) {
      return known.length + ' 系統とも遷移ラベルは' + positionLabel(t.common)
        + 'のメッセージを指しています';
    }
    return '他系統の慣習（' + positionLabel(t.common) + '）とズレた系統 '
      + _list(t.odd).length + ' 件 / ' + known.length + ' 件';
  }

  var api = {
    POSITIONS: POSITIONS, POSITION_LABEL: POSITION_LABEL,
    positionOf: positionOf, positionLabel: positionLabel, majority: majority,
    familyRow: familyRow, rank: rank,
    positionText: positionText, summaryLine: summaryLine,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.labelPosition = api;
  }
})();
