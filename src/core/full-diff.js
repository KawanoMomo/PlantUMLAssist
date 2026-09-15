'use strict';
window.MA = window.MA || {};

// full-diff — 変わった図の「全文 diff」を、その場で開けるところまで持ってくる。
//
// BLK-reviewer-20260916-0526-wish: 変化の中身は代表行 + 件数までしか出ない。
// −3 行/+76 行のような大きな復元が「以前より充実しているか (継承関係・note が
// 揃っているか)」は代表行では決められず、結局 `cat` でファイル全体を読み直していた。
// 読み直しは控え側と現物側の 2 回 = 手順 5・8 のたびにコマンド往復が増える。
//
// 控えの本文も現物の本文も、比較を出した時点で既に手元にある (file-change-detail と
// 同じ持ち物)。行の対応さえ取れば、全文を並べるのに追加のコマンドは要らない。
// file-change-detail が「どの図を読むか」を決める要約だとすれば、ここは
// 「決めた図をその場で最後まで読む」側で、両方が同じ 1 本の出力に並ぶ。
//
// 代表行 (file-change-detail) は描かれる行だけを袋で突き合わせるが、全文 diff は
// 行の並びを保った生の本文を出す。コメント・空行も落とさない
// (落とすと「読み直さなくてよい」と言えなくなり、また cat に戻る)。
window.MA.fullDiff = (function() {

  // 大きい差分の目安。これを超えたら代表行では足りないと見なし、
  // 要約の側から全文を開くよう促す (BLK の「例: 20 行」)。
  var DEFAULT_THRESHOLD = 20;

  function _s(v) { return v == null ? '' : String(v); }

  function splitLines(text) {
    return _s(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  }

  // 行単位の最長共通部分列。図 1 枚は高々数百行なので素直な DP で足りる。
  // 大きすぎる図では DP を諦め、前半の一致だけ取って残りを差し替えに落とす
  // (全文が出ないより、遅くて出ないほうが困る)。
  var MAX_CELLS = 4000000;

  function _lcsTable(a, b) {
    var n = a.length, m = b.length;
    var table = new Array(n + 1);
    for (var i = 0; i <= n; i++) table[i] = new Int32Array(m + 1);
    for (var x = n - 1; x >= 0; x--) {
      for (var y = m - 1; y >= 0; y--) {
        table[x][y] = a[x] === b[y]
          ? table[x + 1][y + 1] + 1
          : Math.max(table[x + 1][y], table[x][y + 1]);
      }
    }
    return table;
  }

  // ops(prevText, curText) — 並びを保った差分。
  // 各要素は { type: 'same'|'del'|'add', text, prevNo, curNo }。
  // 行番号は 1 始まりで、その側に無い行は null (指摘に「N 行目」と写せるようにする)。
  function ops(prevText, curText) {
    var a = splitLines(prevText), b = splitLines(curText);
    var out = [];
    var i = 0, j = 0;
    if ((a.length + 1) * (b.length + 1) <= MAX_CELLS) {
      var t = _lcsTable(a, b);
      while (i < a.length && j < b.length) {
        if (a[i] === b[j]) { out.push({ type: 'same', text: a[i], prevNo: i + 1, curNo: j + 1 }); i++; j++; }
        else if (t[i + 1][j] >= t[i][j + 1]) { out.push({ type: 'del', text: a[i], prevNo: i + 1, curNo: null }); i++; }
        else { out.push({ type: 'add', text: b[j], prevNo: null, curNo: j + 1 }); j++; }
      }
    }
    while (i < a.length) { out.push({ type: 'del', text: a[i], prevNo: i + 1, curNo: null }); i++; }
    while (j < b.length) { out.push({ type: 'add', text: b[j], prevNo: null, curNo: j + 1 }); j++; }
    return out;
  }

  function counts(list) {
    var removed = 0, added = 0;
    (list || []).forEach(function(o) {
      if (o.type === 'del') removed++;
      else if (o.type === 'add') added++;
    });
    return { removed: removed, added: added, changed: removed + added };
  }

  // row(name, prevText, curText) — 1 枚ぶんの全文 diff。
  function row(name, prevText, curText) {
    var list = ops(prevText, curText);
    var c = counts(list);
    return {
      name: _s(name), ops: list,
      removedCount: c.removed, addedCount: c.added, changedCount: c.changed,
      prevLines: splitLines(prevText).length,
      curLines: splitLines(curText).length,
    };
  }

  // 全文 diff を出すべきか。閾値を超えた変化は代表行では足りない。
  // 明示で名指しされた図と 'all' は閾値を見ない (人が開くと言ったものは開く)。
  function shouldOpen(r, select, threshold) {
    if (!r) return false;
    var th = threshold > 0 ? threshold : DEFAULT_THRESHOLD;
    // 'none' は「全文は要らない」。閾値を超えた図には促しだけが残る。
    if (select === 'none' || select === false) return false;
    if (select === 'all' || select === true) return true;
    if (Array.isArray(select) && select.length) {
      var n = _s(r.name);
      var base = n.replace(/\.puml$/i, '');
      return select.some(function(s) {
        var q = _s(s), qb = q.replace(/\.puml$/i, '');
        return q === n || qb === base;
      });
    }
    return (r.changedCount || 0) >= th;
  }

  // 促し 1 行。閾値を超えたのに開いていない図にだけ添える
  // (全部に添えると、印が印でなくなる)。
  function hint(r, threshold) {
    var th = threshold > 0 ? threshold : DEFAULT_THRESHOLD;
    if (!r || (r.changedCount || 0) < th) return null;
    return '全文diffで確認: ' + r.name + ' (' + r.changedCount + ' 行が動いた。'
      + '--full-diff ' + r.name.replace(/\.puml$/i, '') + ' で全文を開く)';
  }

  function _no(v, w) {
    var s = v == null ? '' : String(v);
    while (s.length < w) s = ' ' + s;
    return s;
  }

  // render(r) — unified の全文。左が控えの行番号、右が現物の行番号。
  // 文脈を削らない: これは cat の代わりなので、出さなかった行があってはならない。
  function render(r) {
    if (!r) return [];
    var w = String(Math.max(r.prevLines || 0, r.curLines || 0)).length;
    var out = ['全文diff ' + r.name + '  控え ' + r.prevLines + ' 行 → 現物 ' + r.curLines
      + ' 行 (−' + r.removedCount + ' / +' + r.addedCount + ')'];
    r.ops.forEach(function(o) {
      var mark = o.type === 'del' ? '-' : (o.type === 'add' ? '+' : ' ');
      out.push('  ' + _no(o.prevNo, w) + ' ' + _no(o.curNo, w) + ' ' + mark + ' ' + o.text);
    });
    return out;
  }

  return {
    DEFAULT_THRESHOLD: DEFAULT_THRESHOLD,
    splitLines: splitLines,
    ops: ops,
    counts: counts,
    row: row,
    shouldOpen: shouldOpen,
    hint: hint,
    render: render,
  };
})();
