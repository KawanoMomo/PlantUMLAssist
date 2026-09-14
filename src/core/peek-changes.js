'use strict';
window.MA = window.MA || {};

// peek-changes — 覗いているフォルダ (先輩の保存先) の図が、前回保存から
// 何を足され何を消されたかを、開く前に一覧の行で言う。
//
// BLK-junior-20260914-1306-wish: 「先輩の図の変更を自分の図に取り込む」場面では、
// 先輩の 1 枚が前回保存からどこを変えたかが要る。今の 👀他フォルダは名前・図種・
// SVG の印しか出さないので、複合図 (driver_common_class 等) を丸ごと開いて
// 目で差分を探すことになり、変更の無い図まで開いて見比べる往復が残る。
// server は上書きの直前に `_versions/` へ控えを取っているので、材料は足元にある。
// 要るのは「行ごとに ＋部品 −関係 を出し、変更のある図だけに絞る」判断だけ。
//
// 版どうしの行差分は version-diff が持っているが、取り込む側が読みたいのは
// 行ではなく部品・関係なので、突き合わせの粒度は cross-ref-diff と同じ
// outline の節に合わせる (同じ「要素」の数え方を 2 つ作らない)。
//
// ここに置くのは純関数だけ。fetch も DOM も触らない (読み込みと描画は app.js)。
window.MA.peekChanges = (function() {

  function _s(v) { return v == null ? '' : String(v); }
  function _list(v) { return Array.isArray(v) ? v : []; }

  // 骨組みは「変わった要素」に数えない (cross-ref-diff の SKIP_KINDS と同じ)。
  // title・ブロックの開き閉じ・ライフラインの帯が動いただけの図を
  // 「先輩が直した」と名指しすると、開く図が減らない。
  var SKIP_KINDS = { title: true, block: true, lifeline: true };

  // 関係と、それ以外 (部品)。取り込む側は「部品が増えたのか、つなぎ方が
  // 変わったのか」で手の動かし方が変わるので、数は分けて出す。
  function group(kind) { return kind === 'relation' ? 'relation' : 'part'; }

  var KIND_SEP = '\n';

  function keyOf(node) {
    return [_s(node && node.kind), _norm(node && node.label), _norm(node && node.detail)].join(KIND_SEP);
  }

  function _norm(v) { return _s(v).replace(/\s+/g, ' ').trim().toLowerCase(); }

  function elements(dsl) {
    if (!window.MA.outline || !window.MA.outline.build) return [];
    var built = window.MA.outline.build(_s(dsl));
    var list = (built && built.nodes) || built || [];
    var raw = _s(dsl).split('\n');
    return (Array.isArray(list) ? list : []).filter(function(n) {
      return n && !SKIP_KINDS[n.kind];
    }).map(function(n) {
      return {
        kind: n.kind,
        group: group(n.kind),
        label: _s(n.label),
        detail: _s(n.detail),
        line: (n.line || 0) + 1,
        text: _s(raw[n.line]).trim(),
        key: keyOf(n),
      };
    });
  }

  // 刻印の見え方は 🕘履歴 (version-history) に合わせる。同じ控えを
  // 一覧と履歴で 2 通りの時刻で出すと、同じ版だと気付けない。
  function stampLabel(stamp) {
    var VH = window.MA.versionHistory || window.MA.versionDiff;
    return VH && VH.label ? VH.label(stamp) : _s(stamp);
  }

  // 1 枚の判定。
  //   no-prev — 控えがまだ無い (このフォルダで初めての保存)。前回が無いので比べない
  //   same    — 前回保存から部品も関係も動いていない (整形・題だけの差を含む)
  //   changed — 足された / 消された要素がある
  // entry は { name, text, prevText, prevStamp }。prevText が無ければ no-prev。
  function compare(entry) {
    var e = entry || {};
    var row = {
      name: _s(e.name),
      stamp: _s(e.prevStamp),
      stampLabel: stampLabel(e.prevStamp),
      added: [],
      removed: [],
      kept: 0,
      addedParts: 0, addedRelations: 0,
      removedParts: 0, removedRelations: 0,
      verdict: 'no-prev',
    };
    if (e.prevText == null || _s(e.prevText) === '') return row;
    var before = elements(e.prevText);
    var after = elements(e.text);
    var beforeKeys = {}, afterKeys = {};
    before.forEach(function(n) { beforeKeys[n.key] = true; });
    after.forEach(function(n) { afterKeys[n.key] = true; });
    after.forEach(function(n) {
      if (beforeKeys[n.key]) row.kept++;
      else row.added.push(n);
    });
    before.forEach(function(n) {
      if (!afterKeys[n.key]) row.removed.push(n);
    });
    row.added.forEach(function(n) {
      if (n.group === 'relation') row.addedRelations++; else row.addedParts++;
    });
    row.removed.forEach(function(n) {
      if (n.group === 'relation') row.removedRelations++; else row.removedParts++;
    });
    row.verdict = (row.added.length || row.removed.length) ? 'changed' : 'same';
    return row;
  }

  // 行に出す印。変更のある図だけを開けるように、数はここで言い切る
  // (「差分あり」とだけ出すと、どれから開くかを決めるのに結局開くことになる)。
  var VERDICT_LABEL = {
    'no-prev': '前回保存なし',
    same: '変更なし',
    changed: '変更あり',
  };

  function rowBadge(row) {
    if (!row) return null;
    if (row.verdict === 'no-prev') {
      return { verdict: 'no-prev', text: '初', changed: false,
               title: 'この図はこのフォルダで 1 回しか保存されていません（比べる前回がありません）' };
    }
    if (row.verdict === 'same') {
      return { verdict: 'same', text: '＝', changed: false,
               title: row.stampLabel + ' の版から部品・関係は変わっていません' };
    }
    var parts = [];
    if (row.added.length) parts.push('＋' + row.added.length);
    if (row.removed.length) parts.push('−' + row.removed.length);
    return {
      verdict: 'changed',
      text: parts.join(' '),
      changed: true,
      title: row.stampLabel + ' の版から '
        + '部品 ＋' + row.addedParts + ' −' + row.removedParts
        + ' / 関係 ＋' + row.addedRelations + ' −' + row.removedRelations,
    };
  }

  // 変更のある図を先に、次に控えの無い図、最後に変更なし。同じ組は名前順。
  // 取り込む順がそのまま一覧の並びになるようにする。
  var ORDER = { changed: 0, 'no-prev': 1, same: 2 };

  function rank(verdict) {
    var v = ORDER[verdict];
    return typeof v === 'number' ? v : 9;
  }

  // entries は listFolder の entries (name / text / prevText / prevStamp)。
  function report(entries) {
    var rows = _list(entries).filter(function(e) { return e && _s(e.name); }).map(compare);
    var counts = { changed: 0, same: 0, 'no-prev': 0 };
    rows.forEach(function(r) { counts[r.verdict] = (counts[r.verdict] || 0) + 1; });
    var sorted = rows.slice().sort(function(a, b) {
      var d = rank(a.verdict) - rank(b.verdict);
      if (d !== 0) return d;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    return {
      rows: rows,
      sorted: sorted,
      counts: counts,
      total: rows.length,
      changed: rows.filter(function(r) { return r.verdict === 'changed'; })
        .map(function(r) { return r.name; }).sort(),
    };
  }

  function find(rep, name) {
    var rows = (rep && rep.rows) || [];
    var n = _s(name);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].name === n) return rows[i];
    }
    return null;
  }

  // 一覧の見出しの 1 行。開く前に「何枚開けば済むか」を言う。
  function summary(rep) {
    if (!rep || !rep.total) return '';
    var c = rep.counts;
    if (!c.changed) {
      return '前回保存から変わった図はありません（' + rep.total + ' 枚）';
    }
    var tail = [];
    if (c.same) tail.push('変更なし ' + c.same);
    if (c['no-prev']) tail.push('前回保存なし ' + c['no-prev']);
    return rep.total + ' 枚中 ' + c.changed + ' 枚が前回保存から変わっています'
      + (tail.length ? '（' + tail.join(' / ') + '）' : '');
  }

  function hasChanges(rep) { return !!(rep && rep.counts && rep.counts.changed); }

  // 「変更のある図だけ」の絞り込みボタンの見え方。押せないときは理由を出す。
  function filterLabel(rep, on) {
    var n = (rep && rep.counts && rep.counts.changed) || 0;
    if (!n) return '変更のある図はありません';
    return on ? '全部の図を出す（' + (rep.total | 0) + ' 枚）' : '変更のある図だけ（' + n + ' 枚）';
  }

  // 絞り込みを効かせた後に一覧へ並べる名前。順は report.sorted のまま
  // (変更のある図が上に来る)。
  function visibleNames(rep, on) {
    var sorted = (rep && rep.sorted) || [];
    if (!sorted.length) return null;   // 判定材料が無いときは呼び出し側の順を使う
    return sorted.filter(function(r) {
      return !on || r.verdict === 'changed';
    }).map(function(r) { return r.name; });
  }

  // 選んだ 1 枚の内訳。開いた図のどこを自分の図へ写すかを、本文を読まずに拾える。
  function detailLines(row, max) {
    if (!row || row.verdict !== 'changed') return [];
    var cap = typeof max === 'number' ? max : 8;
    var out = [];
    row.added.forEach(function(n) { out.push({ sign: '+', group: n.group, line: n.line, text: n.text }); });
    row.removed.forEach(function(n) { out.push({ sign: '-', group: n.group, line: n.line, text: n.text }); });
    return cap > 0 ? out.slice(0, cap) : out;
  }

  function detailNotice(row) {
    if (!row) return '';
    if (row.verdict === 'no-prev') return VERDICT_LABEL['no-prev'] + '（比べる版がありません）';
    if (row.verdict === 'same') return row.stampLabel + ' の版から変わっていません';
    return row.stampLabel + ' の版との差分: 部品 ＋' + row.addedParts + ' −' + row.removedParts
      + ' / 関係 ＋' + row.addedRelations + ' −' + row.removedRelations;
  }

  var api = {
    SKIP_KINDS: SKIP_KINDS, VERDICT_LABEL: VERDICT_LABEL,
    group: group, keyOf: keyOf, elements: elements, stampLabel: stampLabel,
    compare: compare, report: report, find: find, rowBadge: rowBadge, rank: rank,
    summary: summary, hasChanges: hasChanges, filterLabel: filterLabel,
    visibleNames: visibleNames, detailLines: detailLines, detailNotice: detailNotice,
  };

  return api;
})();
