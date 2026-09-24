'use strict';
window.MA = window.MA || {};

// file-tree — レール右の FILES ツリーの中身を組む (design 10a)。
//
// BLK-human-20260923-1700: 「保存先チップ」「📂 一覧」「📄 開く」「⇔ 先輩」の 4 つが
// 別々の入口になっていて、どこに何があるかを入口ごとに覚え直していた。
// 10a はこれを 1 本のツリーに畳む。節は上から
//   開いている図(N) / 保存先 / 読むだけ / GIT
// で、「読むだけ」と「GIT」は既定で畳み、畳んだままでも件数が読める。
// 保存先の下は部品ごとのフォルダで、6 図種のうち何枚あるか (`SPI 4 / 6`) を出し、
// 展開すると未作成の図種が薄く並ぶ。
//
// ここは DOM も fetch も触らない純関数だけを置く (描画と結線は app.js)。
window.MA.fileTree = (function() {
  // 節は 4 つ。既定で開くのは上の 2 つだけ (保存先を広く見せる)。
  var SECTIONS = [
    { id: 'open',     label: '開いている図', openByDefault: true },
    { id: 'target',   label: '保存先',       openByDefault: true },
    { id: 'readonly', label: '読むだけ',     openByDefault: false },
    { id: 'git',      label: 'GIT',          openByDefault: false },
  ];

  // 部品ごとのフォルダは 6 図種を 1 組として数える。
  var KINDS = ['sequence', 'state', 'class', 'usecase', 'component', 'activity'];
  var KIND_ABBR = {
    sequence: 'SEQ', state: 'ST', 'class': 'CLS',
    usecase: 'UC', component: 'CMP', activity: 'ACT',
  };
  // ファイル名の末尾に出る図種の語 (`spi_init_sequence` の `sequence`)。
  var KIND_WORDS = {
    sequence: 'sequence', seq: 'sequence',
    state: 'state', st: 'state',
    'class': 'class', cls: 'class',
    usecase: 'usecase', uc: 'usecase',
    component: 'component', cmp: 'component',
    activity: 'activity', act: 'activity',
  };

  function _s(v) { return v == null ? '' : String(v); }

  function sections() {
    return SECTIONS.map(function(s) {
      return { id: s.id, label: s.label, openByDefault: s.openByDefault };
    });
  }

  function defaultOpen(id) {
    for (var i = 0; i < SECTIONS.length; i++) {
      if (SECTIONS[i].id === _s(id)) return SECTIONS[i].openByDefault;
    }
    return false;
  }

  // ファイル名からその図の図種を読む。分からなければ ''。
  function kindOf(name) {
    var n = _s(name).toLowerCase().replace(/\.puml$/, '');
    var tail = n.split(/[_\-\s]+/).pop();
    return KIND_WORDS[tail] || '';
  }

  // ファイル名から部品名を読む。図種の語を落とした先頭の語が部品
  // (`spi_init_sequence` も `spi_state` も `spi`)。部品の見出しは大文字で出す。
  function partOf(name) {
    var n = _s(name).replace(/\.puml$/, '');
    var parts = n.split(/[_\-\s]+/).filter(function(x) { return x !== ''; });
    if (!parts.length) return '';
    if (parts.length > 1 && KIND_WORDS[parts[parts.length - 1].toLowerCase()]) parts.pop();
    return parts[0].toLowerCase();
  }

  function partLabel(part) {
    var p = _s(part);
    return p ? p.toUpperCase() : '';
  }

  // 保存先の図を部品ごとにまとめる。並びは部品名の順 (毎回同じ所にある)。
  // count は「6 図種のうち何枚あるか」で、同じ図種が 2 枚あっても 1 と数える
  // (`SPI 4 / 6` は揃い具合を言う数字で、ファイル数ではない)。
  function groups(entries) {
    var byPart = {};
    (entries || []).forEach(function(e) {
      var name = _s(e && e.name ? e.name : e);
      if (!name) return;
      var part = partOf(name);
      if (!byPart[part]) byPart[part] = { part: part, label: partLabel(part), files: [], kinds: {} };
      var kind = _s(e && e.kind) || kindOf(name);
      byPart[part].files.push({ name: name, kind: kind });
      if (kind) byPart[part].kinds[kind] = true;
    });
    return Object.keys(byPart).sort().map(function(k) {
      var g = byPart[k];
      var have = KINDS.filter(function(kind) { return !!g.kinds[kind]; });
      var missing = KINDS.filter(function(kind) { return !g.kinds[kind]; });
      return {
        part: g.part,
        label: g.label,
        files: g.files,
        count: have.length,
        total: KINDS.length,
        countLabel: g.label + ' ' + have.length + ' / ' + KINDS.length,
        missing: missing,
        missingLabel: missing.length
          ? ('未作成 ' + missing.length + ' 図種（' + missing.map(function(m) { return KIND_ABBR[m]; }).join('・') + '）')
          : '',
      };
    });
  }

  // BLK-owner-20260924-0637-1: 保存先節のツリーの形。図種の読めない図 (名前にも本文にも図種が無い
  // `diagram2` など) は部品のフォルダに分けず、保存先の直下にファイル行で並べる
  // (1 枚ずつ「DIAGRAM2 0 / 6・未作成 6 図種」と出すと、中に図があるのに無いと読める)。
  // 本文から図種が読める図 (e.kind) は、名前に図種が無くても部品の側で数える。
  function layout(entries) {
    var kinded = [];
    var loose = [];
    (entries || []).forEach(function(e) {
      var name = _s(e && e.name ? e.name : e);
      if (!name) return;
      var kind = _s(e && e.kind) || kindOf(name);
      if (kind) kinded.push({ name: name, kind: kind });
      else loose.push({ name: name, kind: '' });
    });
    loose.sort(function(a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    return { groups: groups(kinded), loose: loose };
  }

  // ツリーのファイル行の右に付ける札 (design 10a「ファイルの状態」)。中身は保存先の一覧の
  // 行のバッジと同じ事実を読む: 未保存 ● / 指摘が未反映 / 一時控え / SVG が本文より古い。
  // Git の M・A は行の data-git が別に出す。
  function fileMarks(st) {
    var s = st || {};
    var out = [];
    if (s.dirty) out.push('●');
    if (s.unapplied) out.push('未反映');
    if (s.draft) out.push('控え');
    if (s.svgStale) out.push('SVG 古い');
    return out.join(' ');
  }

  // 絞り込み。ファイル名と部品名のどちらでも引ける (入力は大小を問わない)。
  function filter(entries, query) {
    var q = _s(query).trim().toLowerCase();
    if (!q) return (entries || []).slice();
    return (entries || []).filter(function(e) {
      var name = _s(e && e.name ? e.name : e).toLowerCase();
      if (name.indexOf(q) >= 0) return true;
      if (partOf(name).indexOf(q) >= 0) return true;
      // 部品名で引く回 (図の中の participant / class 名)。
      var parts = (e && e.parts) || [];
      for (var i = 0; i < parts.length; i++) {
        if (_s(parts[i]).toLowerCase().indexOf(q) >= 0) return true;
      }
      return false;
    });
  }

  // 畳んだままでも読める件数。読むだけは「比較中 N」、GIT は「main · M 2 ↑1」。
  function readonlyCountLabel(comparing) {
    var n = Number(comparing) || 0;
    return n > 0 ? ('比較中 ' + n) : '';
  }

  function gitCountLabel(git) {
    var g = git || {};
    var branch = _s(g.branch);
    if (!branch) return '';
    var out = branch;
    var marks = [];
    if (Number(g.modified) > 0) marks.push('M ' + Number(g.modified));
    if (Number(g.ahead) > 0) marks.push('↑' + Number(g.ahead));
    if (marks.length) out += ' · ' + marks.join(' ');
    return out;
  }

  // 下端に出していた「12 図 未反映 1 控え 1」をパネル内の 1 行に。
  function summaryLine(sum) {
    var s = sum || {};
    var out = (Number(s.total) || 0) + ' 図';
    if (Number(s.unapplied) > 0) out += ' · 未反映 ' + Number(s.unapplied);
    if (Number(s.draft) > 0) out += ' · 控え ' + Number(s.draft);
    return out;
  }

  return {
    SECTIONS: SECTIONS,
    KINDS: KINDS,
    KIND_ABBR: KIND_ABBR,
    sections: sections,
    defaultOpen: defaultOpen,
    kindOf: kindOf,
    partOf: partOf,
    partLabel: partLabel,
    groups: groups,
    layout: layout,
    fileMarks: fileMarks,
    filter: filter,
    readonlyCountLabel: readonlyCountLabel,
    gitCountLabel: gitCountLabel,
    summaryLine: summaryLine,
  };
})();
