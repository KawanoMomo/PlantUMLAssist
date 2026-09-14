'use strict';
window.MA = window.MA || {};

// finding-link — 変更サマリボードの 1 エントリ (変わった図) と、指摘 (📌 指摘ピン) を結ぶ。
//
// BLK-primary-20260908-1703-wish: ボードは「今回どの図がどう変わったか」を出すが、
// 「この差分は reviewer/指摘.md のどの指摘への対応か」はボードのどこにも無い。
// レビュー会議では必ず聞かれるので、会議直前に自分の記憶で突き合わせ、口頭で
// 説明する準備をしていた。指摘が 1 件でも増えるたびにこの突き合わせが増える。
//
// ここでは「指摘 1 件 ⇔ 変わった図 N 枚」の紐付けだけを持つ。紐付けは図の名前で
// 憶える (差分は基準を取り直すたびに計算し直されるが、どの指摘への対応かは変わらない。
// handover-notes が申し送りを図の名前で憶えているのと同じ理由)。
//
// 「未対応」は 2 つの意味を分けて出す:
//   紐付いた図が 1 枚も無い  → まだ手を付けていない (会議で「対応なし」と言う分)
//   指摘ピン自体が done でない → 直したが指摘を閉じていない
// このモジュールは DOM にもサーバにも触らない。描画・書き出しは app.js の職掌。
window.MA.findingLink = (function() {
  var KEY = 'plantuml-finding-links';

  var _links = null;   // { pinKey: [図名, ...] }

  function _s(v) { return v == null ? '' : String(v); }

  // 指摘の実体キー。指摘ピンは図ごとに 1 始まりの id を振るので、図名まで含めて初めて一意。
  function keyOf(pin) {
    if (!pin || typeof pin !== 'object') return '';
    var doc = _s(pin.doc);
    var id = _s(pin.id);
    if (!doc || !id) return '';
    return doc + '#' + id;
  }

  function _names(v) {
    var out = [];
    if (!v || typeof v.length !== 'number') return out;
    for (var i = 0; i < v.length; i++) {
      var n = _s(v[i]).trim();
      if (n && out.indexOf(n) < 0) out.push(n);
    }
    return out;
  }

  // 壊れた行は落として残りを活かす (紐付けは 1 件ずつ独立している)。
  function parse(raw) {
    var out = {};
    if (raw == null || raw === '') return out;
    var v;
    try { v = (typeof raw === 'string') ? JSON.parse(raw) : raw; } catch (e) { return out; }
    var src = (v && typeof v === 'object' && v.links && typeof v.links === 'object') ? v.links : null;
    if (!src) return out;
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      if (!_s(k)) continue;
      var names = _names(src[k]);
      if (names.length) out[k] = names;
    }
    return out;
  }

  function serialize(links) {
    return JSON.stringify({ links: links || {} });
  }

  function _load() {
    if (_links) return _links;
    _links = {};
    try { _links = parse(window.localStorage.getItem(KEY)); } catch (e) { _links = {}; }
    return _links;
  }

  function _persist() {
    try {
      window.localStorage.setItem(KEY, serialize(_load()));
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---- 紐付け --------------------------------------------------------------

  // 押した所をもう一度押すと外れる (印を外す操作を別に置くとクリックが増える)。
  // 戻り値は結んだあとの状態 (true = 結ばれている)。
  function toggle(pinKey, docName) {
    var key = _s(pinKey);
    var name = _s(docName).trim();
    if (!key || !name) return false;
    var links = _load();
    var cur = links[key] || [];
    var at = cur.indexOf(name);
    if (at >= 0) {
      cur = cur.slice(0, at).concat(cur.slice(at + 1));
      if (cur.length) links[key] = cur; else delete links[key];
      _persist();
      return false;
    }
    links[key] = cur.concat([name]);
    _persist();
    return true;
  }

  function isLinked(pinKey, docName) {
    var cur = _load()[_s(pinKey)];
    return !!cur && cur.indexOf(_s(docName).trim()) >= 0;
  }

  // その指摘に結ばれた図名。
  function docsOf(pinKey) {
    var cur = _load()[_s(pinKey)];
    return cur ? cur.slice() : [];
  }

  // その図に結ばれた指摘のキー。ボードのエントリ側の見出しに件数を出すため。
  function keysOf(docName) {
    var name = _s(docName).trim();
    var links = _load();
    var out = [];
    if (!name) return out;
    Object.keys(links).forEach(function(k) {
      if (links[k].indexOf(name) >= 0) out.push(k);
    });
    out.sort();
    return out;
  }

  function count() { return Object.keys(_load()).length; }

  function clear() { _links = {}; _persist(); return true; }

  // ---- 対応表 --------------------------------------------------------------

  // 指摘の並び (pin-inbox.collect の戻り) と、いまのボードから 1 枚の表を組む。
  //   findings — [{doc, id, text, state, line, author}]
  //   board    — change-board.build の戻り (省略可。省略すると「変更」列が空になる)
  //   linksOf  — 差し替え用 (省略すると自分の控えを読む)
  // 行の status:
  //   'linked'   紐付いた図があり、その図が今回変わっている → 会議で見せる差分がある
  //   'stale'    紐付いた図はあるが、ボードに出ていない (基準を取り直した / 差分が消えた)
  //   'none'     紐付いた図が無い → 「対応なし」
  function buildTable(opts) {
    var o = opts || {};
    var findings = Array.isArray(o.findings) ? o.findings : [];
    var linksOf = typeof o.linksOf === 'function' ? o.linksOf : docsOf;
    var changed = {};
    if (o.board && Array.isArray(o.board.entries)) {
      o.board.entries.forEach(function(e) { if (e && e.name) changed[e.name] = e; });
    }
    var rows = [];
    var linked = 0, none = 0, stale = 0;
    findings.forEach(function(p) {
      var key = keyOf(p);
      if (!key) return;
      var docs = linksOf(key) || [];
      var inBoard = docs.filter(function(n) { return !!changed[n]; });
      var status = docs.length === 0 ? 'none' : (inBoard.length ? 'linked' : 'stale');
      if (status === 'linked') linked++;
      else if (status === 'stale') stale++;
      else none++;
      rows.push({
        key: key,
        doc: _s(p.doc),
        id: _s(p.id),
        line: (typeof p.line === 'number' ? p.line : 0),
        text: _s(p.text),
        author: _s(p.author),
        state: _s(p.state) || 'open',
        done: _s(p.state) === 'done',
        docs: docs.slice(),
        changedDocs: inBoard,
        status: status,
      });
    });
    // 「対応なし」を上に。会議前に埋めるのはここだけなので、探さずに済む並びにする。
    var rank = { none: 0, stale: 1, linked: 2 };
    rows.sort(function(a, b) {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      if (a.doc !== b.doc) return a.doc < b.doc ? -1 : 1;
      return (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0);
    });
    return {
      rows: rows,
      total: rows.length,
      linked: linked,
      stale: stale,
      none: none,
      pending: none + stale,
    };
  }

  // 未対応 (紐付いた図が無い / ボードに出ていない) だけを残す。
  function pendingRows(table) {
    if (!table || !Array.isArray(table.rows)) return [];
    return table.rows.filter(function(r) { return r.status !== 'linked'; });
  }

  function statusLabel(status) {
    if (status === 'linked') return '対応済み';
    if (status === 'stale') return '図はあるが差分なし';
    return '対応なし';
  }

  // ボードの見出しに足す 1 行。件数が 0 のときは何も出さない (見出しを伸ばさない)。
  function summaryText(table) {
    if (!table || !table.total) return '';
    return '指摘 ' + table.total + ' 件 (対応 ' + table.linked + ' / 未対応 ' + table.pending + ')';
  }

  // 会議資料にそのまま貼れる対応表。指摘 → 差分の図名、対応なしは「対応なし」と書く。
  function toMarkdown(table, opts) {
    var o = opts || {};
    var t = table || { rows: [], total: 0, linked: 0, pending: 0 };
    var at = _s(o.at).replace('T', ' ').slice(0, 16);
    var out = ['# 指摘と変更の対応表'];
    if (at) out.push('', '作成: ' + at);
    out.push('', summaryText(t) || '指摘はありません', '');
    if (!t.total) {
      out.push('- 図に 📌 指摘ピンがありません');
      return out.join('\n');
    }
    out.push('| 指摘 | 内容 | 対応 | 変更した図 |');
    out.push('|---|---|---|---|');
    t.rows.forEach(function(r) {
      var where = r.doc + (r.line > 0 ? (':' + r.line) : '') + ' #' + r.id;
      var text = r.text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
      var docs = r.docs.length ? r.docs.join(' / ') : '—';
      out.push('| ' + where + ' | ' + text + ' | ' + statusLabel(r.status) + ' | ' + docs + ' |');
    });
    return out.join('\n');
  }

  function fileName(at) {
    var s = _s(at).replace(/[-:T]/g, '').slice(0, 12);
    if (s.length < 12) return '指摘対応表.md';
    return '指摘対応表-' + s.slice(0, 8) + '-' + s.slice(8, 12) + '.md';
  }

  // テスト用。localStorage を差し替えたあとに読み直させる。
  function _reset() { _links = null; }

  var api = {
    KEY: KEY,
    keyOf: keyOf,
    parse: parse,
    serialize: serialize,
    toggle: toggle,
    isLinked: isLinked,
    docsOf: docsOf,
    keysOf: keysOf,
    count: count,
    clear: clear,
    buildTable: buildTable,
    pendingRows: pendingRows,
    statusLabel: statusLabel,
    summaryText: summaryText,
    toMarkdown: toMarkdown,
    fileName: fileName,
    _reset: _reset,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
