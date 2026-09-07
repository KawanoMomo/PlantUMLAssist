'use strict';
window.MA = window.MA || {};

// family-audit — 同じ系統の複数枚を横に並べ、動作名の食い違いを機械的に出す。
//
// ADC 系の init sequence / state / class が揃っているか、DMA 系の sequence の
// メッセージ列と state の遷移列の粒度が合っているかは、今は 3 枚を開いて目で
// 追うしかない。ここは「系統 (図の名前の頭を共有する複数枚)」でまとめ、
// 各図の矢印ラベル (sequence のメッセージ、state の遷移) を突き合わせて、
// どちらか一方にしか無い名前を出す。DOM には触らない。
window.MA.familyAudit = (function() {
  // 矢印行のラベル。`A -> B : Label` / `A --> B : Label` の `:` 以降を取る。
  // 左右の名前は name-audit の職掌なのでここでは見ない。
  var ARROW_LABEL_RE = /^\s*(?:"[^"]+"|\[\*\]|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*(?:-+>+|<-+|\.+>|<\.+|-{2,})\s*(?:"[^"]+"|\[\*\]|[A-Za-z0-9_][A-Za-z0-9_.-]*)\s*:\s*(.+?)\s*$/;

  // 図の骨組み。ラベルとして数えない。
  var SKIP_LINE_RE = /^\s*(?:@|'|note|end|alt|else|opt|loop|par|break|critical|group|ref|activate|deactivate|title|header|footer|legend|skinparam|hide|show|autonumber|newpage|scale|caption)/i;

  // 突合キー。大小・区切り・番号付け・矢印装飾を落とすので
  // 「1. ConfigureChannel」「configure_channel」「Configure Channel()」は同じ組。
  function normalizeAction(label) {
    var s = String(label == null ? '' : label);
    s = s.replace(/^\s*\d+[.):]\s*/, '');            // 手番号「3. 」
    s = s.replace(/<<[^>]*>>/g, ' ');                 // ステレオタイプ
    s = s.replace(/\[[^\]]*\]/g, ' ');                // ガード条件 [ok]
    s = s.replace(/\([^)]*\)/g, ' ');                 // 引数リスト
    s = s.replace(/<\/?[a-z][^>]*>/gi, ' ');          // creole の色タグ等
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // 系統キー。図の名前の頭の 1 語 (Adc_Init / adc-state / AdcClass はすべて adc)。
  // camelCase の 2 語目以降は落とす。区切りも語境界も無ければ名前全体を系統とする。
  function familyKeyOf(docName) {
    var s = String(docName == null ? '' : docName).trim();
    s = s.replace(/\.(puml|plantuml|uml|txt)$/i, '');
    if (!s) return '';
    var head = s.split(/[\s_\-.]+/)[0];
    var camel = head.match(/^[A-Z]?[a-z0-9]+|^[A-Z]+(?![a-z])/);
    if (camel && camel[0] && camel[0].length < head.length) head = camel[0];
    return head.toLowerCase();
  }

  // 1 枚から動作名を順序どおりに拾う。同じ名前が 2 度出ても 1 件に畳む
  // (回数ではなく「その名前があるか」を突き合わせる)。
  function actionsOf(dsl) {
    var out = [];
    var seen = {};
    String(dsl == null ? '' : dsl).split(/\r?\n/).forEach(function(line) {
      if (SKIP_LINE_RE.test(line)) return;
      var m = line.match(ARROW_LABEL_RE);
      if (!m) return;
      var label = m[1].trim();
      var key = normalizeAction(label);
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push({ label: label, key: key });
    });
    return out;
  }

  // 系統ごとの束。2 枚以上ある系統だけを返す (1 枚では突き合わせにならない)。
  function groupFamilies(docs) {
    var byKey = {};
    var order = [];
    (docs || []).forEach(function(d) {
      var k = familyKeyOf(d && d.name);
      if (!k) return;
      if (!byKey[k]) { byKey[k] = { key: k, docs: [] }; order.push(k); }
      byKey[k].docs.push(d);
    });
    return order.map(function(k) { return byKey[k]; })
      .filter(function(g) { return g.docs.length >= 2; });
  }

  // 系統 1 つの突合表。rows は動作名 × 図の在/不在、onlyIn は 1 枚にしか
  // 無い名前 (= 粒度不一致か書き漏らしの候補)。
  function compareFamily(docs) {
    var list = (docs || []).map(function(d) {
      // id は画面が「その図へ飛ぶ」ために持ち回るだけ。突合には使わない。
      return { id: d.id, name: d.name, diagramType: d.diagramType || '', actions: actionsOf(d.dsl) };
    });
    var rows = [];
    var index = {};
    list.forEach(function(doc, di) {
      doc.actions.forEach(function(a) {
        var row = index[a.key];
        if (!row) {
          row = { key: a.key, label: a.label, present: list.map(function() { return false; }) };
          index[a.key] = row;
          rows.push(row);
        }
        row.present[di] = true;
      });
    });
    rows.forEach(function(r) {
      var hits = [];
      for (var i = 0; i < r.present.length; i++) if (r.present[i]) hits.push(list[i].name);
      r.count = hits.length;
      r.onlyIn = (hits.length === 1 && list.length >= 2) ? hits[0] : null;
    });
    var withActions = list.filter(function(d) { return d.actions.length > 0; }).length;
    return {
      docs: list,
      rows: rows,
      // 動作名を 1 つも持たない図が混ざっていると「片方にしか無い」が
      // 全件になって意味を失うので、突合が成立したかを別に持つ。
      comparable: withActions >= 2,
      mismatches: rows.filter(function(r) { return !!r.onlyIn; }),
    };
  }

  function audit(docs) {
    return groupFamilies(docs).map(function(g) {
      var c = compareFamily(g.docs);
      c.key = g.key;
      return c;
    });
  }

  // 画面の見出し 1 行。0 件なら「揃っています」と言い切る。
  function summaryLine(family) {
    if (!family) return '';
    if (!family.comparable) return '突き合わせる動作名が 2 枚ぶん揃っていません';
    var n = family.mismatches.length;
    return n === 0
      ? '動作名は ' + family.docs.length + ' 枚で揃っています (食い違い 0 件)'
      : '片方にしか無い動作名 ' + n + ' 件';
  }

  return {
    normalizeAction: normalizeAction,
    familyKeyOf: familyKeyOf,
    actionsOf: actionsOf,
    groupFamilies: groupFamilies,
    compareFamily: compareFamily,
    audit: audit,
    summaryLine: summaryLine,
  };
})();
