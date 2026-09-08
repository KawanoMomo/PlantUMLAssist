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

  // build(names) — 保存フォルダの名前一覧 → 部品ごとの棚卸し。
  // 各件: { component, files, rows:[{kind, files, present}], have, missing, unknown }
  function build(names) {
    var CP = _cp();
    if (!CP) return [];
    var groups = CP.groupByComponent(names);
    return groups.map(function(g) { return buildOne(g.component, g.files); });
  }

  function buildOne(component, files) {
    var CP = _cp();
    var list = (Array.isArray(files) ? files : []).filter(function(f) { return _s(f) !== ''; });
    var byKind = {};
    var unknown = [];
    list.forEach(function(f) {
      var k = CP ? CP.kindOf(f) : '';
      if (!k || KINDS.indexOf(k) < 0) { unknown.push(f); return; }
      if (!byKind[k]) byKind[k] = [];
      byKind[k].push(f);
    });
    var rows = KINDS.map(function(k) {
      var fs = (byKind[k] || []).slice().sort();
      return { kind: k, files: fs, present: fs.length > 0 };
    });
    var missing = rows.filter(function(r) { return !r.present; }).map(function(r) { return r.kind; });
    return {
      component: _s(component),
      files: list.slice().sort(),
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
      lines.push('| ' + r.kind + ' | ' + (r.present ? 'あり' : 'なし') + ' | '
        + (r.files.length ? r.files.join(' / ') : '—') + ' |');
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
    text: text,
  };
})();
