'use strict';
window.MA = window.MA || {};

// symptom-systems — 症状文を「系統ごと」に割って、系統ごとの図をぜんぶ並べる。
//
// BLK-primary-20260909-0203-wish: 症状検索は当たった図を関連度順の 1 本の列で
// 返していた。1 系統の不具合ならそれで足りるが、実務の症状文は
// 「SPI 初期化直後に DMA 転送が完了しないままタイムアウトする。割り込みは一度も
// 発火していない」のように SPI 起点 → DMA 停止 → IRQ 未発火 と複数系統に
// またがる。関連度は「1 つの図に強く当たった語の重みの合計」なので、SPI の図が
// 上位を占め、DMA の図は下に沈むか、そもそも開いていなければ列に出ない。
// 利用者は「SPI の図を見て手詰まり」で終わり、DMA・IRQ の入口があること自体に
// 気付けない。
//
// ここでは列を「語 (= 系統)」で割る。語ごとにその語が当たった図を全部並べれば、
// 系統の取りこぼしは「その語の行が空か」で目に見える。系統の名前を辞書で持たない
// のは、系統名 (SPI / DMA / IRQ / Watchdog / …) は図の側にしか無く、辞書を持てば
// 辞書に無い系統だけが静かに落ちるため。
//
// 系統語と動作語の区別も図の側で決める: その語が宣言 (participant / class /
// state / component / usecase) か title に当たっていれば系統語、矢印ラベルにしか
// 当たっていなければ動作語 (「転送」「完了」は系統ではない)。
window.MA.symptomSystems = (function() {

  // 宣言と title は「その図が何の図か」を名乗る行なので、系統の根拠になる。
  var STRUCT_ROLES = {
    participant: true, class: true, state: true,
    component: true, usecase: true, title: true,
  };

  function _isStruct(role) { return !!STRUCT_ROLES[role]; }

  // 1 語がその図に当たった分だけを取り出す。symptomSearch.scoreDoc を語 1 つで
  // 呼び直すことで、「その語の当たり」だけの得点・行・役割が得られる
  // (search() の hits は図あたりの最良 1 件しか残さないので、これが要る)。
  function _hitOf(ss, dsl, term) {
    var r = ss.scoreDoc(dsl, [term]);
    if (!r || r.score === 0 || !r.hits.length) return null;
    return { score: r.score, hit: r.hits[0] };
  }

  // docs: [{ id, name, dsl }] → 系統ごとの行。
  // { systems: [...], actions: [...], missed: [語...], terms: [語...] }
  //   systems[i] = { term, docs: [{ id, name, kind, kindLabel, score, line,
  //                                 target, label, role, open }], docCount }
  // systems は「当たった図の枚数が多い順 → 得点の高い順 → 症状文での出現順」。
  // 枚数を先に見るのは、複数系統の不具合では「入口の数」のほうが順位より効くため
  // (1 枚しか無い系統は最後に見ればよい)。
  function group(docs, text) {
    var ss = window.MA && window.MA.symptomSearch;
    var is = window.MA && window.MA.impactScan;
    var termList = ss ? ss.terms(text) : [];
    var list = Array.isArray(docs) ? docs : [];
    var systems = [];
    var actions = [];
    var missed = [];

    termList.forEach(function(term, ti) {
      var rows = [];
      var struct = false;
      list.forEach(function(d, di) {
        if (!d) return;
        var h = _hitOf(ss, d.dsl, term);
        if (!h) return;
        if (_isStruct(h.hit.role)) struct = true;
        var kind = is ? is.detectKind(d.dsl) : 'other';
        rows.push({
          id: d.id, name: d.name, order: di, term: term,
          kind: kind,
          kindLabel: is ? (is.KIND_LABEL[kind] || 'その他') : 'その他',
          score: h.score,
          line: h.hit.line,
          target: h.hit.target,
          label: h.hit.label,
          role: h.hit.role,
          open: d.open !== false,
        });
      });
      if (!rows.length) { missed.push(term); return; }
      rows.sort(function(a, b) { return b.score - a.score || a.order - b.order; });
      var row = { term: term, order: ti, docs: rows, docCount: rows.length, top: rows[0].score };
      (struct ? systems : actions).push(row);
    });

    systems.sort(function(a, b) {
      return b.docCount - a.docCount || b.top - a.top || a.order - b.order;
    });
    actions.sort(function(a, b) {
      return b.docCount - a.docCount || b.top - a.top || a.order - b.order;
    });
    return { systems: systems, actions: actions, missed: missed, terms: termList };
  }

  // 系統の行に出す 1 行。「DMA — 2 図 (状態遷移図・シーケンス図)」。
  function systemLabel(row) {
    if (!row) return '';
    var kinds = [];
    var seen = {};
    (row.docs || []).forEach(function(d) {
      if (!d || seen[d.kindLabel]) return;
      seen[d.kindLabel] = true;
      kinds.push(d.kindLabel);
    });
    return row.term + ' — ' + row.docCount + ' 図 (' + kinds.join('・') + ')';
  }

  // 見出し。系統の数と、図の無い語をそのまま言う。系統が 1 つしか立っていない
  // ことも言う (「1 系統しか当たっていない」は、症状文の語が足りない合図)。
  function headline(g) {
    if (!g || !g.terms.length) return '症状を貼ると系統ごとに図が並びます';
    var n = g.systems.length;
    if (n === 0) return '系統に当たる語がありません / 部品名の語を足してください';
    var docs = {};
    g.systems.forEach(function(s) {
      s.docs.forEach(function(d) { docs[String(d.id)] = true; });
    });
    var txt = n + ' 系統 / ' + Object.keys(docs).length + ' 図';
    if (n === 1) txt += ' — 1 系統だけです。他の系統の語を足してください';
    if (g.missed.length) txt += ' / 当たらなかった語: ' + g.missed.join('・');
    return txt;
  }

  return {
    group: group,
    systemLabel: systemLabel,
    headline: headline,
    STRUCT_ROLES: STRUCT_ROLES,
  };
})();
