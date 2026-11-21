'use strict';
window.MA = window.MA || {};

// file-tree — レール右の FILES ツリーの中身を組む (design 10a)。
//
// 「保存先チップ」「📂 一覧」「📄 開く」「⇔ 先輩」の 4 つが
// 別々の入口になっていて、どこに何があるかを入口ごとに覚え直していた。
// 10a はこれを 1 本のツリーに畳む。節は上から
//   開いている図(N) / 保存先 / 読むだけ / GIT
// で、「読むだけ」と「GIT」は既定で畳み、畳んだままでも件数が読める。
// 保存先の下は実在のファイルを名前の順にそのまま並べる。ファイル名から部品名を読んで
// 仮のフォルダに束ねる・6 図種のうち何枚あるかを数える・未作成の図種を出すことは
// TICKET-owner-20261116-0321-prune で外した (図は 1 枚ずつ開いて直す。フォルダは実在のフォルダで分ける)。
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

  // 区切りの無い日本語名 (`TIMERドライバ状態遷移`) の図種の語。
  // 名前の中で最も後ろに出た語を採る (`…シーケンス` `…状態遷移(レビュー反映)`)。
  var KIND_WORDS_JA = [
    ['ユースケース', 'usecase'], ['コンポーネント', 'component'], ['アクティビティ', 'activity'],
    ['状態遷移', 'state'], ['シーケンス', 'sequence'], ['クラス', 'class'],
  ];

  // 名前の末尾の括弧書き (`(v2)` `（レビュー反映）`) と `-編集中` は図種を読む邪魔になるので外す。
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

  // 保存先節の行。実在のファイルを名前の順にそのまま並べる (名前を読んで束ねない・並べ替えない)。
  // kind は行頭の線画のため (本文から判定済みの図種 e.kind を先に、無ければ名前の末尾の語)。
  function targetRows(entries) {
    var out = [];
    (entries || []).forEach(function(e) {
      var name = _s(e && e.name ? e.name : e);
      if (!name) return;
      out.push({ name: name, kind: _s(e && e.kind) || kindOf(name) });
    });
    out.sort(function(a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    return out;
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
  // 行のバッジと同じ事実を読む: 未保存 ● / 指摘が未反映。
  // Git の M・A は行の data-git が別に出す。下書きの印・SVG の鮮度の札は TICKET-owner-20261116-0241-prune で外した。
  function fileMarks(st) {
    var s = st || {};
    var out = [];
    if (s.dirty) out.push('●');
    if (s.unapplied) out.push('未反映');
    return out.join(' ');
  }

  // 絞り込み。ファイル名で引く (入力は大小を問わない)。
  function filter(entries, query) {
    var q = _s(query).trim().toLowerCase();
    if (!q) return (entries || []).slice();
    return (entries || []).filter(function(e) {
      var name = _s(e && e.name ? e.name : e).toLowerCase();
      return name.indexOf(q) >= 0;
    });
  }

  // 畳んだままでも読める件数。読むだけはフォルダの数、GIT は「main · M 2 ↑1」。
  // 右の枠に出している相手の札は TICKET-owner-20261115-2141-prune で外した (読むだけの図は 1 枚を見るだけ)。
  function readonlyCountLabel(total) {
    var t = Number(total) || 0;
    return t > 0 ? String(t) : '';
  }

  // design 10a: 「読むだけ」節の行。隣の保存フォルダ (peek-dirs の
  // 自分以外) を 1 行ずつ。並びは名前の順 (毎回同じ所にある)。
  function readonlyRows(dirs) {
    var out = [];
    (dirs || []).forEach(function(d) {
      if (!d || d.current || !_s(d.path)) return;
      out.push({
        name: _s(d.name) || _s(d.path).split(/[\\/]/).filter(Boolean).pop() || _s(d.path),
        path: _s(d.path),
        files: Number(d.files) || 0,
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

  // 保存先の一覧に並べた図の名前と、ディスクの図の名前の「顔ぶれ」。
  // 自動保存・Ctrl+S で新しい図を書いても、外で図が増えた・消えても、一覧は読み込み直すまで古いままだった。
  // 書いた後・フォーカスが戻った時に顔ぶれを比べ、違えば一覧を読み直す (同じなら読み直さない)。
  // entries は server の一覧の行 ({ type } / { name }) か名前の文字列。
  function nameSig(entries) {
    var seen = {};
    var out = [];
    (entries || []).forEach(function(e) {
      var n = (e && typeof e === 'object') ? (e.type || e.name) : e;
      n = _s(n);
      if (!n || seen[n]) return;
      seen[n] = true;
      out.push(n);
    });
    out.sort();
    return out.join('\n');
  }

  // 書いた名前が、一覧に並べている顔ぶれ (nameSig の値) に入っているか。入っていれば読み直すまでもない。
  function sigHas(sig, name) {
    var n = _s(name);
    if (!n) return true;
    return String(sig == null ? '' : sig).split('\n').indexOf(n) >= 0;
  }

  // 下端の 1 行の数。states は図 1 枚ごとの札の事実 ({ unapplied })。
  // 保存先の図を数える (design 10a の「12 図」はツリーに並ぶ保存先の図の数)。
  function summaryOf(states) {
    var list = states || [];
    var un = 0;
    list.forEach(function(st) {
      if (st && st.unapplied) un++;
    });
    return { total: list.length, unapplied: un };
  }

  // 下端に出していた「12 図 未反映 1」をパネル内の 1 行に。
  function summaryLine(sum) {
    var s = sum || {};
    var out = (Number(s.total) || 0) + ' 図';
    if (Number(s.unapplied) > 0) out += ' · 未反映 ' + Number(s.unapplied);
    return out;
  }

  return {
    SECTIONS: SECTIONS,
    sections: sections,
    defaultOpen: defaultOpen,
    kindOf: kindOf,
    targetRows: targetRows,
    fileMarks: fileMarks,
    glyphType: glyphType,
    glyphSvg: glyphSvg,
    fileKind: fileKind,
    filter: filter,
    readonlyCountLabel: readonlyCountLabel,
    readonlyRows: readonlyRows,
    gitCountLabel: gitCountLabel,
    summaryLine: summaryLine,
    summaryOf: summaryOf,
    nameSig: nameSig,
    sigHas: sigHas,
  };
})();
