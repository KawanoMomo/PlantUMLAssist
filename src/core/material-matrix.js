'use strict';
window.MA = window.MA || {};

// material-matrix — 資料化の残りを部品をまたいで 1 枚に出す。
//
// BLK-junior-20260914-2006-wish: 「1 枚を資料化…」は部品を 1 つ選んで初めて
// 図種の残りが見える作りなので、GPIO が 5/6 済みで TIMER が丸ごと未着手でも、
// 部品欄を選び直すまでそれが分からない。縦に部品・横に図種の表にすれば、
// どの部品のどの図種から資料化すべきかがプルダウンを往復せずに読める。
//
// 状態の決めかた (未 / 古 / 済) は materialBoard が持つ —— ここは持たない。
// 1 部品の表とこの表で「資料用なし」の判定がずれると、表を見て選んだ図種が
// 開いたら最新だった、が起きる。DOM・fetch には触らない。
window.MA.materialMatrix = (function() {

  function _s(v) { return v == null ? '' : String(v); }
  function _MB() { return window.MA.materialBoard; }
  function _CP() { return window.MA.componentPack; }

  // セルは 1 文字。言葉は行の title と凡例が持つ (表を狭く保つ)。
  var CELL_MARKS = { none: '未', stale: '古', fresh: '済' };

  function cellMark(cell) {
    return (cell && CELL_MARKS[cell.status]) || '';
  }

  function _kindRank(kind) {
    var cp = _CP();
    var order = (cp && cp.KIND_ORDER) ? cp.KIND_ORDER : [];
    var at = order.indexOf(_s(kind));
    return at < 0 ? order.length : at;
  }

  // 出す図種は「どこかの部品に元の図がある」ものだけ。6 図種を常に並べると、
  // 誰も持っていない図種の列が表の幅を食って肝心の残りが読みにくくなる。
  function kinds(entries) {
    var MB = _MB();
    if (!MB) return [];
    var seen = {};
    MB.components(entries).forEach(function(g) {
      MB.rows(entries, g.component).forEach(function(r) { seen[r.kind] = true; });
    });
    return Object.keys(seen).sort(function(a, b) {
      var d = _kindRank(a) - _kindRank(b);
      return d !== 0 ? d : (a < b ? -1 : (a > b ? 1 : 0));
    });
  }

  // scan — 部品 × 図種の表。残りの多い部品を上に出す (次に着手する順)。
  // 元の図が無い図種は空のセルにする (資料化しようがない ＝ 未着手ではない)。
  function scan(entries) {
    var MB = _MB();
    if (!MB) return { kinds: [], rows: [], counts: { none: 0, stale: 0, fresh: 0 }, todo: 0, componentsTodo: 0 };
    var ks = kinds(entries);
    var rows = MB.components(entries).map(function(g) {
      var byKind = {};
      MB.rows(entries, g.component).forEach(function(r) { byKind[r.kind] = r; });
      var cells = ks.map(function(k) {
        var r = byKind[k];
        if (!r) return { kind: k, status: '', mark: '', row: null, todo: false, absent: true };
        return {
          kind: k,
          status: r.status,
          mark: CELL_MARKS[r.status] || '',
          row: r,
          todo: r.needsWork,
          absent: false,
        };
      });
      var counts = { none: 0, stale: 0, fresh: 0 };
      cells.forEach(function(c) { if (!c.absent) counts[c.status]++; });
      return {
        component: g.component,
        cells: cells,
        counts: counts,
        total: cells.filter(function(c) { return !c.absent; }).length,
        todo: cells.filter(function(c) { return c.todo; }).length,
      };
    });
    rows.sort(function(a, b) {
      if (b.todo !== a.todo) return b.todo - a.todo;
      return a.component < b.component ? -1 : (a.component > b.component ? 1 : 0);
    });
    var counts = { none: 0, stale: 0, fresh: 0 };
    rows.forEach(function(r) {
      counts.none += r.counts.none; counts.stale += r.counts.stale; counts.fresh += r.counts.fresh;
    });
    return {
      kinds: ks,
      rows: rows,
      counts: counts,
      todo: rows.reduce(function(n, r) { return n + r.todo; }, 0),
      componentsTodo: rows.filter(function(r) { return r.todo > 0; }).length,
    };
  }

  // 見出しの 1 行。残りが何件・何部品かを、表を数える前に言う。
  function summaryText(sc) {
    var MB = _MB();
    if (!sc || !sc.rows.length) {
      return MB ? '保存フォルダに資料化できる図がありません。' : '';
    }
    var c = sc.counts;
    return sc.rows.length + ' 部品 × ' + sc.kinds.length + ' 図種: 残り ' + sc.todo
      + ' 件 / ' + sc.componentsTodo + ' 部品（資料用なし ' + c.none
      + '・元が新しい ' + c.stale + '・最新 ' + c.fresh + '）';
  }

  // 1 部品の行の説明。表の左端を読むだけで、その部品に手を付けるべきか分かる。
  function rowText(row) {
    if (!row) return '';
    if (!row.total) return row.component + ': 資料化できる図がありません';
    if (!row.todo) return row.component + ': ' + row.total + ' 図種すべて最新です';
    return row.component + ': ' + row.total + ' 図種のうち ' + row.todo + ' 図種の資料化が要ります'
      + '（資料用なし ' + row.counts.none + '・元が新しい ' + row.counts.stale + '）';
  }

  // 1 マスの説明。押す前に何が起きるかを読ませる。
  function cellText(component, cell) {
    var MB = _MB();
    if (!cell) return '';
    if (cell.absent) return _s(component) + ' に ' + cell.kind + 'はありません';
    var head = _s(component) + ' / ' + cell.kind + ' — ';
    return head + (MB ? MB.rowText(cell.row) : cell.status);
  }

  // 次に着手する 1 マス。資料用なし → 元が新しい の順に、表の上から探す。
  function nextCell(sc) {
    var ORDER = ['none', 'stale'];
    for (var i = 0; i < ORDER.length; i++) {
      for (var r = 0; r < ((sc && sc.rows) || []).length; r++) {
        var row = sc.rows[r];
        for (var c = 0; c < row.cells.length; c++) {
          if (row.cells[c].status === ORDER[i]) {
            return { component: row.component, kind: row.cells[c].kind, cell: row.cells[c] };
          }
        }
      }
    }
    return null;
  }

  function legend() {
    return ['未 資料用なし', '古 元が新しい', '済 最新'].join(' / ');
  }

  return {
    CELL_MARKS: CELL_MARKS,
    cellMark: cellMark,
    kinds: kinds,
    scan: scan,
    summaryText: summaryText,
    rowText: rowText,
    cellText: cellText,
    nextCell: nextCell,
    legend: legend,
  };
})();
