'use strict';
window.MA = window.MA || {};

// name-unify — 登録簿で決めた正式表記を、保存フォルダの全図へ 1 回で当てる。
//
// BLK-junior-20260916-0046-wish: 指摘の「表記揺れ 4 組を canonical に揃える」は、
// 揃える先そのものは既に `_names.json` (name-registry) で決まっている。それでも
// junior は「どのファイルにその揺れが残っているか」を知る手段が無いので、
// 登録簿と 📂 一覧を見比べ、該当しそうな図を 1 枚ずつ開いて本文を読み、
// 該当語があれば直して保存する、を 10 回繰り返していた。探す工程が丸ごと手作業で、
// 手数はファイル枚数に比例して増える。
//
// ⇄ 一括置換は「置換前・置換後」を人が打つ道具で、打つ前に「何を打つべきか」を
// 知っている必要がある。ここはその手前を埋める: **揃える先は登録簿が知っている**
// のだから、組を選べば残っている揺れとその在処は機械が出せる。
//
// 置換の規則は bulkRename と同じ識別子単位 (前後が [A-Za-z0-9_] でない出現)。
// 規則を 2 つ持たないので、ここが数えた件数は ⇄ 一括置換のヒット数と必ず一致する。
// DOM にも fetch にも触らない。ファイルの読み書きは app.js / workspace の側。
window.MA.nameUnify = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  function _br() { return window.MA && window.MA.bulkRename; }

  // 1 本の DSL に、この組の「揺れ」が何件残っているか。
  // canonical そのものは数えない (揃っている出現は直す対象ではない)。
  function countIn(dsl, entry) {
    var br = _br();
    if (!br || !entry) return 0;
    var n = 0;
    (entry.variants || []).forEach(function(v) {
      if (!v || v === entry.canonical) return;
      n += br.countIn(dsl, v);
    });
    return n;
  }

  // 揺れの内訳。どの綴りが何件残っているかを出す
  // (「IrqCtrl が 3 件」まで見えないと、当てる前に本文を開いて確かめ直すことになる)。
  function hitsIn(dsl, entry) {
    var br = _br();
    var out = [];
    if (!br || !entry) return out;
    (entry.variants || []).forEach(function(v) {
      if (!v || v === entry.canonical) return;
      var n = br.countIn(dsl, v);
      if (n > 0) out.push({ from: v, count: n });
    });
    return out;
  }

  // applyTo — 1 本の DSL の揺れを全部 canonical に寄せる。
  // 返り値: { dsl, count }。当たらなければ元の本文をそのまま返す。
  function applyTo(dsl, entry) {
    var br = _br();
    var text = _s(dsl);
    if (!br || !entry || !entry.canonical) return { dsl: text, count: 0 };
    var count = 0;
    (entry.variants || []).forEach(function(v) {
      if (!v || v === entry.canonical) return;
      var n = br.countIn(text, v);
      if (n === 0) return;
      count += n;
      text = br.replaceIn(text, v, entry.canonical);
    });
    return { dsl: text, count: count };
  }

  // scan — 登録簿 × ファイル一覧 → 「まだ揺れが残っている組」だけの一覧。
  //   reg:   name-registry の登録簿 ({ entries: [...] })
  //   files: [{ name, dsl }] (開いているタブと保存フォルダの図を混ぜてよい。
  //          同じ name が 2 度来たら先勝ちで 1 枚と数える)
  // 返り値: [{ key, canonical, variants, total, docs, files: [{ name, count, hits }] }]
  //   並びは canonical の昇順 (登録簿と同じ並び。run ごとに順が動かない)。
  // 揺れが 0 件の組は出さない — 「当てるものが無い組」を一覧に並べると、
  // 選ぶ側がどれを押せばよいか決められない。
  function scan(reg, files) {
    var entries = (reg && reg.entries) || [];
    var list = Array.isArray(files) ? files : [];
    var out = [];
    entries.forEach(function(e) {
      if (!e || !e.canonical || !(e.variants || []).length) return;
      var seen = {};
      var rows = [];
      var total = 0;
      list.forEach(function(f) {
        if (!f || !f.name || seen[f.name]) return;
        seen[f.name] = true;
        var n = countIn(f.dsl, e);
        if (n === 0) return;
        total += n;
        rows.push({ name: f.name, count: n, hits: hitsIn(f.dsl, e) });
      });
      if (!rows.length) return;
      rows.sort(function(a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
      out.push({
        key: e.key, canonical: e.canonical, variants: (e.variants || []).slice(),
        total: total, docs: rows.length, files: rows,
      });
    });
    return out;
  }

  // 組 1 件を選ぶ札の文言。「揃える先 ← 残っている綴り (N ファイル M 件)」。
  function label(group) {
    if (!group) return '';
    var froms = {};
    (group.files || []).forEach(function(f) {
      (f.hits || []).forEach(function(h) { froms[h.from] = true; });
    });
    var names = Object.keys(froms).sort();
    return group.canonical + ' ← ' + (names.join(' / ') || '—')
      + ' (' + group.docs + ' ファイル ' + group.total + ' 件)';
  }

  // 画面上端の 1 行。登録簿を読めていない (null) と 0 組は別の意味なので分ける。
  function summaryLine(groups) {
    if (!groups) return '登録簿を読めていません';
    if (!groups.length) return '登録簿の表記はすべて揃っています';
    var total = groups.reduce(function(a, g) { return a + g.total; }, 0);
    return groups.length + ' 組 / ' + total + ' 件が揃っていません';
  }

  // plan — 選んだ組と「当てるファイル名」から、書き戻す本文を作る。
  //   group: scan() の 1 件 / texts: name → dsl / picked: 当てるファイル名の配列
  // 返り値: [{ name, before, after, count }] (当たらなかったファイルは載せない)
  function plan(group, texts, picked) {
    var out = [];
    if (!group) return out;
    var want = {};
    (picked || []).forEach(function(n) { want[n] = true; });
    (group.files || []).forEach(function(f) {
      if (!want[f.name]) return;
      var before = _s(texts && texts[f.name]);
      var r = applyTo(before, group);
      if (r.count === 0) return;
      out.push({ name: f.name, before: before, after: r.dsl, count: r.count });
    });
    return out;
  }

  return {
    countIn: countIn,
    hitsIn: hitsIn,
    applyTo: applyTo,
    scan: scan,
    label: label,
    summaryLine: summaryLine,
    plan: plan,
  };
})();
