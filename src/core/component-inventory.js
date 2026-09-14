'use strict';
window.MA = window.MA || {};

// component-inventory — 1 つの部品について「どの図種があり、どの図種が無いか」を
// 保存フォルダの名前だけで棚卸しする (BLK-junior-20260908-2003-wish)。
//
// 資料化の周は「前周までに作った状態遷移図を開く」から始まる。ところが実データに
// その図が残っていないことがあり、今は手順 1 で一覧を目で舐めて初めて「無い」に
// 気付く。一覧は図種ではなくファイル名の並びなので、「GPIO の 6 図種のうち
// 状態遷移だけ無い」は名前を 22 行読み比べないと言えない。
//
// ここは componentPack の名前解釈 (kindOf / groupByComponent) をそのまま使い、
// 部品ごとに図種の行を「あり (ファイル名) / なし」で埋める。名前に図種の語が
// 無い図は「なし」に数えず、分からないものとして別に出す — 「無い」と
// 「名前から判断できない」を混ぜると、棚卸しの赤が信用できなくなる。
// DOM とファイル I/O には触らない。
window.MA.componentInventory = (function() {

  // 棚卸しで並べる図種と順番。componentPack の設計書での並び順と同じ
  // (資料に貼る順で欠けを見るので、別の順に並べ替えない)。
  var KINDS = ['ユースケース図', 'コンポーネント図', 'クラス図', 'オブジェクト図',
               '配置図', 'シーケンス図', 'アクティビティ図', '状態遷移図'];

  function _cp() { return window.MA.componentPack; }

  function _s(v) { return v == null ? '' : String(v); }

  function kinds() { return KINDS.slice(); }

  // 部品名の突き合わせ。groupByComponent と同じく「片方が他方の頭に丸ごと
  // 収まる」ときだけ同じ部品とみなす (GPIO と GPIOドライバ)。
  function _sameComponent(a, b) {
    var x = _s(a).toLowerCase();
    var y = _s(b).toLowerCase();
    if (!x || !y) return false;
    if (x === y) return true;
    if (x.length < 2 || y.length < 2) return false;
    return x.indexOf(y) === 0 || y.indexOf(x) === 0;
  }

  // build(names, vaultRows) — 保存フォルダの名前一覧 (+ 提出物庫) → 部品ごとの棚卸し。
  // 各件: { component, files, rows:[{kind, files, vault, present, source}], have, missing, unknown }
  //
  // BLK-junior-20260908-2203-wish: 名前だけで数えると、次の周が同じファイル名で
  // 上書きした瞬間に前の周の完走物が「なし」に変わる。実際には提出済みなのに
  // 棚卸しが赤くなるので、庫に積まれているものも「あり」に数える。
  function build(names, vaultRows) {
    var CP = _cp();
    if (!CP) return [];
    var vault = Array.isArray(vaultRows) ? vaultRows : [];
    var groups = CP.groupByComponent(names);
    var out = groups.map(function(g) { return buildOne(g.component, g.files, vault); });
    // ファイルがもう 1 枚も残っていない部品。庫にしか無いのだから、ここで
    // 出さなければ「消えた」ままで、この機能の目的を果たさない。
    var seen = {};
    out.forEach(function(rec) { seen[rec.component] = true; });
    var extras = [];
    vault.forEach(function(r) {
      var s = _s(r && r.subject);
      if (!s) return;
      var known = false;
      out.forEach(function(rec) { if (_sameComponent(rec.component, s)) known = true; });
      if (known || extras.indexOf(s) >= 0) return;
      extras.push(s);
    });
    extras.sort();
    extras.forEach(function(s) { out.push(buildOne(s, [], vault)); });
    out.sort(function(a, b) { return a.component < b.component ? -1 : (a.component > b.component ? 1 : 0); });
    return out;
  }

  function buildOne(component, files, vaultRows) {
    var CP = _cp();
    var list = (Array.isArray(files) ? files : []).filter(function(f) { return _s(f) !== ''; });
    var mine = (Array.isArray(vaultRows) ? vaultRows : []).filter(function(r) {
      return r && _sameComponent(component, r.subject);
    });
    var byKind = {};
    var unknown = [];
    list.forEach(function(f) {
      var k = CP ? CP.kindOf(f) : '';
      if (!k || KINDS.indexOf(k) < 0) { unknown.push(f); return; }
      if (!byKind[k]) byKind[k] = [];
      byKind[k].push(f);
    });
    var vaultByKind = {};
    mine.forEach(function(r) {
      var k = _s(r.kind);
      if (KINDS.indexOf(k) < 0) return;
      if (!vaultByKind[k]) vaultByKind[k] = [];
      vaultByKind[k].push(r);
    });
    var rows = KINDS.map(function(k) {
      // 但し書きの無いもの (本番用) を先頭に置く。名前順のままだと「(資料用)」が
      // 括弧の分だけ前に来て、版の並びが「資料用 / 本番用」と読めてしまう。
      var fs = (byKind[k] || []).slice().sort();
      fs = fs.filter(function(f) { return variantLabel(f) === '本番用'; })
             .concat(fs.filter(function(f) { return variantLabel(f) !== '本番用'; }));
      var vs = (vaultByKind[k] || []).slice();
      // 「どちらにあるか」を分けて持つ。作業ファイルが消えていても提出済みなら
      // あり、という判定の根拠が行から読めないと、棚卸しを信じて次に進めない。
      var source = fs.length && vs.length ? 'both' : (fs.length ? 'file' : (vs.length ? 'vault' : ''));
      return {
        kind: k, files: fs, vault: vs,
        present: fs.length > 0 || vs.length > 0, source: source,
        // BLK-junior-20260914-1106: 同じ図種に複数の版 (本番用 / 資料用 / 編集中) が
        // 並ぶようになった。どれが今回の対象かを「あり」の一語から読み取ることは
        // できないので、版を行の側で名指しできるようにここで持たせる。
        variants: fs.map(function(f) { return { file: f, variant: variantLabel(f) }; }),
      };
    });
    var missing = rows.filter(function(r) { return !r.present; }).map(function(r) { return r.kind; });
    return {
      component: _s(component),
      files: list.slice().sort(),
      vault: mine,
      rows: rows,
      have: rows.length - missing.length,
      total: rows.length,
      missing: missing,
      unknown: unknown.slice().sort(),
    };
  }

  // pick(records, component) — 名前で 1 件取る。大小は問わない。
  function pick(records, component) {
    var want = _s(component).toLowerCase();
    var list = Array.isArray(records) ? records : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && _s(list[i].component).toLowerCase() === want) return list[i];
    }
    return null;
  }

  // pickFor(records, docName) — 開いている図の名前から、その図が属する部品を選ぶ。
  // 資料化はいま開いている部品について始まるので、選び直させない。
  function pickFor(records, docName) {
    var CP = _cp();
    var list = Array.isArray(records) ? records : [];
    var name = _s(docName);
    if (name === '' || !list.length) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].files.indexOf(name) >= 0) return list[i];
    }
    // 拡張子の有無で食い違うことがあるので、拡張子を落として突き合わせ直す。
    var stem = name.replace(/\.[A-Za-z0-9]+$/, '').toLowerCase();
    for (var j = 0; j < list.length; j++) {
      var fs = list[j].files;
      for (var k = 0; k < fs.length; k++) {
        if (fs[k].replace(/\.[A-Za-z0-9]+$/, '').toLowerCase() === stem) return list[j];
      }
    }
    if (!CP) return null;
    var base = CP.baseOf(name).toLowerCase();
    if (base === '') return null;
    for (var m = 0; m < list.length; m++) {
      if (_s(list[m].component).toLowerCase() === base) return list[m];
    }
    return null;
  }

  // 版の名前。括弧付きの但し書き (「(資料用)」「(編集中)」) がそのまま版になる。
  // 但し書きが無いものは「本番用」— 無印を無印のまま出すと、並んだときに
  // 「まだ版が付いていないもの」と「本番用」が同じ空白で並んでしまう。
  function variantLabel(name) {
    var CP = _cp();
    var v = CP && CP.variantOf ? _s(CP.variantOf(name)) : '';
    return v || '本番用';
  }

  // variantsOf(row) — その図種に並んでいる版 (重複は 1 つに畳む)。
  function variantsOf(row) {
    var out = [];
    ((row && row.variants) || []).forEach(function(v) {
      if (v && v.variant && out.indexOf(v.variant) < 0) out.push(v.variant);
    });
    return out;
  }

  // markText(row) — 行の「あり / なし」。版が 2 つ以上あるときは、その場で版を
  // 名指しする。ボタンの文字を全部読んで (資料用) の有無を見比べる手間が、
  // 図種数 × 同居ファイル数で増えていくのを止めるのがここ。
  function markText(row) {
    if (!row || !row.present) return 'なし';
    var vs = variantsOf(row);
    if (vs.length < 2) return 'あり';
    return 'あり: ' + vs.join(' / ');
  }

  // fileLabel(row, name) — 行に並ぶボタンの文字。版が 2 つ以上ある行では、
  // 共通部分が同じ長いファイル名ではなく版そのものを出す (読み比べを無くす)。
  function fileLabel(row, name) {
    var vs = variantsOf(row);
    return vs.length >= 2 ? variantLabel(name) : _s(name);
  }

  // summary(rec) — 見出しの 1 行。欠けている図種はここで名指しする
  // (「3 種なし」だけでは、どれを作り直すかがまだ分からない)。
  function summary(rec) {
    if (!rec) return '部品を選ぶと、図種ごとの有無が出ます';
    var head = rec.component + ' は ' + rec.total + ' 図種中 ' + rec.have + ' 種あり';
    if (!rec.missing.length) return head + '、欠けはありません';
    return head + '、' + rec.missing.length + ' 種なし（' + rec.missing.join(' / ') + '）';
  }

  function summaryClass(rec) {
    if (!rec) return 'inv-none';
    return rec.missing.length ? 'inv-short' : 'inv-ok';
  }

  // text(rec) — 周の頭に控える棚卸し表 (そのまま run ログや設計書のメモに貼れる)。
  function text(rec) {
    if (!rec) return '';
    var lines = ['# ' + rec.component + ' 図種の棚卸し', '', summary(rec), '',
                 '| 図種 | 有無 | ファイル |', '| --- | --- | --- |'];
    rec.rows.forEach(function(r) {
      // 作業ファイルが消えていて庫にしか無い行は、そのことを書く。
      // 「あり」とだけ書くと、開こうとして一覧に無く、また詰まる。
      var where = r.files.length ? r.files.join(' / ')
        : (r.vault && r.vault.length ? '提出物庫 ' + r.vault.length + ' 件（最新 ' + r.vault[0].label + '）' : '—');
      lines.push('| ' + r.kind + ' | ' + markText(r) + ' | ' + where + ' |');
    });
    if (rec.unknown.length) {
      lines.push('');
      lines.push('図種が名前から分からない図: ' + rec.unknown.join(' / '));
    }
    return lines.join('\n') + '\n';
  }

  return {
    kinds: kinds,
    build: build,
    buildOne: buildOne,
    pick: pick,
    pickFor: pickFor,
    summary: summary,
    summaryClass: summaryClass,
    variantLabel: variantLabel,
    variantsOf: variantsOf,
    markText: markText,
    fileLabel: fileLabel,
    text: text,
  };
})();
