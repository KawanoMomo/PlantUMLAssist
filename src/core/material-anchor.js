'use strict';
window.MA = window.MA || {};

// material-anchor — 資料化した画像と、設計書の貼付先 (節の見出し) の対応。
//
// BLK-junior-20260914-2106-wish: 資料化は「部品 × 図種」のマスで進むのに、
// 出来た画像が設計書のどの見出しに貼るものかは GUI が覚えない。ファイル名
// (部品名 + 図種 + (資料用)) から人が毎回思い出すことになり、資料化の直後に
// 「どの節に貼る画像か」を確かめに戻る手間と、後日 (レビュー指摘対応など)
// 貼付先を思い出す手順が毎回発生していた。
//
// マスに見出しを 1 回登録すれば、以後その対応は資料化のたびに残る。設計書側から
// 「この見出しの最新画像はどれか」を逆引きできるので、見出し → 画像の一覧が
// そのまま貼り込みの作業指示になる。
//
// 対応は部品 × 図種に付ける (画像ファイル名に付けない)。資料化するたびに
// 画像は作り直され名前も版で変わるので、ファイル名に紐付けると 1 周で対応が
// 切れる。マスは資料化の単位そのものなので、作り直しても対応が残る。
//
// 状態 (未 / 古 / 済) と画像名の判定は materialBoard / materialMatrix が持つ。
// ここは「見出しとマスの対応」だけを持つ。DOM・fetch・localStorage には触らない
// (保存は app.js)。node からも require できる。
(function() {

  var SEP = '';
  var LABEL = '貼付先の見出し';
  var PLACEHOLDER = '例: 4.3 状態遷移';

  function _s(v) { return v == null ? '' : String(v); }
  function _trim(v) { return _s(v).replace(/\s+/g, ' ').replace(/^ | $/g, ''); }

  function key(component, kind) { return _s(component) + SEP + _s(kind); }

  function parseKey(k) {
    var at = _s(k).indexOf(SEP);
    if (at < 0) return { component: _s(k), kind: '' };
    return { component: _s(k).slice(0, at), kind: _s(k).slice(at + SEP.length) };
  }

  // normalize(raw) — 保存から読んだものを台帳の形に揃える。空の見出し・鍵の
  // 壊れた行は落とす (読めない行が残ると逆引きに見出し無しの行が出る)。
  function normalize(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach(function(k) {
      var p = parseKey(k);
      if (!p.component || !p.kind) return;
      var v = raw[k];
      var heading = _trim(v && typeof v === 'object' ? v.heading : v);
      if (!heading) return;
      out[key(p.component, p.kind)] = {
        heading: heading,
        at: _s(v && typeof v === 'object' ? v.at : ''),
      };
    });
    return out;
  }

  function entry(ledger, component, kind) {
    var l = ledger || {};
    return l[key(component, kind)] || null;
  }

  function get(ledger, component, kind) {
    var e = entry(ledger, component, kind);
    return e ? e.heading : '';
  }

  // set(ledger, component, kind, heading) — 新しい台帳を返す (元は変えない)。
  // 空文字を渡すと登録を消す (書き間違いを消す手段が無いと、逆引きに使わない
  // 見出しが残り続ける)。
  function set(ledger, component, kind, heading, at) {
    var out = normalize(ledger);
    var k = key(component, kind);
    var h = _trim(heading);
    if (!_s(component) || !_s(kind)) return out;
    if (!h) { delete out[k]; return out; }
    out[k] = { heading: h, at: _s(at) };
    return out;
  }

  // headings(ledger) — 既に使った見出しの一覧。入力欄の候補に出して、
  // 「4.3 状態遷移」と「4.3節 状態遷移」のような揺れを作らせない。
  function headings(ledger) {
    var seen = {};
    var l = normalize(ledger);
    Object.keys(l).forEach(function(k) { seen[l[k].heading] = true; });
    return Object.keys(seen).sort(_cmpHeading);
  }

  // 見出しは「4.3」「4.10」のような章番号で始まることが多い。文字列順だと
  // 4.10 が 4.3 の前に来て、設計書の並びと逆引きの並びが食い違う。
  function _numParts(h) {
    var m = _s(h).match(/^[^0-9]*([0-9]+(?:[.\-][0-9]+)*)/);
    if (!m) return null;
    return m[1].split(/[.\-]/).map(function(n) { return parseInt(n, 10); });
  }

  function _cmpHeading(a, b) {
    var pa = _numParts(a), pb = _numParts(b);
    if (pa && pb) {
      for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
        var d = (pa[i] == null ? -1 : pa[i]) - (pb[i] == null ? -1 : pb[i]);
        if (d !== 0) return d;
      }
    } else if (pa) { return -1; } else if (pb) { return 1; }
    return a < b ? -1 : (a > b ? 1 : 0);
  }

  // annotate(sc, ledger) — materialMatrix.scan の結果に見出しを書き込む。
  // 表は描くだけにしたいので、どのマスが登録済みかはここで決める。
  function annotate(sc, ledger) {
    var l = normalize(ledger);
    if (!sc || !sc.rows) return sc;
    var total = 0, anchored = 0;
    sc.rows.forEach(function(row) {
      var n = 0;
      row.cells.forEach(function(c) {
        c.heading = c.absent ? '' : get(l, row.component, c.kind);
        c.anchored = !!c.heading;
        if (!c.absent) { total++; if (c.anchored) { anchored++; n++; } }
      });
      row.anchored = n;
      row.unanchored = row.cells.filter(function(c) { return !c.absent && !c.anchored; }).length;
    });
    sc.anchored = anchored;
    sc.anchorTotal = total;
    sc.unanchored = total - anchored;
    return sc;
  }

  // 表の上の 1 行。「あと何マスに貼付先が要るか」を数える前に言う。
  function summaryText(sc) {
    if (!sc || !sc.rows || !sc.rows.length) return '';
    if (!sc.anchorTotal) return '';
    if (!sc.unanchored) {
      return LABEL + ': ' + sc.anchored + ' マスすべて登録済み（見出しから最新画像を引けます）';
    }
    return LABEL + ': ' + sc.anchored + ' / ' + sc.anchorTotal + ' マス登録済み（未登録 '
      + sc.unanchored + ' マス）';
  }

  // 1 マスぶんの説明。押したマスに何が登録されているかを、入力欄の外でも読ませる。
  function cellText(component, kind, heading) {
    if (!_s(component) || !_s(kind)) return '';
    var head = _s(component) + ' / ' + _s(kind) + ' の' + LABEL;
    return _trim(heading) ? head + ': ' + _trim(heading)
      : head + ' は未登録です（登録すると設計書から逆引きできます）';
  }

  // lookup(sc, ledger) — 設計書側からの逆引き。見出しの順に「その見出しに貼る
  // 最新の画像はどれか」を並べる。状態 (未 / 古) もそのまま持たせる —— 見出しは
  // 決まっていても画像がまだ無い・古いことがあり、それが分からないと貼ってから
  // 気付くことになる。
  function lookup(sc, ledger) {
    var l = normalize(ledger);
    var out = [];
    ((sc && sc.rows) || []).forEach(function(row) {
      row.cells.forEach(function(c) {
        if (c.absent) return;
        var h = get(l, row.component, c.kind);
        if (!h) return;
        out.push({
          heading: h,
          component: row.component,
          kind: c.kind,
          status: c.status,
          mark: c.mark,
          file: (c.row && c.row.material) ? c.row.material : '',
          filename: (c.row && c.row.filename) ? c.row.filename : '',
        });
      });
    });
    out.sort(function(a, b) {
      var d = _cmpHeading(a.heading, b.heading);
      if (d !== 0) return d;
      d = a.component < b.component ? -1 : (a.component > b.component ? 1 : 0);
      return d !== 0 ? d : (a.kind < b.kind ? -1 : (a.kind > b.kind ? 1 : 0));
    });
    return out;
  }

  // 逆引きの 1 行の言葉。画像がまだ無い・古い見出しは、そう書く。
  function lookupText(r) {
    if (!r) return '';
    var head = r.heading + ' ← ' + r.component + ' / ' + r.kind;
    if (r.status === 'none') return head + '：資料用の画像がまだありません';
    if (r.status === 'stale') return head + '：' + (r.filename || r.file) + '（元の図のほうが新しい）';
    return head + '：' + (r.filename || r.file);
  }

  function lookupSummary(rows) {
    var rs = rows || [];
    if (!rs.length) return '貼付先の見出しはまだ登録されていません。マスを選んで見出しを入れると、ここに設計書の並びで出ます。';
    var ready = rs.filter(function(r) { return r.status === 'fresh'; }).length;
    return rs.length + ' 見出し（貼れる ' + ready + '・手当てが要る ' + (rs.length - ready) + '）';
  }

  window.MA.materialAnchor = {
    SEP: SEP,
    LABEL: LABEL,
    PLACEHOLDER: PLACEHOLDER,
    key: key,
    parseKey: parseKey,
    normalize: normalize,
    entry: entry,
    get: get,
    set: set,
    headings: headings,
    annotate: annotate,
    summaryText: summaryText,
    cellText: cellText,
    lookup: lookup,
    lookupText: lookupText,
    lookupSummary: lookupSummary,
  };
})();
