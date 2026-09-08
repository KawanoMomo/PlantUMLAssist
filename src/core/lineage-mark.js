'use strict';
// lineage-mark — 継承元の差分を「自分の図のどの図形か」に翻訳する。
//
// BLK-junior-20260908-1703-wish: 「⇡ 継承元」で更新の有無と差分行数までは
// 出るようになったが、増えた行が画面のどこなのかは相変わらず自分で探す。
// GpioDrv から伸びる矢印が 5 本あって見た目が同じなら、目的の 1 本 (IrqCtrl
// への依存) は 1 本ずつクリックして右パネルを読むまで分からない。
//
// 継承元の増減行は「継承元の DSL の行」であって、自分の図の行番号ではない。
// そこで行の文字列そのものではなく、行が名指している相手 (関係なら両端の名前、
// 宣言なら名前と別名) を鍵にして、自分の図の同じ相手を指す行を引き当てる。
// 先輩がラベルを足しただけの `GpioDrv ..> IrqCtrl : uses` は、ラベルの無い
// 自分の `GpioDrv ..> IrqCtrl` と同じ鍵になるので当たる。
//
// DOM を触るのは apply/clear だけ。鍵の作り方は純関数として切り出す。
window.MA = window.MA || {};
window.MA.lineageMark = (function() {

  var MARK_CLASS = 'lg-mark';

  // 鍵にしない語 (図種の宣言キーワード・向きの語)。名前として数えると
  // `component Foo` と `node Foo` が別物になったり、`note left of A` が
  // A を指す行として当たってしまう。
  var STOP = {};
  ('as component class interface actor participant usecase package node database '
    + 'rectangle folder together entity boundary control artifact cloud storage queue '
    + 'agent port state abstract enum object collections note of left right top bottom '
    + 'over up down activate deactivate return alt else opt loop par group end ref '
    + 'title header footer legend skinparam hide show scale namespace').split(' ')
    .forEach(function(w) { STOP[w] = true; });

  // 行そのものを鍵にしない語。図形を名指していないので、当たっても意味がない。
  var LINE_STOP = /^(skinparam|title|header|footer|legend|hide|show|scale|autonumber|caption|left\s+to\s+right|top\s+to\s+bottom|end\b|newpage|together|allowmixing)/i;

  function _isDirective(s) {
    if (!s) return true;
    var c = s.charAt(0);
    if (c === "'" || c === '@' || c === '!' || c === '#' || c === '}' || c === '{') return true;
    return LINE_STOP.test(s);
  }

  // 1 行から「その行が名指している相手」を出現順に取り出す。
  // ラベル (最初の ' : ' から右) と装飾 (<<...>>, [#色]) は落とす。
  function namesOf(raw) {
    var s = String(raw == null ? '' : raw).replace(/\r/g, '').replace(/^\s+|\s+$/g, '');
    if (_isDirective(s)) return [];
    // ラベルを落とす。`A -> B : text` も `S1 : do work` も右側は本文なので鍵にしない。
    var m = s.match(/^(.*?)\s+:\s?(.*)$/);
    if (m) s = m[1];
    else {
      var t = s.match(/^(.*?):(.*)$/);
      if (t && /[-.>|o*]/.test(t[1])) s = t[1];
    }
    s = s.replace(/<<[^>]*>>/g, ' ');          // ステレオタイプ
    s = s.replace(/\[\s*#[^\]]*\]/g, ' ');     // 矢印の色指定 -[#red]->
    s = s.replace(/#[0-9A-Za-z]+\s*$/, ' ');   // 行末の背景色
    var out = [];
    var re = /"([^"]*)"|\[([^\]]*)\]|\(([^)]*)\)|([A-Za-z_À-￿][A-Za-z0-9_À-￿.]*)/g;
    var g;
    while ((g = re.exec(s)) !== null) {
      var v = g[1] != null ? g[1] : (g[2] != null ? g[2] : (g[3] != null ? g[3] : g[4]));
      if (v == null) continue;
      v = String(v).replace(/^\s+|\s+$/g, '');
      if (!v) continue;
      if (g[4] != null && STOP[v.toLowerCase()]) continue;
      out.push(v);
    }
    return out;
  }

  // 行の鍵。名前が 1 つも無ければ '' (鍵にならない行)。
  function keyOf(raw) {
    var n = namesOf(raw);
    return n.length ? n.join('|') : '';
  }

  // 関係の行は向きが逆でも同じ相手を指す (`A <-- B` と `B --> A`)。
  // 2 つ名指す行だけ、逆順の鍵も当たりにする。
  function altKeyOf(raw) {
    var n = namesOf(raw);
    if (n.length !== 2) return '';
    return n[1] + '|' + n[0];
  }

  // 自分の図の DSL から 鍵 → 行番号(1 始まり) の索引。同じ鍵が複数行にあれば全部持つ。
  function indexOf(dsl) {
    var idx = {};
    var lines = String(dsl == null ? '' : dsl).replace(/\r\n?/g, '\n').split('\n');
    lines.forEach(function(text, i) {
      var k = keyOf(text);
      if (!k) return;
      if (!idx[k]) idx[k] = [];
      idx[k].push(i + 1);
    });
    return idx;
  }

  // 継承元の差分 (lineage.diffLines の戻り) と自分の図の DSL から、
  // 「色を付ける行」と「自分の図にまだ無い行」を出す。
  // 減った行も対象にする (先輩が消した関係は、自分の図では消す候補になる)。
  function plan(diff, childDsl) {
    var idx = indexOf(childDsl);
    var lines = {};
    var matched = [];
    var missing = [];
    function walk(list, kind) {
      (list || []).forEach(function(text) {
        var k = keyOf(text);
        if (!k) return;
        var hit = idx[k];
        if (!hit) {
          var alt = altKeyOf(text);
          if (alt && idx[alt]) hit = idx[alt];
        }
        if (!hit || !hit.length) {
          missing.push({ kind: kind, key: k, text: String(text) });
          return;
        }
        hit.forEach(function(n) { lines[n] = true; });
        matched.push({ kind: kind, key: k, text: String(text), lines: hit.slice() });
      });
    }
    walk(diff && diff.added, 'add');
    walk(diff && diff.removed, 'del');
    var nums = Object.keys(lines).map(Number).sort(function(a, b) { return a - b; });
    return { lines: nums, matched: matched, missing: missing };
  }

  // 画面に出す 1 行。当たった図形が無いときも黙らない (探し続けさせない)。
  function summaryLine(p) {
    if (!p) return '色を付けられる行がありません';
    if (!p.lines.length && !p.missing.length) return '継承元との差分がありません';
    if (!p.lines.length) {
      return '継承元の変更 ' + p.missing.length + ' 行は、いまの図に対応する図形がありません (足す側の変更です)';
    }
    var s = '差分に対応する図形 ' + p.lines.length + ' 個を色付け';
    if (p.missing.length) s += ' (対応が無い変更 ' + p.missing.length + ' 行は下)';
    return s;
  }

  // ── DOM ─────────────────────────────────────────────────
  // line-peek と同じ作法。selected / peek とは別の class なので選択を壊さない。
  function apply(overlayEl, lines) {
    if (!overlayEl || !overlayEl.querySelectorAll) return 0;
    clear(overlayEl);
    var n = 0;
    (lines || []).forEach(function(line) {
      var num = parseInt(line, 10);
      if (isNaN(num) || num < 1) return;
      var hits = overlayEl.querySelectorAll('rect.selectable[data-line="' + num + '"]');
      Array.prototype.forEach.call(hits, function(r) { r.classList.add(MARK_CLASS); n++; });
    });
    return n;
  }

  function clear(overlayEl) {
    if (!overlayEl || !overlayEl.querySelectorAll) return 0;
    var all = overlayEl.querySelectorAll('rect.' + MARK_CLASS);
    Array.prototype.forEach.call(all, function(r) { r.classList.remove(MARK_CLASS); });
    return all.length;
  }

  return {
    MARK_CLASS: MARK_CLASS,
    namesOf: namesOf,
    keyOf: keyOf,
    altKeyOf: altKeyOf,
    indexOf: indexOf,
    plan: plan,
    summaryLine: summaryLine,
    apply: apply,
    clear: clear,
  };
})();
