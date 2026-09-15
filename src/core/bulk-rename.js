'use strict';
window.MA = window.MA || {};

// bulk-rename — 開いている図をまたいで識別子を一括置換する。
//
// 部品名 (participant / class / state / component 名) は複数の図に同じ綴りで
// 現れる。1 語直すために図ごとに全文を打ち直すと手数が枚数に比例して増えるので、
// 「置換前・置換後」を 1 度だけ入力して全ドキュメントに適用できるようにする。
//
// 置換は識別子単位 (前後が [A-Za-z0-9_] でない位置) で行う。SpiDrv を置換しても
// SpiDrvTest や mySpiDrv は巻き込まない。引用名 ("Spi Drv") も本文の一部として
// 同じ規則で照合する。
window.MA.bulkRename = (function() {
  var WORD = /[A-Za-z0-9_]/;

  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 前後が識別子文字でない出現だけを拾う。lookbehind を使わないのは
  // 古い WebView でも動くようにするため。
  function _scan(dsl, from, onHit) {
    var text = String(dsl == null ? '' : dsl);
    var needle = String(from == null ? '' : from);
    if (!needle) return text;
    var re = new RegExp(escapeRe(needle), 'g');
    var out = '';
    var last = 0;
    var m;
    while ((m = re.exec(text)) !== null) {
      var s = m.index;
      var e = s + m[0].length;
      var beforeOk = s === 0 || !WORD.test(text.charAt(s - 1));
      var afterOk = e >= text.length || !WORD.test(text.charAt(e));
      if (beforeOk && afterOk) {
        out += text.slice(last, s) + onHit(m[0], s);
        last = e;
      }
      if (re.lastIndex === m.index) re.lastIndex++;   // 空マッチ保険
    }
    return out + text.slice(last);
  }

  // 1 本の DSL 中の出現数。
  function countIn(dsl, from) {
    var n = 0;
    _scan(dsl, from, function(hit) { n++; return hit; });
    return n;
  }

  // 1 本の DSL を置換した結果。出現が無ければ元の文字列をそのまま返す。
  function replaceIn(dsl, from, to) {
    var rep = String(to == null ? '' : to);
    return _scan(dsl, from, function() { return rep; });
  }

  // 置換後の名前として使えるか。空白や記号を含むと DSL が壊れるので弾く。
  function isValidTarget(name) {
    return typeof name === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(name);
  }

  // docs: [{ id, name, dsl }] → [{ id, name, count }] (count 0 のものも含む)
  function preview(docs, from) {
    if (!Array.isArray(docs)) return [];
    return docs.map(function(d) {
      return {
        id: d && d.id,
        name: d && d.name,
        count: countIn(d && d.dsl, from),
      };
    });
  }

  function totalCount(docs, from) {
    return preview(docs, from).reduce(function(a, r) { return a + r.count; }, 0);
  }

  // 実際に置換した結果を返す。呼び出し側が workspace / エディタへ反映する。
  // 変更のあったドキュメントだけを changed に載せる。
  function apply(docs, from, to) {
    var result = { changed: [], total: 0, docs: 0 };
    if (!Array.isArray(docs) || !from || !isValidTarget(to) || from === to) return result;
    docs.forEach(function(d) {
      if (!d) return;
      var n = countIn(d.dsl, from);
      if (n === 0) return;
      result.changed.push({ id: d.id, name: d.name, dsl: replaceIn(d.dsl, from, to), count: n });
      result.total += n;
      result.docs++;
    });
    return result;
  }

  // BLK-primary-20260908-1303-wish: 適用する前に「当てたら各図の該当行がどう変わるか」を
  // 並べて見る。ヒット件数 (N 件) だけでは想定外の行に当たっていても気付けず、
  // 適用してから巻き戻すやり直しが要る。ここは置換後の DSL まで作って返すだけで、
  // 行の突き合わせ (before/after) は changeBoard.diffRows に任せる。
  // docs: [{ id, name, dsl, unopened? }] → 当たった図だけを before/after で返す。
  function impact(docs, from, to) {
    var out = { entries: [], total: 0, docs: 0, unopened: 0, valid: false };
    var rep = String(to == null ? '' : to);
    out.valid = !!from && isValidTarget(rep) && from !== rep;
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      if (!d) return;
      var before = String(d.dsl == null ? '' : d.dsl);
      var n = countIn(before, from);
      if (n === 0) return;
      out.entries.push({
        id: d.id, name: d.name, count: n,
        unopened: !!d.unopened,
        before: before,
        // 置換後が未入力・不正のときは「どこに当たっているか」だけ見せる
        // (before と同じ行を並べても読めないので、後ろ側は置換前のまま)。
        after: out.valid ? replaceIn(before, from, rep) : before,
      });
      out.total += n;
      out.docs++;
      if (d.unopened) out.unopened++;
    });
    return out;
  }

  // ボードの 1 行見出し。適用ボタンの文言 (N 件 / M 枚) と同じ数え方にする。
  function impactText(res, from, to) {
    if (!res || res.docs === 0) return '「' + String(from || '') + '」は見つかりません';
    var head = res.total + ' 件 / ' + res.docs + ' 枚'
      + (res.unopened > 0 ? ' (うち未オープン ' + res.unopened + ' 枚)' : '');
    if (!res.valid) return head + ' に当たっています (置換後の名前を入れると変更後が出ます)';
    return head + ' を「' + from + '」→「' + to + '」に置換します';
  }

  // 図に出てくる識別子の候補を集める。置換前の語をプルダウンから選べるようにして
  // タイプ量そのものを減らすため。宣言行の名前を優先的に拾う。
  var DECL_RES = [
    /^\s*(?:participant|actor|boundary|control|entity|database|collections|queue)\s+"?([A-Za-z0-9_][A-Za-z0-9_.-]*)"?/,
    /^\s*(?:abstract\s+class|class|interface|enum|struct|entity)\s+"?([A-Za-z0-9_][A-Za-z0-9_.-]*)"?/,
    /^\s*state\s+"?([A-Za-z0-9_][A-Za-z0-9_.-]*)"?/,
    /^\s*(?:component|node|package|folder|rectangle)\s+"?([A-Za-z0-9_][A-Za-z0-9_.-]*)"?/,
    /^\s*(?:usecase)\s+"?([A-Za-z0-9_][A-Za-z0-9_.-]*)"?/,
  ];
  var ARROW_RE = /^\s*([A-Za-z0-9_][A-Za-z0-9_.-]*)\s*(?:-+>+|<-+|-+|\.+>|<\.+)\s*([A-Za-z0-9_][A-Za-z0-9_.-]*)/;

  function identifiers(docs) {
    var seen = {};
    var out = [];
    function add(name) {
      if (!name || seen[name]) return;
      if (/^(?:as|is|of|to|note|end|alt|else|opt|loop|par|group|activate|deactivate)$/i.test(name)) return;
      seen[name] = true;
      out.push(name);
    }
    (Array.isArray(docs) ? docs : []).forEach(function(d) {
      String((d && d.dsl) || '').split('\n').forEach(function(line) {
        for (var i = 0; i < DECL_RES.length; i++) {
          var m = line.match(DECL_RES[i]);
          if (m) { add(m[1]); return; }
        }
        var a = line.match(ARROW_RE);
        if (a) { add(a[1]); add(a[2]); }
      });
    });
    out.sort();
    return out;
  }

  // detectRename(before, after) — 1 枚の図に起きた「識別子の綴りの直し」を読み取る。
  //
  // BLK-junior-20260916-0046: 表記統一の反映は、同じ直しが保存フォルダの何枚にも
  // 及ぶ。1 枚目を直したその場から一括置換へ渡すために、直した本人に組を打ち直させず
  // 「消えた識別子 1 つ / 増えた識別子 1 つ」を組として拾う。
  // 確実に言えるときだけ答える (消えた・増えたが 1 つずつで、その置換だけで
  // before が after に一致するとき)。曖昧なら null を返し、画面は今までどおり
  // 空の欄を出す (当て推量で別の名前を書き換えさせない)。
  function detectRename(before, after) {
    var b = String(before == null ? '' : before);
    var a = String(after == null ? '' : after);
    if (!b || !a || b === a) return null;
    var bi = identifiers([{ dsl: b }]);
    var ai = identifiers([{ dsl: a }]);
    var inA = {};
    ai.forEach(function(n) { inA[n] = true; });
    var inB = {};
    bi.forEach(function(n) { inB[n] = true; });
    var gone = bi.filter(function(n) { return !inA[n]; });
    var came = ai.filter(function(n) { return !inB[n]; });
    if (gone.length !== 1 || came.length !== 1) return null;
    var from = gone[0];
    var to = came[0];
    if (!isValidTarget(to)) return null;
    // その 1 組を当てるだけで before が after になるか。ならないなら綴り直し
    // 以外の編集も混ざっているので、組として言い切らない。
    if (replaceIn(b, from, to) !== a) return null;
    return { from: from, to: to };
  }

  return {
    countIn: countIn,
    replaceIn: replaceIn,
    detectRename: detectRename,
    isValidTarget: isValidTarget,
    preview: preview,
    totalCount: totalCount,
    apply: apply,
    impact: impact,
    impactText: impactText,
    identifiers: identifiers,
  };
})();
