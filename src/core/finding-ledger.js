'use strict';

// finding-ledger — 指摘 1 件を 1 行にして、初出 tick から解消 tick までを
// 対象ファイル・行つきで時系列に並べる「台帳」。
//
// BLK-reviewer-20260914-1306-wish: 監査履歴 (audit-timeline) は run ごとの
// 分類の移り変わりを帯で見せるが、1 行が答えるのは「いまの扱い」だけで、
// 「いつから出ているか」「いつ消えたか」「どのファイルの何行目か」は持たない。
// そのため手順1 (前回 BLK を再実行すべきか) と手順8 (前回の指摘が反映されたか) は、
// 毎回 audit.js --summary-json を叩き直し、複数 tick 分の run ログを遡り、
// puml の diff と突き合わせる作業になっていた (直近は 3 件の確認に 4 回叩き直し)。
//
// ここは同じ snapshots を材料に、欠陥の実体ごとに
//   対象ファイル・行 / 初出 tick / 解消 tick / 継続 tick 数 / tick ごとの出欠
// を 1 行へ畳む。画面はこの結果を並べるだけでよく、reviewer は開くだけで済む。
//
// DOM には触らない。描画と結線は app.js。node からも require できる。
(function() {
  var TL = (typeof require !== 'undefined')
    ? require('./audit-timeline')
    : (typeof window !== 'undefined' && window.MA ? window.MA.auditTimeline : null);

  // クラス / メソッド / イベントの突合。台帳の既定の対象はこの 3 つ
  // (reviewer の手順2〜7 で毎回読むのがここで、解消確認を一番やり直している)。
  var FOCUS = [
    'method.issues',
    'consistency.methods',
    'consistency.events',
    'consistency.naming',
    'consistency.unused',
    'consistency.granularity',
    'name.variants',
    'name.undeclared',
  ];

  function _s(v) { return v === null || v === undefined ? '' : String(v); }

  function _catNames(kinds) {
    var cats = {};
    (kinds || []).forEach(function(k) {
      var name = (TL && TL.CATEGORY && TL.CATEGORY[k]) || k;
      cats[name] = true;
    });
    return cats;
  }

  // ---- 行の解決 -------------------------------------------------------------

  // 図名の揺れ (拡張子の有無・フォルダ付き) を落として突き合わせる。
  function _docKey(name) {
    return _s(name).replace(/\\/g, '/').split('/').pop().replace(/\.(puml|plantuml|txt|svg)$/i, '').toLowerCase();
  }

  function _docIndex(docs) {
    var m = {};
    (docs || []).forEach(function(d) {
      if (!d) return;
      var k = _docKey(d.name || d.doc || '');
      if (k && m[k] === undefined) m[k] = _s(d.dsl || d.text || '');
    });
    return m;
  }

  // その図の本文で、指摘の綴りが最初に現れる行。見つからなければ 0
  // (「本文からは特定できない」を 1 行目と偽らない)。
  function _lineOf(dsl, terms) {
    if (!dsl) return 0;
    var lines = dsl.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      for (var j = 0; j < terms.length; j++) {
        var t = terms[j];
        if (t && lines[i].indexOf(t) >= 0) return i + 1;
      }
    }
    return 0;
  }

  // ---- 組み立て -------------------------------------------------------------

  // snapshots (古い順) → 台帳。
  // opts: { snapshots, docs, kinds }。kinds 省略時は FOCUS、null を渡すと全カテゴリ。
  function build(opts) {
    var o = opts || {};
    var snaps = (o.snapshots || []).slice();
    var t = TL ? TL.build(snaps) : { runs: [], rows: [] };
    var want = (o.kinds === null) ? null : _catNames(o.kinds || FOCUS);
    var index = _docIndex(o.docs);

    var ticks = t.runs.map(function(r, i) {
      return { index: i, label: r.label, at: r.at, count: r.count, docs: r.docs };
    });

    var rows = [];
    t.rows.forEach(function(row) {
      var cells = row.cells || [];
      if (want) {
        var hit = cells.some(function(c) {
          return c && c.cats.some(function(name) { return want[name]; });
        });
        if (!hit) return;
      }

      var first = -1, last = -1;
      cells.forEach(function(c, i) {
        if (!c) return;
        if (first < 0) first = i;
        last = i;
      });
      if (first < 0) return;

      // 解消 tick = 最後に出た次の tick。まだ最新 tick に出ていれば解消していない。
      var open = last === cells.length - 1;
      var resolvedIndex = open ? -1 : last + 1;

      // 対象ファイルと綴りは、出ている tick すべてから集める (最後の tick で
      // カテゴリが変わって doc が落ちても、初出のファイルが台帳から消えない)。
      var docs = [], terms = [], cats = [];
      cells.forEach(function(c) {
        if (!c) return;
        (c.docs || []).forEach(function(d) { if (docs.indexOf(d) < 0) docs.push(d); });
        (c.terms || []).forEach(function(x) { if (terms.indexOf(x) < 0) terms.push(x); });
      });
      cats = cells[last] ? cells[last].cats.slice() : [];

      var where = docs.map(function(d) {
        return { doc: d, line: _lineOf(index[_docKey(d)], terms) };
      });

      rows.push({
        entity: row.entity,
        title: row.title,
        cats: cats,
        status: row.status,
        open: open,
        since: ticks[first] ? ticks[first].label : '',
        sinceIndex: first,
        lastSeen: ticks[last] ? ticks[last].label : '',
        resolvedAt: resolvedIndex >= 0 && ticks[resolvedIndex] ? ticks[resolvedIndex].label : null,
        resolvedIndex: resolvedIndex,
        // 初出から最後に出た tick までの長さ。「3 tick 目」と数えるのはこれ。
        ticks: last - first + 1,
        marks: cells.map(function(c) { return !!c; }),
        spark: cells.map(function(c) { return c ? '●' : '○'; }).join(''),
        where: where,
      });
    });

    // 時系列。古い指摘を上に、同じ初出なら未解消を先に、あとは綴り順。
    rows.sort(function(a, b) {
      if (a.sinceIndex !== b.sinceIndex) return a.sinceIndex - b.sinceIndex;
      if (a.open !== b.open) return a.open ? -1 : 1;
      return a.title < b.title ? -1 : (a.title > b.title ? 1 : 0);
    });

    var counts = { open: 0, resolved: 0, fresh: 0 };
    rows.forEach(function(r) {
      if (r.open) counts.open++; else counts.resolved++;
      if (r.sinceIndex === ticks.length - 1 && ticks.length > 1) counts.fresh++;
    });

    return { ticks: ticks, rows: rows, counts: counts, kinds: o.kinds === null ? null : (o.kinds || FOCUS) };
  }

  function summaryLine(view) {
    if (!view || !view.ticks.length) return '記録がありません (監査を 1 回記録すると台帳が立ち上がります)';
    var c = view.counts;
    return view.ticks.length + ' tick 分 / 未解消 ' + c.open + ' 件 (うち今回初出 ' + c.fresh
      + ' 件) / 解消済み ' + c.resolved + ' 件';
  }

  function whereText(row) {
    if (!row || !row.where.length) return '対象ファイル不明';
    return row.where.map(function(w) {
      return w.doc + (w.line ? ':' + w.line : '');
    }).join(' , ');
  }

  // 未解消のうち、前回 tick から 1 つも動いていないもの。手順1 の
  // 「前回の BLK をもう一度出すか」はこの一覧がそのまま答えになる。
  function carriedOver(view) {
    if (!view) return [];
    return view.rows.filter(function(r) { return r.open && r.ticks >= 2; });
  }

  function resolvedRows(view) {
    return view ? view.rows.filter(function(r) { return !r.open; }) : [];
  }

  // 指摘文書にそのまま貼れる形。ここまで出せば audit.js を叩き直す用が無くなる。
  function markdown(view, title) {
    var lines = ['# ' + (title || '指摘の台帳'), '', summaryLine(view), ''];
    if (!view || !view.ticks.length) return lines.join('\n');

    lines.push('記録した tick: ' + view.ticks.map(function(t) { return t.label; }).join(' → '));
    lines.push('');

    var carried = carriedOver(view);
    var fresh = view.rows.filter(function(r) { return r.open && r.ticks < 2; });
    var gone = resolvedRows(view);

    function section(head, rows, fn) {
      lines.push('## ' + head + '（' + rows.length + ' 件）');
      if (!rows.length) { lines.push('- なし'); lines.push(''); return; }
      rows.forEach(function(r) { lines.push('- ' + fn(r)); });
      lines.push('');
    }

    section('継続', carried, function(r) {
      return r.title + ' — ' + whereText(r) + '｜初出 ' + r.since + '（' + r.ticks + ' tick 目）｜'
        + r.cats.join('+');
    });
    section('今回初出', fresh, function(r) {
      return r.title + ' — ' + whereText(r) + '｜初出 ' + r.since + '｜' + r.cats.join('+');
    });
    section('解消', gone, function(r) {
      return r.title + ' — ' + whereText(r) + '｜初出 ' + r.since + '｜解消 ' + r.resolvedAt
        + '（' + r.ticks + ' tick 出ていました）';
    });

    lines.push('## 出欠（' + view.ticks.map(function(t) { return t.label; }).join(' / ') + '）');
    view.rows.forEach(function(r) { lines.push('- ' + r.spark + ' ' + r.title); });
    return lines.join('\n');
  }

  var api = {
    FOCUS: FOCUS,
    build: build, summaryLine: summaryLine, whereText: whereText,
    carriedOver: carriedOver, resolvedRows: resolvedRows, markdown: markdown,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.findingLedger = api;
  }
})();
