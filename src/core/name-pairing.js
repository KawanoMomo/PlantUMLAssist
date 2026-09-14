'use strict';
window.MA = window.MA || {};

// name-pairing — 2 つのフォルダの部品名を「対応する組」に並べ、表記揺れだけを残す。
//
// BLK-reviewer-20260914-1706-wish: 突合 (domain-cohort) は片方にしか無い名前を
// 「primary だけ / junior だけ」の 2 列に出すところまでで、`IRQCtrl` と `Irq_Ctrl` が
// 同じ部品の別表記であることは読む側が目で結び直していた。reviewer は
// `tools/audit.js -p a,b` で件数を得た後、どの名前がどの名前に対応するかを
// grep で探していた。ここは「片方にしかない 2 列」を 1 つの対応表にする。
//
// 判定は 3 段:
//   variant — 記号と大小を落とすと同じ (IRQCtrl ⇔ Irq_Ctrl)。直し方が「綴りを揃える」で決まる
//   similar — 頭が 4 文字以上そろっている (Spi_Driver ⇔ SpiDrv)。別物かもしれないので要確認
//   only    — 相手がいない。図そのものの過不足なので綴りの問題ではない
window.MA.namePairing = (function() {

  var MIN_PREFIX = 4;   // 「似ている」と言ってよい頭の一致長

  function _s(v) { return v == null ? '' : String(v); }

  // 記号と大小を落とした形。表記揺れの判定はこれが同じかどうかだけで決める。
  function normalize(name) {
    return _s(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function _prefixLen(a, b) {
    var n = Math.min(a.length, b.length);
    var i = 0;
    while (i < n && a.charAt(i) === b.charAt(i)) i++;
    return i;
  }

  // onlyA × onlyB を 1 対 1 で結ぶ。1 つの名前を 2 度使わない
  // (使うと「片方にしかない」が消え、過不足が見えなくなる)。
  function _match(onlyA, onlyB) {
    var rest = (onlyB || []).map(_s);
    var rows = [];
    (onlyA || []).map(_s).forEach(function(a) {
      var na = normalize(a);
      var bestAt = -1, bestKind = '', bestScore = -1;
      for (var i = 0; i < rest.length; i++) {
        var nb = normalize(rest[i]);
        if (na && na === nb) { bestAt = i; bestKind = 'variant'; bestScore = 999; break; }
        var p = _prefixLen(na, nb);
        if (p >= MIN_PREFIX && p > bestScore) { bestAt = i; bestKind = 'similar'; bestScore = p; }
      }
      if (bestAt < 0) { rows.push({ a: a, b: '', kind: 'onlyA' }); return; }
      rows.push({ a: a, b: rest[bestAt], kind: bestKind });
      rest.splice(bestAt, 1);
    });
    rest.forEach(function(b) { rows.push({ a: '', b: b, kind: 'onlyB' }); });
    return rows;
  }

  // 対応表。part は domain-cohort の diff.names / diff.labels ({both, onlyA, onlyB})。
  // 揃っている名前 (both) は表の最後に置く —— 読む目的は揺れている行なので、
  // 揃っている行が先頭に並ぶと、また目で探すことになる。
  function table(part, aLabel, bLabel) {
    var p = part || {};
    var rows = _match(p.onlyA, p.onlyB);
    var order = { variant: 0, similar: 1, onlyA: 2, onlyB: 3, same: 4 };
    (p.both || []).forEach(function(n) {
      // domain-cohort は記号と大小を落とした鍵で突き合わせるので、綴りが割れている
      // 組は `IRQCtrl / Irq_Ctrl` の 1 つの値として「一致」側に入っている。
      // 一致の列に混ざったままでは、揺れているのに揃っているように読める。
      var v = _s(n);
      var at = v.indexOf(' / ');
      if (at > 0) {
        rows.push({ a: v.slice(0, at), b: v.slice(at + 3), kind: 'variant' });
        return;
      }
      rows.push({ a: v, b: v, kind: 'same' });
    });
    rows.sort(function(x, y) {
      if (order[x.kind] !== order[y.kind]) return order[x.kind] - order[y.kind];
      return (x.a || x.b).toLowerCase() < (y.a || y.b).toLowerCase() ? -1 : 1;
    });
    rows.forEach(function(r) {
      r.note = noteOf(r, aLabel, bLabel);
      r.mismatch = (r.kind === 'variant' || r.kind === 'similar');
    });
    return {
      rows: rows,
      aLabel: _s(aLabel), bLabel: _s(bLabel),
      variants: rows.filter(function(r) { return r.kind === 'variant'; }).length,
      similar: rows.filter(function(r) { return r.kind === 'similar'; }).length,
      only: rows.filter(function(r) { return r.kind === 'onlyA' || r.kind === 'onlyB'; }).length,
      same: rows.filter(function(r) { return r.kind === 'same'; }).length,
    };
  }

  function noteOf(row, aLabel, bLabel) {
    var r = row || {};
    if (r.kind === 'variant') return '表記揺れ（同じ部品の別表記）';
    if (r.kind === 'similar') return '似ている（別物かどうか要確認）';
    if (r.kind === 'onlyA') return _s(aLabel) + ' だけにある';
    if (r.kind === 'onlyB') return _s(bLabel) + ' だけにある';
    return '一致';
  }

  // 表の上に出す 1 行。0 件のときも母数を出す (何を見ての 0 件かが分かるように)。
  function summaryLine(t) {
    var r = t || {};
    return '部品名: 表記揺れ ' + (r.variants || 0) + ' / 似ている ' + (r.similar || 0)
      + ' / 片方だけ ' + (r.only || 0) + ' / 一致 ' + (r.same || 0);
  }

  // 揺れている行だけ。画面は既定でこれを出す。
  function mismatchRows(t) {
    return ((t && t.rows) || []).filter(function(r) { return r.mismatch; });
  }

  return {
    MIN_PREFIX: MIN_PREFIX,
    normalize: normalize,
    table: table,
    noteOf: noteOf,
    summaryLine: summaryLine,
    mismatchRows: mismatchRows,
  };
})();
