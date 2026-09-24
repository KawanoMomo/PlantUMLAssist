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
  // BLK-builder-20260924-2231-1 (design 10a): 部品フォルダの中の図と未作成の略号は左レールと同じ
  // 図種の順 (SEQ・UC・CMP・CLS・ACT・ST) に並べる。10a の SPI は spi_init_sequence・spi_transfer_sequence・
  // spi_class・spi_state。名前の順だと行頭の線画がばらばらの順で並び、同じ図種の図が離れる。
  var RAIL_ORDER = ['sequence', 'usecase', 'component', 'class', 'activity', 'state'];

  function kindRank(kind) {
    var i = RAIL_ORDER.indexOf(_s(kind));
    return i < 0 ? RAIL_ORDER.length : i;
  }

  // 図種の順、同じ図種の中は名前の順 (大文字小文字は見ない)。
  function sortByKind(files) {
    return (files || []).slice().sort(function(a, b) {
      var d = kindRank(a && a.kind) - kindRank(b && b.kind);
      if (d) return d;
      var an = _s(a && a.name).toLowerCase(), bn = _s(b && b.name).toLowerCase();
      if (an !== bn) return an < bn ? -1 : 1;
      return _s(a && a.name) < _s(b && b.name) ? -1 : _s(a && a.name) > _s(b && b.name) ? 1 : 0;
    });
  }

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

  // BLK-builder-20260924-1719-3: 区切りの無い日本語名 (`TIMERドライバ状態遷移`) の図種の語。
  // 名前の中で最も後ろに出た語を採る (`…シーケンス` `…状態遷移(資料用)`)。
  var KIND_WORDS_JA = [
    ['ユースケース', 'usecase'], ['コンポーネント', 'component'], ['アクティビティ', 'activity'],
    ['状態遷移', 'state'], ['シーケンス', 'sequence'], ['クラス', 'class'],
  ];

  // 名前の末尾の添え字 (`(資料用)` `（資料用）` `-編集中`) は図種・部品を読む邪魔になるので外す。
  function _stem(name) {
    return _s(name).replace(/\.puml$/i, '')
      .replace(/\s*[（(][^（()）]*[）)]\s*$/, '')
      .replace(/-編集中$/, '');
  }

  // ファイル名からその図の図種を読む。分からなければ ''。
  function kindOf(name) {
    var n = _stem(name).toLowerCase();
    var tail = n.split(/[_\-\s]+/).pop();
    if (KIND_WORDS[tail]) return KIND_WORDS[tail];
    var best = '', at = -1;
    KIND_WORDS_JA.forEach(function(w) {
      var i = n.lastIndexOf(w[0]);
      if (i > at) { at = i; best = w[1]; }
    });
    return best;
  }

  // 先頭の語 (区切り `_` `-` 空白の手前) のうち部品名に当たる所。
  // 区切りの無い日本語名は、先頭の英数字の語が部品 (`TIMERドライバ…` の `TIMER`)。
  // 「部品名 + Drv / Driver」(`TimerDrv派生クラス図`) の Drv / Driver は部品名に入れない。
  // 返り値 { part: 名前の中の部品名の文字, rest: その後ろ全部 }。先頭の語が無ければ null。
  function splitPart(name) {
    var n = _s(name).replace(/\.puml$/i, '');
    var m = /^[_\-\s]*([^_\-\s]+)([\s\S]*)$/.exec(n);
    if (!m) return null;
    var head = m[1], rest = m[2] || '';
    var j = /^([A-Za-z0-9]+)([^\x00-\x7F][\s\S]*)$/.exec(head);
    if (j) {
      var d = /^([A-Za-z0-9]+?)(drv|driver)$/i.exec(j[1]);
      if (d) return { part: d[1], rest: d[2] + j[2] + rest };
      return { part: j[1], rest: j[2] + rest };
    }
    return { part: head, rest: rest };
  }

  // ファイル名から部品名を読む。図種の語を落とした先頭の語が部品
  // (`spi_init_sequence` も `spi_state` も `spi`)。部品の見出しは大文字で出す。
  function partOf(name) {
    var n = _s(name).replace(/\.puml$/, '');
    var parts = n.split(/[_\-\s]+/).filter(function(x) { return x !== ''; });
    if (!parts.length) return '';
    if (parts.length > 1 && KIND_WORDS[parts[parts.length - 1].toLowerCase()]) parts.pop();
    var sp = splitPart(parts[0]);
    return (sp ? sp.part : parts[0]).toLowerCase();
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
      var missing = RAIL_ORDER.filter(function(kind) { return !g.kinds[kind]; });
      return {
        part: g.part,
        label: g.label,
        files: sortByKind(g.files),
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

  // design 10a (BLK-builder-20260924-1715-1): 上部バーのパンくずの「部品フォルダ」。
  // 保存先の一覧 (entries) に name の図があり、ツリーがそれを部品のフォルダに入れているときだけ
  // その部品を返す (ツリーと同じ layout で決めるので、ツリーに無いフォルダ名は出ない)。
  // 保存先に無い図・図種が読めず直下に並ぶ図は null。
  function partFor(name, entries) {
    var n = _s(name).replace(/\.puml$/i, '');
    if (!n) return null;
    var hit = null;
    (entries || []).forEach(function(e) {
      var en = _s(e && e.name ? e.name : e).replace(/\.puml$/i, '');
      if (!hit && en === n) hit = e;
    });
    if (!hit) return null;
    var lay = layout([hit]);
    if (!lay.groups.length) return null;
    return { part: lay.groups[0].part, label: lay.groups[0].label };
  }

  // ファイル行の頭に付ける図種の線画 (design 10a「ファイルの頭にはその図種の線画が付きます」)。
  // 線画そのものは左レールと同じもの (diagram-rail の GLYPHS) を使い、ツリーだけの絵を作らない。
  // kind は保存先の一覧の短い名前 (`sequence`) でも、タブの図種 (`plantuml-sequence`) でもよい。
  // 図種が読めなければ '' (呼び出し側は線画の幅だけ空けて名前の位置を揃える)。
  function glyphType(kind) {
    var k = _s(kind).toLowerCase().replace(/^plantuml-/, '');
    k = KIND_WORDS[k] || '';
    return k ? 'plantuml-' + k : '';
  }

  function glyphSvg(kind) {
    var t = glyphType(kind);
    var R = window.MA.diagramRail;
    if (!t || !R || !R.glyphSvg) return '';
    return R.glyphSvg(t);
  }

  // 行に出す図種: 本文から判定済みの図種を先に、無ければ名前の末尾の語。
  function fileKind(name, contentKind) {
    return glyphType(contentKind) ? _s(contentKind) : kindOf(name);
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

  // BLK-builder-20260924-2336-3 (design 10a「⌕ ファイル名・部品名で絞り込む」): 絞り込み中は、当たった図のある
  // 部品のフォルダを開いて描く (畳んだフォルダの奥に当たった図が隠れて、見出しだけが残っていた)。
  // 覚えている開閉 (stored) は書き換えない。絞り込みを消せば元の開閉で描く。
  function partOpen(stored, query) {
    if (_s(query).trim()) return true;
    return !!stored;
  }

  // 畳んだままでも読める件数。読むだけは「比較中 N」、GIT は「main · M 2 ↑1」。
  // total (読むだけのフォルダの数) を渡すと「2 · 比較中 1」(design 10a の `読むだけ 2 比較中 1`)。
  function readonlyCountLabel(comparing, total) {
    var n = Number(comparing) || 0;
    var cmp = n > 0 ? ('比較中 ' + n) : '';
    if (total === undefined || total === null) return cmp;
    var t = Number(total) || 0;
    if (t <= 0) return cmp;
    return cmp ? (t + ' · ' + cmp) : String(t);
  }

  function _samePath(a, b) {
    var f = function(p) { return _s(p).split('\\').join('/').replace(/\/+$/, '').toLowerCase(); };
    return !!_s(a) && f(a) === f(b);
  }

  // design 10a (BLK-builder-20260924-1749-3): 「読むだけ」節の行。隣の保存フォルダ (/peek-dirs の
  // 自分以外) を 1 行ずつ。右の枠に並べている相手 (comparingDir) の行には「比較中」。
  // 並びは名前の順 (毎回同じ所にある)。
  function readonlyRows(dirs, comparingDir) {
    var out = [];
    (dirs || []).forEach(function(d) {
      if (!d || d.current || !_s(d.path)) return;
      out.push({
        name: _s(d.name) || _s(d.path).split(/[\\/]/).filter(Boolean).pop() || _s(d.path),
        path: _s(d.path),
        files: Number(d.files) || 0,
        comparing: _samePath(comparingDir, d.path),
      });
    });
    out.sort(function(a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    return out;
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

  // 下端の 1 行の数。states は図 1 枚ごとの札の事実 ({ unapplied, draft })。
  // 保存先の図を数える (design 10a の「12 図」はツリーに並ぶ保存先の図の数)。
  function summaryOf(states) {
    var list = states || [];
    var un = 0, dr = 0;
    list.forEach(function(st) {
      if (st && st.unapplied) un++;
      if (st && st.draft) dr++;
    });
    return { total: list.length, unapplied: un, draft: dr };
  }

  // design 10a (BLK-builder-20260924-1735-3): 部品フォルダの「＋ 未作成 2 図種（UC・ACT）」。
  // 括弧の中の略号はそれぞれ押せる (その図種をその場で作る)。行頭の ＋ はまとめて作る。
  // 返すのは略号の並び (左レールと同じ図種の順) と、＋ の説明。
  function missingParts(g) {
    var miss = (g && Array.isArray(g.missing)) ? g.missing : [];
    if (!miss.length) return null;
    var label = partLabel(g.part);
    var JA = { sequence: 'シーケンス図', state: '状態遷移図', 'class': 'クラス図',
      usecase: 'ユースケース図', component: 'コンポーネント図', activity: 'アクティビティ図' };
    return {
      head: '未作成 ' + miss.length + ' 図種（',
      tail: '）',
      kinds: miss.map(function(k) {
        return { kind: k, abbr: KIND_ABBR[k] || k, title: label + ' の' + (JA[k] || k) + 'をここに作る' };
      }),
      allTitle: '未作成の ' + miss.length + ' 図種 (' + miss.map(function(k) { return KIND_ABBR[k] || k; }).join('・')
        + ') をまとめて作る',
    };
  }

  // 作る図の名前がもう保存先にあれば `_2`, `_3`… を付ける (上書きしない)。
  function freeName(base, existing) {
    var b = _s(base);
    if (!b) return '';
    var taken = {};
    (existing || []).forEach(function(n) { taken[_s(n).replace(/\.puml$/i, '').toLowerCase()] = true; });
    if (!taken[b.toLowerCase()]) return b;
    for (var i = 2; i < 1000; i++) {
      if (!taken[(b + '_' + i).toLowerCase()]) return b + '_' + i;
    }
    return '';
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
    RAIL_ORDER: RAIL_ORDER,
    kindRank: kindRank,
    sortByKind: sortByKind,
    sections: sections,
    defaultOpen: defaultOpen,
    kindOf: kindOf,
    partOf: partOf,
    splitPart: splitPart,
    partLabel: partLabel,
    groups: groups,
    layout: layout,
    partFor: partFor,
    fileMarks: fileMarks,
    glyphType: glyphType,
    glyphSvg: glyphSvg,
    fileKind: fileKind,
    filter: filter,
    partOpen: partOpen,
    readonlyCountLabel: readonlyCountLabel,
    readonlyRows: readonlyRows,
    gitCountLabel: gitCountLabel,
    summaryLine: summaryLine,
    summaryOf: summaryOf,
    missingParts: missingParts,
    freeName: freeName,
  };
})();
