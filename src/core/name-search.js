'use strict';
window.MA = window.MA || {};

// name-search — 部品名 / メソッド名から「その名前を使っている図の一覧」を引く。
//
// BLK-primary-20260917-0523-wish: 仕様変更 (SPI 初期化にクロック確認手順を足す) の
// 影響範囲を洗うとき、primary は指摘.md で対象名を絞ってから、保存フォルダの図を
// 1 枚ずつタブで開いて本文を目で読んでいた。名前から図を引く画面が無いので、
// 「どの図に ClockCtrl.EnableClock が出るか」は開いてみるまで分からない。
//
// 数え方は bulkRename.countIn と同じ識別子単位にする (一括置換のヒット数と
// この一覧の件数が食い違うと、どちらを信じるかを毎回考えることになる)。
// ただし `.` は識別子の区切りなので、`EnableClock` と打てば
// `ClockCtrl.EnableClock` の呼び出し行にも当たる。修飾付きで打てば完全一致だけ。
//
// 的は「開いているタブ + 保存フォルダ」の全図 (folderImpact.merge の行)。
// DOM も fetch も触らない。読み込みは app.js。
window.MA.nameSearch = (function() {

  var WORD = /[A-Za-z0-9_]/;

  // 宣言行の頭。xref-graph と同じ語彙 (宣言の見分け方を 2 つ持たない)。
  var DECL_HEAD = /^\s*(?:participant|actor|boundary|control|entity|database|collections|queue|abstract\s+class|abstract|class|interface|enum|struct|state|component|node|package|folder|rectangle|cloud|storage|usecase)\b/;
  // 矢印のある行 (シーケンスのメッセージ / 状態遷移)。
  var ARROW = /(-+>|<-+|\.+>|<\.+|-+\|>)/;

  function _s(v) { return v == null ? '' : String(v); }
  function _list(v) { return Array.isArray(v) ? v : []; }
  function _escapeRe(s) { return _s(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function _lines(text) { return _s(text).split(/\r?\n/); }
  function _comment(line) { return /^\s*(?:'|@|\/')/.test(line); }

  // 打った語の正規化。前後の空白と、末尾の `()` を落とす
  // (クラス図の宣言は `Start()`、シーケンスのメッセージは `Start` と書かれる)。
  function normalizeQuery(q) {
    return _s(q).trim().replace(/\(\s*\)\s*$/, '').trim();
  }

  // 修飾付き (`ClockCtrl.EnableClock`) か。付いていれば完全一致だけを当てる。
  function isQualified(q) {
    return normalizeQuery(q).indexOf('.') !== -1;
  }

  // 1 行の中の出現位置。識別子単位。修飾なしの語は `.` をまたいで当たる
  // (`EnableClock` が `ClockCtrl.EnableClock` の呼び出しに当たる)。
  function hitsIn(line, query) {
    var text = _s(line);
    var q = normalizeQuery(query);
    var out = [];
    if (!q) return out;
    var qualified = isQualified(q);
    var re = new RegExp(_escapeRe(q), 'g');
    var m;
    while ((m = re.exec(text)) !== null) {
      var s = m.index;
      var e = s + m[0].length;
      var before = s === 0 ? '' : text.charAt(s - 1);
      var after = e >= text.length ? '' : text.charAt(e);
      var beforeOk = !WORD.test(before) && (!qualified || before !== '.');
      var afterOk = !WORD.test(after) && (!qualified || after !== '.');
      // 修飾なしでも、直後が識別子文字なら別の語 (SpiDrv は SpiDrvTest を含まない)。
      if (beforeOk && afterOk) out.push(s);
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    return out;
  }

  function countIn(text, query) {
    var n = 0;
    _lines(text).forEach(function(line) {
      if (_comment(line)) return;
      n += hitsIn(line, query).length;
    });
    return n;
  }

  // 出現行の役どころ。「宣言されている図」と「呼んでいるだけの図」は
  // 影響範囲の読み方が違う (宣言を直せば済むのか、呼び出しを全部直すのか)。
  function lineRole(line) {
    if (DECL_HEAD.test(line)) return 'decl';
    if (ARROW.test(line)) return 'call';
    return 'ref';
  }

  // 図の種別。folderImpact の行は kind を持たないので本文から決める
  // (part-cross と同じ見分け方)。
  function docKind(row) {
    var k = _s(row && row.kind);
    if (k) return k;
    var dsl = _s(row && row.dsl);
    if (/^\s*(?:\[\*\]\s*-|state\s+)/m.test(dsl)) return 'state';
    if (/^\s*(?:participant|actor)\s+/m.test(dsl)) return 'sequence';
    if (/^\s*(?:class|interface|enum|abstract)\b/m.test(dsl)) return 'class';
    return '';
  }

  // 1 図ぶんの当たり。当たらなければ null。
  function scanDoc(row, query) {
    var q = normalizeQuery(query);
    if (!row || !q) return null;
    var at = [];
    var roles = { decl: 0, call: 0, ref: 0 };
    var count = 0;
    _lines(row.dsl).forEach(function(line, i) {
      if (_comment(line)) return;
      var h = hitsIn(line, q);
      if (!h.length) return;
      count += h.length;
      var role = lineRole(line);
      roles[role] += h.length;
      at.push({ line: i + 1, text: _s(line).trim(), role: role });
    });
    if (!count) return null;
    return {
      id: _s(row.id),
      name: _s(row.name),
      open: !!row.open,
      role: _s(row.role) || 'unset',
      kind: docKind(row),
      count: count,
      declared: roles.decl > 0,
      calls: roles.call,
      at: at,
    };
  }

  // 並び: 宣言のある図が先 (影響範囲の起点)、次に件数の多い順、同数なら名前順。
  function sortHits(hits) {
    return _list(hits).slice().sort(function(a, b) {
      if (a.declared !== b.declared) return a.declared ? -1 : 1;
      if (a.count !== b.count) return b.count - a.count;
      return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
    });
  }

  // 検索本体。rows は folderImpact.merge の結果。
  function search(rows, query) {
    var q = normalizeQuery(query);
    var all = _list(rows);
    var hits = [];
    all.forEach(function(r) {
      var h = scanDoc(r, q);
      if (h) hits.push(h);
    });
    hits = sortHits(hits);
    var total = 0;
    var openHits = 0;
    hits.forEach(function(h) { total += h.count; if (h.open) openHits++; });
    return {
      query: q,
      files: all.length,
      hits: hits,
      hitDocs: hits.length,
      missDocs: all.length - hits.length,
      openHitDocs: openHits,
      unopenedHitDocs: hits.length - openHits,
      total: total,
      declDocs: hits.filter(function(h) { return h.declared; }).length,
    };
  }

  // 一覧の読み方を 1 行にする。押す前に「開く必要のある枚数」が分かるように。
  function summaryText(res) {
    if (!res || !res.query) return '名前を入れると、その名前を使っている図が出ます';
    if (!res.hitDocs) return '「' + res.query + '」は ' + res.files + ' 枚のどれにも出てきません';
    return '「' + res.query + '」: ' + res.files + ' 枚中 ' + res.hitDocs +
           ' 枚に ' + res.total + ' 件（うち開いていない図 ' + res.unopenedHitDocs + ' 枚）';
  }

  // ── 候補の索引 ─────────────────────────────────────────────────────────
  // 打つ前に「何が引けるのか」が見えないと、名前を思い出す手順が残る。
  // 宣言された部品名と、呼ばれているメソッド名を集めておく。

  // 宣言行から部品名を採る。`participant Foo as F` の Foo と F の両方。
  var DECL_NAME = /^\s*(?:participant|actor|boundary|control|entity|database|collections|queue|abstract\s+class|abstract|class|interface|enum|struct|state|component|node|rectangle|usecase)\s+(?:"([^"]+)"|([A-Za-z0-9_.]+))(?:\s+as\s+([A-Za-z0-9_]+))?/;
  // メッセージ / 遷移ラベルのメソッド。`A -> B : Ctrl.Enable()` の `Ctrl.Enable`。
  var LABEL_METHOD = /([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+|[A-Za-z_][A-Za-z0-9_]*(?=\s*\())/g;
  // クラス本体のメンバ宣言。`+EnableClock() : void`。
  var MEMBER = /^\s*[+\-#~]?\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/;

  function _add(map, order, name, kind, docName) {
    var n = _s(name).trim();
    if (!n) return;
    if (!map[n]) { map[n] = { name: n, kind: kind, docs: [] }; order.push(n); }
    if (kind === 'part' && map[n].kind !== 'part') map[n].kind = 'part';
    if (map[n].docs.indexOf(docName) === -1) map[n].docs.push(docName);
  }

  // rows → [{ name, kind: 'part' | 'method', docs: [図名] }]。
  // 並びは「使われている図の多い順」。横断しているものほど影響範囲が広い。
  function index(rows) {
    var map = {};
    var order = [];
    _list(rows).forEach(function(r) {
      if (!r) return;
      var docName = _s(r.name);
      _lines(r.dsl).forEach(function(line) {
        if (_comment(line)) return;
        var d = DECL_NAME.exec(line);
        if (d) _add(map, order, d[1] || d[2], 'part', docName);
        if (d && d[3]) _add(map, order, d[3], 'part', docName);
        var mem = MEMBER.exec(line);
        if (mem && !d) _add(map, order, mem[1], 'method', docName);
        var colon = line.indexOf(':');
        if (ARROW.test(line) && colon !== -1) {
          var label = line.slice(colon + 1);
          var m;
          LABEL_METHOD.lastIndex = 0;
          while ((m = LABEL_METHOD.exec(label)) !== null) {
            _add(map, order, m[1], 'method', docName);
          }
        }
      });
    });
    return order.map(function(n) { return map[n]; }).sort(function(a, b) {
      if (a.docs.length !== b.docs.length) return b.docs.length - a.docs.length;
      return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
    });
  }

  // 打ちかけの語に対する候補。前方一致を先に、部分一致をその後に。
  function suggest(entries, prefix, limit) {
    var p = normalizeQuery(prefix).toLowerCase();
    var max = limit == null ? 8 : limit;
    var list = _list(entries);
    if (!p) return list.slice(0, max);
    var head = [];
    var rest = [];
    list.forEach(function(e) {
      var n = _s(e && e.name).toLowerCase();
      if (!n || n === p) return;
      if (n.indexOf(p) === 0) head.push(e);
      else if (n.indexOf(p) !== -1) rest.push(e);
    });
    return head.concat(rest).slice(0, max);
  }

  return {
    normalizeQuery: normalizeQuery,
    isQualified: isQualified,
    hitsIn: hitsIn,
    countIn: countIn,
    lineRole: lineRole,
    docKind: docKind,
    scanDoc: scanDoc,
    sortHits: sortHits,
    search: search,
    summaryText: summaryText,
    index: index,
    suggest: suggest,
  };
})();
