'use strict';
window.MA = window.MA || {};

// blame-point — 部品名がどの版で入り込んだか (混入点) を時系列に並べる。
//
// BLK-primary-20260915-0506-wish: 不具合対応は「この名前がいつから入ったか」から
// 始まるのに、📂一覧の「履歴N」は 1 枚の図の版を 1 つずつ開くことしかできない。
// 混入点を当てるには開いた版の中身を前の版と目で見比べる必要があり、開く回数が
// 「図の枚数 × 版数」で増えて、不具合対応そのものが版の総当たり読みになっていた。
//
// server (/version-search) が全図・全版から「語が当たった行」だけを抜いて返すので、
// ここはその並びを版と版で突き合わせて
//   ・出現数が変わった版 (増えた = 混入、減った = 消滅)
//   ・そこで足された行・消えた行
//   ・2 語以上が同時に居る版 (表記の混在が始まった点)
// に直す。図をまたいで 1 本の時系列にするのもここ。DOM も fetch も触らない。
window.MA.blamePoint = (function() {

  function _s(v) { return v == null ? '' : String(v); }
  function _list(v) { return Array.isArray(v) ? v : []; }

  // 語は空白区切り。同じ語を 2 回書いても 1 語として扱う (数が二重に出ないため)。
  function terms(raw) {
    var out = [], seen = {};
    var parts = _s(raw).split(/\s+/);
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i];
      if (!t || seen[t]) continue;
      seen[t] = true;
      out.push(t);
    }
    return out;
  }

  // 版の見出し。current の版は刻印を持たない (まだ控えになっていない今の中身)。
  function stampLabel(v) {
    if (v && v.current) return 'いま';
    var VH = window.MA.versionHistory;
    var st = _s(v && v.stamp);
    return VH ? VH.label(st) : st;
  }

  function countsOf(v, n) {
    var c = _list(v && v.counts).slice(0, n);
    while (c.length < n) c.push(0);
    for (var i = 0; i < c.length; i++) c[i] = typeof c[i] === 'number' ? c[i] : 0;
    return c;
  }

  function linesOf(v) {
    var out = [];
    _list(v && v.lines).forEach(function(l) {
      out.push({ no: (l && typeof l.no === 'number') ? l.no : 0, text: _s(l && l.text) });
    });
    return out;
  }

  // 行の増減。行番号は版が変われば動くので、突き合わせは本文で行う
  // (「1 行足して全部の行番号が 1 ずれた」を全行の変更として出さないため)。
  function lineDelta(before, after) {
    var i, key;
    function bag(rows) {
      var m = {};
      for (var j = 0; j < rows.length; j++) {
        var k = rows[j].text.trim();
        m[k] = (m[k] || 0) + 1;
      }
      return m;
    }
    var was = bag(before), now = bag(after);
    var added = [];
    for (i = 0; i < after.length; i++) {
      key = after[i].text.trim();
      if (was[key] > 0) was[key] -= 1;
      else added.push(after[i]);
    }
    var removed = [];
    for (i = 0; i < before.length; i++) {
      key = before[i].text.trim();
      if (now[key] > 0) now[key] -= 1;
      else removed.push(before[i]);
    }
    return { added: added, removed: removed };
  }

  function total(counts) {
    var n = 0;
    for (var i = 0; i < counts.length; i++) n += counts[i];
    return n;
  }

  // 2 語以上が同じ版に居る = 表記の混在。混入点を探す動機がこれなので、
  // 「混在が始まった版」は行の増減とは別に印を持たせる。
  function mixed(counts) {
    var live = 0;
    for (var i = 0; i < counts.length; i++) if (counts[i] > 0) live++;
    return live >= 2;
  }

  // 1 枚の図の版の並び (古い順) → 変化した版だけ。
  // 最初の版に既に語が居たら「控えの始まりより前から居た」として first を立てる
  // (増えた瞬間を見ていないことを、増えた版と同じ顔で出さない)。
  function fileChanges(file, n) {
    var name = _s(file && file.name);
    var versions = _list(file && file.versions);
    var out = [];
    var prev = null;
    for (var i = 0; i < versions.length; i++) {
      var v = versions[i];
      var counts = countsOf(v, n);
      var lines = linesOf(v);
      if (!prev) {
        if (total(counts) > 0) {
          out.push({
            file: name, stamp: _s(v.stamp), current: !!v.current, label: stampLabel(v),
            counts: counts, before: counts.slice(), first: true,
            added: lines, removed: [], mixed: mixed(counts),
            mixStart: mixed(counts),
          });
        }
        prev = { counts: counts, lines: lines };
        continue;
      }
      var same = true;
      for (var k = 0; k < n; k++) if (prev.counts[k] !== counts[k]) same = false;
      if (!same) {
        var d = lineDelta(prev.lines, lines);
        out.push({
          file: name, stamp: _s(v.stamp), current: !!v.current, label: stampLabel(v),
          counts: counts, before: prev.counts.slice(), first: false,
          added: d.added, removed: d.removed, mixed: mixed(counts),
          mixStart: mixed(counts) && !mixed(prev.counts),
        });
      }
      prev = { counts: counts, lines: lines };
    }
    return out;
  }

  // 図をまたいで 1 本の時系列に。刻印が同じなら図の名前で並べる (順が揺れない)。
  // current (まだ控えになっていない今の中身) はどの刻印より後ろ。
  function rows(payload) {
    var ts = _list(payload && payload.terms).map(_s);
    var n = ts.length;
    if (!n) return [];
    var out = [];
    _list(payload && payload.files).forEach(function(f) {
      fileChanges(f, n).forEach(function(r) { out.push(r); });
    });
    out.sort(function(a, b) {
      var ka = a.current ? '￿' : a.stamp;
      var kb = b.current ? '￿' : b.stamp;
      if (ka !== kb) return ka < kb ? -1 : 1;
      return a.file < b.file ? -1 : (a.file > b.file ? 1 : 0);
    });
    return out;
  }

  // 行の要約。「どの語がいくつ増えたか」を語ごとに言う
  // (合計だけだと SpiDrv −3 / Spi_Driver +3 の置換が「変化なし」に見える)。
  function deltaText(row, ts) {
    var parts = [];
    for (var i = 0; i < ts.length; i++) {
      var d = row.counts[i] - row.before[i];
      if (row.first) d = row.counts[i];
      if (!d) continue;
      parts.push(ts[i] + ' ' + (d > 0 ? '+' : '') + d);
    }
    return parts.join(' / ');
  }

  // 混入点。語ごとに「最初に 0 から増えた版」。見つからなければ null
  // (控えの始まりから居た語は first の版を返し、reason で区別する)。
  function origin(rowList, ts) {
    var out = [];
    for (var i = 0; i < ts.length; i++) {
      var found = null;
      for (var j = 0; j < rowList.length; j++) {
        var r = rowList[j];
        if (r.counts[i] <= 0) continue;
        if (r.first) { found = { row: r, reason: 'before' }; break; }
        if (r.before[i] === 0) { found = { row: r, reason: 'added' }; break; }
      }
      out.push(found ? {
        term: ts[i], file: found.row.file, stamp: found.row.stamp,
        label: found.row.label, current: found.row.current, reason: found.reason,
      } : { term: ts[i], file: '', stamp: '', label: '', current: false, reason: 'none' });
    }
    return out;
  }

  function originText(o) {
    if (!o) return '';
    if (o.reason === 'none') return o.term + ': どの版にも無い';
    if (o.reason === 'before') return o.term + ': 残っている最古の版 (' + o.label + ' ' + o.file + ') に既にある';
    return o.term + ': ' + o.label + ' の ' + o.file + ' から';
  }

  // 混在が始まった最初の版 (2 語以上が同時に居る最初の点)。
  function mixOrigin(rowList) {
    for (var i = 0; i < rowList.length; i++) if (rowList[i].mixStart) return rowList[i];
    return null;
  }

  function headline(payload, rowList) {
    var ts = _list(payload && payload.terms).map(_s);
    if (!ts.length) return '探す部品名を入れてください';
    if (!rowList.length) {
      return ts.join(' / ') + ' はどの版にも出てきません (' +
        (payload && payload.scanned ? payload.scanned : 0) + ' 版を見ました)';
    }
    var mix = mixOrigin(rowList);
    var head = rowList.length + ' 件の変化 / ' +
      (payload && payload.scanned ? payload.scanned : 0) + ' 版を見ました';
    if (mix) head += ' — 混在の始まり: ' + mix.label + ' の ' + mix.file;
    return head;
  }

  return {
    terms: terms,
    stampLabel: stampLabel,
    lineDelta: lineDelta,
    fileChanges: fileChanges,
    rows: rows,
    deltaText: deltaText,
    origin: origin,
    originText: originText,
    mixOrigin: mixOrigin,
    headline: headline,
  };
})();
