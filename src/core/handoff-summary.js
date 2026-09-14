'use strict';
window.MA = window.MA || {};

// handoff-summary — 引き継ぎパッケージの先頭に置く「今日どの図の何を・なぜ直したか」。
//
// BLK-primary-20260914-1906-wish: 📦引き継ぎ zip は 1 押しで作れるが、中身は
// 系統チェック・名前突合・変更サマリ・SVG 一式という「材料」だけで、受け取った新人が
// どこから読めばいいかの道筋が無い。「今日どの図の何を直したか」「なぜ直したか
// (reviewer 指摘との対応)」は口頭かチャットで別途伝える前提になっていた。
//
// ここは材料を並べ替えて道筋にする。今回変更した図を先頭に集め、1 枚ごとに
//   変更点 (± 行数と差分行) / なぜ (手順5.5 で反映した指摘ピンの文言) / 図
// を同じ塊に並べる。指摘の文言は DSL に貼られた指摘ピン (review-pins) から読むので、
// 渡す側が別途書き写す必要が無い (書き写しがあると、それ自体が口頭説明の置き換えにならない)。
//
// DOM にもブラウザ API にも触らない。材料は呼び出し側 (handoff-package) が渡す。
window.MA.handoffSummary = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  function _pins(dsl) {
    var RP = window.MA.reviewPins;
    if (!RP || !RP.list) return [];
    try { return RP.list(dsl) || []; } catch (e) { return []; }
  }

  // 「なぜ直したか」の 1 行。対応済みの指摘だけが理由になる (未対応は宿題として別に出す)。
  // 直した行が分かるものは「修正前 → 修正後」まで添える。指摘 → 修正の対応が
  // 口頭説明なしで追えるのは、この 1 行が揃っているときだけ。
  function reasonLine(pin) {
    var p = pin || {};
    var text = _s(p.text).trim();
    var line = text || '(指摘の本文がありません)';
    if (p.before && p.anchor && p.before !== p.anchor) {
      line += ' — ' + _s(p.before).trim() + ' → ' + _s(p.anchor).trim();
    } else if (p.anchor) {
      line += ' — ' + _s(p.anchor).trim();
    }
    return line;
  }

  // 指摘ピンの行 (DSL のコメント) は図の中身ではない。差分に混ぜると
  // 「指摘を 1 件付けただけで +1 行」と読めてしまうので、変更点からは外す
  // (指摘そのものは「なぜ直したか」として別に出る)。
  function _isPinRow(row) {
    var RP = window.MA.reviewPins;
    if (!RP || !RP.isPinLine || !row) return false;
    var text = (row.kind === 'del') ? row.before : row.after;
    return RP.isPinLine(text);
  }

  function _realRows(rows) {
    return (Array.isArray(rows) ? rows : []).filter(function(r) { return !_isPinRow(r); });
  }

  function _counts(rows) {
    var out = { added: 0, removed: 0 };
    _realRows(rows).forEach(function(r) {
      if (r.kind === 'add') out.added++;
      else if (r.kind === 'del') out.removed++;
    });
    return out;
  }

  // 1 枚の変更点。差分の行数だけでなく「何行目あたりか」までは言わない
  // (行番号は受け取った側で動く)。読むのは中身なので差分行そのものを渡す。
  function changeLine(entry) {
    var e = entry || {};
    if (e.status === 'new') return '新しく作った図 (+' + (e.added || 0) + ' 行)';
    return '+' + (e.added || 0) + ' −' + (e.removed || 0) + ' 行';
  }

  // build(input) — 引き継ぎサマリのモデル。
  //   diagrams = handoff-package の buildSnapshot が作った図の並び
  //              ([{ id, name, diagramType, filename, svg, rendered, dsl }])
  //   board    = change-board.build() の結果 (今回変更した図)
  //   verdicts = { <図名>: [{ verdict, text }] } (review-verdicts.listFor の形。任意)
  function build(input) {
    var o = input || {};
    var diagrams = Array.isArray(o.diagrams) ? o.diagrams : [];
    var entries = (o.board && Array.isArray(o.board.entries)) ? o.board.entries : [];
    var verdicts = o.verdicts || {};

    var byName = {};
    entries.forEach(function(e) {
      if (e && e.name && e.status !== 'same') byName[e.name] = e;
    });

    var rows = diagrams.map(function(d) {
      var entry = byName[d.name] || null;
      var pins = _pins(d.dsl);
      var done = pins.filter(function(p) { return p.state === 'done'; });
      var open = pins.filter(function(p) { return p.state !== 'done'; });
      var vs = (verdicts[d.name] || []).filter(function(v) { return v && v.verdict; });
      var c = entry ? _counts(entry.allRows || entry.rows) : { added: 0, removed: 0 };
      return {
        id: d.id, name: d.name, diagramType: d.diagramType || '',
        filename: d.filename, svg: d.svg || '', rendered: !!d.rendered,
        changed: !!entry,
        status: entry ? entry.status : 'same',
        changeLine: entry
          ? changeLine({ status: entry.status, added: c.added, removed: c.removed })
          : '今回は変えていません',
        added: c.added, removed: c.removed,
        diffRows: entry ? _realRows(entry.rows) : [],
        reasons: done.map(reasonLine),
        openPins: open.map(function(p) { return _s(p.text).trim() || '(指摘の本文がありません)'; }),
        fixCount: vs.filter(function(v) { return v.verdict === '要修正'; }).length,
      };
    });

    // 今回変更した図が先頭。残りは元の並びのまま後ろに続ける (図一式との対応が崩れない)。
    var changed = rows.filter(function(r) { return r.changed; });
    var rest = rows.filter(function(r) { return !r.changed; });

    var reasonCount = 0;
    var openCount = 0;
    changed.forEach(function(r) { reasonCount += r.reasons.length; });
    rows.forEach(function(r) { openCount += r.openPins.length; });

    return {
      changed: changed,
      rest: rest,
      changedCount: changed.length,
      total: rows.length,
      reasonCount: reasonCount,
      openCount: openCount,
    };
  }

  // 節の 1 行。新人がまずここを読んで「今日の話はこの N 枚」と掴む。
  function summaryLine(sum) {
    var s = sum || {};
    if (!s.changedCount) {
      return '今回変更した図はありません (図 ' + (s.total || 0) + ' 枚をそのまま渡します)';
    }
    var txt = '今回変更した図 ' + s.changedCount + '/' + s.total + ' 枚';
    txt += ' ・ 反映した指摘 ' + (s.reasonCount || 0) + ' 件';
    if (s.openCount) txt += ' ・ 未対応の指摘 ' + s.openCount + ' 件 (引き継ぐ宿題)';
    return txt;
  }

  return {
    build: build,
    summaryLine: summaryLine,
    reasonLine: reasonLine,
    changeLine: changeLine,
  };
})();
