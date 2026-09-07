'use strict';
window.MA = window.MA || {};

// pin-inbox — 保存フォルダ全体の指摘を 1 つの受信箱にまとめる。
//
// BLK-junior-20260907-2203-wish: 指摘ピン (review-pins) は 1 図ずつにしか付かない。
// 「レビュー指摘を受けて直す」業務は、前の図を 1 枚ずつ開いて 📌 のバッジを見て回り、
// どこに未対応が残っているかを自分で覚えておくところから始まっていた。
// 図をまたいで「未対応が何件・どの図に残っているか」を先に見せれば、
// 手順は「一覧を見て今日どれから直すか選ぶ」に変わる。
//
// ここは DOM にもサーバにも触らない。渡された {name, dsl} の並びから
// 指摘を拾い、絞り込み・並べ替え・要約だけを行う。読み込みは app.js。
window.MA.pinInbox = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  // 未対応 = 対応済み以外。古い呼び出し元が pending を持たない要約を渡してきても壊さない。
  function _pending(sum) {
    return (sum && typeof sum.pending === 'number') ? sum.pending : (sum ? sum.open : 0);
  }

  function _pinsOf(dsl) {
    var RP = window.MA.reviewPins;
    return RP ? RP.list(dsl) : [];
  }

  // collect: [{name, dsl}] → 図名を持たせた指摘の並び。
  // 読めなかった図 (dsl が null) は飛ばす。1 枚読めなくても残りは出す。
  function collect(docs) {
    var out = [];
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (!d || typeof d.name !== 'string' || !d.name) return;
      if (typeof d.dsl !== 'string') return;
      _pinsOf(d.dsl).forEach(function(p) {
        p.doc = d.name;
        out.push(p);
      });
    });
    return out;
  }

  // filter: 受信箱の既定は「自分がまだ見ていない、他人の指摘」。
  //   unreadOnly — 既読 (= 目を通した) を落とす
  //   pendingOnly — 対応済みを落とす。「まだ直っていない指摘」だけを残す
  //   excludeAuthor — 自分が書いた指摘を落とす。大小は問わない
  function filter(items, opts) {
    var o = opts || {};
    var me = _s(o.excludeAuthor).trim().toLowerCase();
    return (Array.isArray(items) ? items : []).filter(function(p) {
      if (!p) return false;
      if (o.unreadOnly && p.state === 'read') return false;
      if (o.pendingOnly && p.state === 'done') return false;
      if (me && _s(p.author).trim().toLowerCase() === me) return false;
      return true;
    });
  }

  // groupByDoc: 図ごとにまとめる。未対応が残っている図を先に、
  // 同数なら図名の順。「今日どれから直すか」を上から選べる並びにする。
  function groupByDoc(items) {
    var map = {}, order = [];
    (Array.isArray(items) ? items : []).forEach(function(p) {
      if (!p) return;
      var k = _s(p.doc);
      if (!map[k]) { map[k] = { doc: k, open: 0, read: 0, done: 0, pending: 0, stale: 0, items: [] }; order.push(k); }
      var g = map[k];
      g.items.push(p);
      if (p.state === 'done') g.done++;
      else if (p.state === 'read') g.read++;
      else g.open++;
      if (p.stale) g.stale++;
    });
    var groups = order.map(function(k) { map[k].pending = map[k].items.length - map[k].done; return map[k]; });
    groups.sort(function(a, b) {
      if (a.pending !== b.pending) return b.pending - a.pending;
      return a.doc < b.doc ? -1 : (a.doc > b.doc ? 1 : 0);
    });
    groups.forEach(function(g) {
      g.items.sort(function(x, y) {
        if (x.stale !== y.stale) return x.stale ? 1 : -1;
        return x.line - y.line;
      });
    });
    return groups;
  }

  function summary(items) {
    var s = { total: 0, open: 0, read: 0, done: 0, pending: 0, stale: 0, docs: 0, openDocs: 0 };
    groupByDoc(items).forEach(function(g) {
      s.docs++;
      if (g.pending > 0) s.openDocs++;
      s.total += g.items.length;
      s.open += g.open;
      s.read += g.read;
      s.done += g.done;
      s.stale += g.stale;
    });
    s.pending = s.total - s.done;
    return s;
  }

  // headText: 受信箱の見出し 1 行。「何件・何図に残っているか」を先に言う。
  function headText(sum) {
    if (!sum || !sum.total) return '未対応の指摘はありません';
    return '未対応 ' + _pending(sum) + ' 件 / 全 ' + sum.total + ' 件 ・ ' + sum.openDocs + ' 図'
      + (sum.stale ? ' ・ 行が見つからない ' + sum.stale : '');
  }

  // badgeText: 道具ボタンの 1 行。図をまたいだ未対応の数がボタンだけで分かる。
  function badgeText(sum) {
    if (!sum || !sum.total) return '📥 指摘箱 −';
    return '📥 指摘箱 ' + _pending(sum) + '/' + sum.total;
  }

  function groupText(g) {
    if (!g) return '';
    return g.doc + ' — 未対応 ' + (typeof g.pending === 'number' ? g.pending : g.open)
      + ' / ' + g.items.length + ' 件'
      + (g.stale ? ' ・ 行が見つからない ' + g.stale : '');
  }

  // rowText: 1 件の行。どの図の何行目かと、誰の指摘かをその場で読めるようにする。
  function rowText(p) {
    if (!p) return '';
    var where = p.stale ? '行が見つかりません' : ('L' + p.line);
    return '#' + _s(p.id) + ' ' + _s(p.doc) + ' ' + where
      + ' ' + (window.MA.reviewPins ? window.MA.reviewPins.stateLabel(p.state)
        : (p.state === 'read' ? '既読' : '未読'))
      + (p.author ? ' ・ ' + p.author : '')
      + ' ・ ' + _s(p.text);
  }

  return {
    collect: collect,
    filter: filter,
    groupByDoc: groupByDoc,
    summary: summary,
    headText: headText,
    badgeText: badgeText,
    groupText: groupText,
    rowText: rowText,
  };
})();
