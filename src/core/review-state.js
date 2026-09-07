'use strict';
window.MA = window.MA || {};

// review-state — レビュー指摘の反映状態を「図 1 枚」の単位にまとめ、
// 📂 一覧のバッジにする。
//
// BLK-junior-20260908-0630-wish: 指摘に対応するたびに「元図(レビュー反映).puml」を
// 別名で保存していたので、一覧には同じ題材が 2 枚並び、開くたびに名前を読み比べて
// どちらが最新かを確かめていた。📌 の指摘は既に 1 枚の中で未対応 / 対応済みを
// 持てるのだから、状態はファイル名ではなくバッジで出せばよい。そうすれば一覧は
// 題材の数だけで済み、別名保存もタイトルへの追記も要らなくなる。
//
// 状態は 3 つ。
//   none    — 指摘が付いていない (バッジを出さない。無印が「指摘なし」)
//   pending — 未反映。open / read の指摘が 1 件でも残っている
//   applied — 反映済み。指摘があって、全部 done
//
// 数えるのは server が一覧と一緒に返す pins ({open, read, done, total})。
// pins を返さない古い server では unknown にする — 「指摘なし」と
// 「数えられなかった」を混ぜると、無印の意味が無くなる。
window.MA.reviewState = (function() {

  var BADGE = {
    none:    { mark: '',     label: '',       title: 'レビュー指摘は付いていません' },
    pending: { mark: '未反映', label: '未反映', title: '未対応のレビュー指摘が残っています' },
    applied: { mark: '反映済', label: '反映済み', title: 'この図に付いた指摘は全部「対応済み」です' },
    unknown: { mark: '?',    label: '不明',   title: '指摘の件数を数えられませんでした (server が古い可能性)' },
  };

  function _n(v) {
    var n = typeof v === 'number' ? v : parseInt(v, 10);
    return isNaN(n) || n < 0 ? 0 : n;
  }

  // entry.pins → {open, read, done, total, kind}。
  function counts(entry) {
    var p = entry && entry.pins;
    if (!p || typeof p !== 'object') {
      return { open: 0, read: 0, done: 0, total: 0, kind: 'unknown' };
    }
    var open = _n(p.open), read = _n(p.read), done = _n(p.done);
    var total = _n(p.total);
    if (!total) total = open + read + done;
    var kind;
    if (total === 0) kind = 'none';
    else if (open + read > 0) kind = 'pending';
    else kind = 'applied';
    return { open: open, read: read, done: done, total: total, kind: kind };
  }

  function kindOf(entry) { return counts(entry).kind; }

  function badge(kind) { return BADGE[kind] || BADGE.none; }

  // バッジに添える件数。「未反映 2/5」のように、残りと全体を出す。
  // 件数を出さないと「未反映」だけでは何件残っているか分からず、結局開く。
  function badgeText(c) {
    if (!c || c.kind === 'none') return '';
    if (c.kind === 'unknown') return BADGE.unknown.mark;
    if (c.kind === 'applied') return BADGE.applied.mark + ' ' + c.done + '/' + c.total;
    return BADGE.pending.mark + ' ' + (c.open + c.read) + '/' + c.total;
  }

  function badgeTitle(c) {
    if (!c || c.kind === 'none') return BADGE.none.title;
    if (c.kind === 'unknown') return BADGE.unknown.title;
    if (c.kind === 'applied') return '指摘 ' + c.total + ' 件すべて対応済みです';
    return '指摘 ' + c.total + ' 件のうち ' + (c.open + c.read) + ' 件が未対応です'
      + (c.read ? '（読んだだけ ' + c.read + ' 件を含む）' : '');
  }

  // 一覧まるごと → { name: counts }。
  function statusMap(entries) {
    var out = {};
    (entries || []).forEach(function(e) {
      if (!e) return;
      var name = typeof e === 'string' ? e : e.name;
      if (!name) return;
      out[name] = counts(typeof e === 'string' ? null : e);
    });
    return out;
  }

  function _names(map, kind) {
    return Object.keys(map || {}).filter(function(n) { return map[n].kind === kind; }).sort();
  }

  function pendingNames(map) { return _names(map, 'pending'); }
  function appliedNames(map) { return _names(map, 'applied'); }

  // 一覧の頭に出す 1 行。0 件でも黙らない (「指摘が無い」と「数えていない」を分ける)。
  function summary(map) {
    var pending = pendingNames(map), applied = appliedNames(map);
    var unknown = _names(map, 'unknown');
    if (unknown.length && !pending.length && !applied.length) {
      return '指摘の反映状態: 数えられませんでした (' + unknown.length + ' 枚)';
    }
    if (!pending.length && !applied.length) return '指摘の反映状態: 指摘の付いた図はありません';
    var parts = [];
    if (pending.length) parts.push('未反映 ' + pending.length + ' 枚');
    if (applied.length) parts.push('反映済み ' + applied.length + ' 枚');
    return '指摘の反映状態: ' + parts.join(' / ');
  }

  return {
    BADGE: BADGE,
    counts: counts, kindOf: kindOf, badge: badge,
    badgeText: badgeText, badgeTitle: badgeTitle,
    statusMap: statusMap, pendingNames: pendingNames, appliedNames: appliedNames,
    summary: summary,
  };
})();
