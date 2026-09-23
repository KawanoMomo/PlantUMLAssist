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
        // BLK-owner-20260923-1409-prune: 出典を札ではなく列で持つ。
        // 手で書いた指摘 (fromManual) と同じ箱に並べても見分けが付くようにする。
        p.source = 'audit';
        out.push(p);
      });
    });
    return out;
  }

  // fromManual: 手で書いた指摘 (manual-findings.review の行) を、箱に並ぶ形にする。
  //
  // BLK-owner-20260923-1409-prune: 🔖 手動指摘のタブは「指摘を集めて札を付けて一覧する」
  // という 📥 指摘箱と同じ目的の 2 つ目の入口だった。同じ 1 件が 2 か所で別々に数えられ、
  // 札の語彙も違った。手で書いた指摘もここで箱の項目にし、出典の絞り込みで出す。
  // 仕分けの中身 (指紋での持ち越し・要再確認の判定) は manual-findings のまま使う。
  function fromManual(rows) {
    var FV = window.MA.findingVocab;
    return (Array.isArray(rows) ? rows : []).map(function(r) {
      if (!r) return null;
      var v = FV ? FV.fromManual(r) : { key: r.keep ? 'open' : 'unknown', why: '' };
      return {
        id: 'mf:' + _s(r.id),
        mfId: _s(r.id),
        doc: _s(r.doc),
        line: r.line > 0 ? r.line : 0,
        text: _s(r.text),
        author: _s(r.author),
        at: _s(r.at),
        state: (v.key === 'reflected') ? 'done' : 'open',
        stale: !r.keep && (r.status === 'gone' || r.status === 'missing-doc'),
        source: 'manual',
        verdictKey: v.key,
        verdictWhy: v.why,
        mfRow: r,
      };
    }).filter(function(x) { return !!x && !!x.doc; });
  }

  // filter: 受信箱の既定は「自分がまだ見ていない、他人の指摘」。
  //   source — 'audit' / 'manual' を指定すると、その出典だけを残す (空なら全部)
  //   unreadOnly — 既読 (= 目を通した) を落とす
  //   pendingOnly — 対応済みを落とす。「まだ直っていない指摘」だけを残す
  //   excludeAuthor — 自分が書いた指摘を落とす。大小は問わない
  function filter(items, opts) {
    var o = opts || {};
    var me = _s(o.excludeAuthor).trim().toLowerCase();
    var src = _s(o.source).trim();
    return (Array.isArray(items) ? items : []).filter(function(p) {
      if (!p) return false;
      if (src && _s(p.source || 'audit') !== src) return false;
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
      + ' ' + sourceLabel(p)
      + ' ' + (window.MA.reviewPins ? window.MA.reviewPins.stateLabel(p.state)
        : (p.state === 'read' ? '既読' : '未読'))
      + (p.author ? ' ・ ' + p.author : '')
      + ' ・ ' + _s(p.text);
  }

  // 出典の見出し (列に出す文字)。語彙は finding-vocab が持つ。
  function sourceLabel(p) {
    var FV = window.MA.findingVocab;
    var k = _s(p && p.source) || 'audit';
    return FV ? FV.source(k).label : (k === 'manual' ? '手で書いた' : '監査が出した');
  }

  // 同じ図の同じ行に同じ文面があれば 1 件に畳む。出典が違っても二重に数えない
  // (BLK-owner-20260923-1409-prune: 🔖 と 📥 の別勘定をここで止める)。
  // 監査が出した側を残す (根拠の機械確認が付いているのはそちら)。
  function dedupe(items) {
    var FV = window.MA.findingVocab;
    if (!FV) return (Array.isArray(items) ? items : []).slice();
    var seen = {}, out = [];
    (Array.isArray(items) ? items : []).forEach(function(p) {
      if (!p) return;
      var k = FV.countKey(p);
      if (Object.prototype.hasOwnProperty.call(seen, k)) {
        // 先に入れたのが手で書いた側なら、監査が出した側で置き換える。
        var at = seen[k];
        if (out[at] && out[at].source === 'manual' && p.source !== 'manual') out[at] = p;
        return;
      }
      seen[k] = out.length;
      out.push(p);
    });
    return out;
  }

  return {
    collect: collect,
    fromManual: fromManual,
    dedupe: dedupe,
    sourceLabel: sourceLabel,
    filter: filter,
    groupByDoc: groupByDoc,
    summary: summary,
    headText: headText,
    badgeText: badgeText,
    groupText: groupText,
    rowText: rowText,
  };
})();
