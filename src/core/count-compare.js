'use strict';
window.MA = window.MA || {};

// count-compare — 開いている図と参照図で「同じ形か」を数で突き合わせる。
//
// 先輩の図を真似て作るとき、構造 (Outline) タブは開いている 1 枚の内訳しか
// 出さないので、先輩の図と自分の図をタブで開き直して指で数え直すことになる。
// 数える規則は outline.build が 1 本で持っているので、ここは
// 「2 つの counts を並べて差を言う」ことだけを受け持つ。
//
// 語彙は図種で変わる (class 図なら classes / relations、state 図なら
// states / transitions)。outline.countTerms から受け取り、同じ語で差を言う。
window.MA.countCompare = (function() {

  function _n(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }

  function _plural(term, n) {
    return n + ' ' + (n === 1 ? term.one : term.many);
  }

  // 図種が違う 2 枚は数える語彙そのものが違うので、数を比べても意味がない。
  // 「比べられない」と言い切って、黙って別の語彙で並べない。
  function compare(selfCounts, refCounts, diagramType, refDiagramType) {
    var terms = (window.MA.outline && window.MA.outline.countTerms)
      ? window.MA.outline.countTerms(diagramType)
      : [{ key: 'elements', one: 'element', many: 'elements' },
         { key: 'relations', one: 'relation', many: 'relations' }];

    if (refDiagramType != null && String(refDiagramType) !== String(diagramType)) {
      return {
        comparable: false, same: false, rows: [],
        message: '図種が違うので数を比べられません (' + _short(diagramType) + ' と ' + _short(refDiagramType) + ')',
      };
    }

    var s = selfCounts || {}, r = refCounts || {};
    var rows = terms.map(function(t) {
      var sv = _n(s[t.key]), rv = _n(r[t.key]);
      return { key: t.key, one: t.one, many: t.many, self: sv, ref: rv, delta: sv - rv };
    });
    var diff = rows.filter(function(row) { return row.delta !== 0; });
    return {
      comparable: true,
      same: diff.length === 0,
      rows: rows,
      message: diff.length === 0 ? _sameMessage(rows) : _diffMessage(diff),
    };
  }

  function _short(t) { return String(t == null ? '' : t).replace('plantuml-', '') || '不明'; }

  function _sameMessage(rows) {
    return '同じ形です (' + rows.map(function(row) { return _plural(row, row.self); }).join(' · ') + ')';
  }

  // 「1 本足りません / 2 つ多いです」まで言う。数だけ並べると、どちらが
  // 多いのかを読む側がもう一度引き算することになる。
  function _diffMessage(diff) {
    return diff.map(function(row) {
      var n = Math.abs(row.delta);
      var unit = (n === 1 ? row.one : row.many);
      return row.delta < 0
        ? unit + ' が ' + n + ' 足りません (自分 ' + row.self + ' / 参照 ' + row.ref + ')'
        : unit + ' が ' + n + ' 多いです (自分 ' + row.self + ' / 参照 ' + row.ref + ')';
    }).join(' · ');
  }

  // 画面の一行。同じなら ✓、違えば ⚠ を頭に付ける。
  function label(result) {
    if (!result) return '';
    if (!result.comparable) return '— ' + result.message;
    return (result.same ? '✓ ' : '⚠ ') + result.message;
  }

  // DSL 2 本から直接。UI はこれ 1 本で済む。
  function compareDsl(selfDsl, refDsl, diagramType, refDiagramType) {
    var ol = window.MA.outline;
    if (!ol) return compare({}, {}, diagramType, refDiagramType);
    return compare(
      ol.build(selfDsl || '').counts,
      ol.build(refDsl || '').counts,
      diagramType, refDiagramType);
  }

  return {
    compare: compare,
    compareDsl: compareDsl,
    label: label,
  };
})();
