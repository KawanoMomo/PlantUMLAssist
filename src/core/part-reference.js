'use strict';
window.MA = window.MA || {};

// part-reference — 「部品を起こす」の下書きを、汎用ひな形ではなく先輩の実図から写す。
//
// BLK-junior-20260915-0307-wish: SPI を起こすと 6 図種とも決まった汎用 DSL
// (init/config/read/write/irqSetup/irqNotify の並び) で埋まる。だが先輩 (primary) の
// 保存フォルダには SPI のシーケンス図 (spi_init_sequence.puml) が既にあり、参加者も
// 処理の並びも汎用ひな形とは違う。結局、下書きを全部消して先輩の図を手で打ち直す
// ことになる。
//
// ここは「隣のフォルダに同じ部品名の実図があるか」を照合して、あればその本文を
// 下書きの代わりに返す。手順 2 が「打ち直す」から「先輩の図を見て差分だけ直す」に
// 変わるのがこのモジュールの目的で、写した後の編集は今までどおり普通の編集。
//
// 名前は junior 側の名前 (spi_sequence) のままにする。写すのは中身だけで、
// 先輩のファイルには一切触らない (読むだけ。peek-folder と同じ約束)。
//
// DOM も fetch も触らない (照合と表示文だけ)。フォルダの読み込みは app.js。
window.MA.partReference = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  function baseName(name) {
    return _s(name).replace(/\.(puml|plantuml|uml|txt)$/i, '');
  }

  // 図種の綴り。server の一覧 (entry.kind) と part-starter の key は同じ語を使う。
  var KINDS = ['sequence', 'state', 'class', 'usecase', 'component', 'activity'];

  // server が図種を返さない図のための当て推量。判定の正本は server の kind で、
  // ここは「kind の無い古い保存」を拾うためだけの控え (当たらなければ写さない)。
  function kindFromDsl(text) {
    var t = _s(text);
    if (/^\s*state\s+\S/m.test(t) || /\[\*\]\s*-->/.test(t)) return 'state';
    if (/^\s*(participant|actor)\s+\S/m.test(t) && /(-->|->)/.test(t)) return 'sequence';
    if (/^\s*(abstract\s+)?class\s+\S/m.test(t) || /^\s*interface\s+\S/m.test(t)) return 'class';
    if (/^\s*usecase\s+\S/m.test(t) || /^\s*\([^)]+\)\s+as\s+\S/m.test(t)) return 'usecase';
    if (/^\s*component\s+\S/m.test(t) || /^\s*\[[^\]]+\]/m.test(t)) return 'component';
    if (/^\s*start\s*$/m.test(t) || /^\s*:.+;\s*$/m.test(t)) return 'activity';
    return '';
  }

  function kindOf(entry) {
    var k = _s(entry && entry.kind).toLowerCase();
    if (KINDS.indexOf(k) >= 0) return k;
    return kindFromDsl(entry && (entry.text || entry.dsl));
  }

  // 同じ部品の図か。ファイル名に部品名が入っていることだけを見る
  // (本文まで見て拾うと、その部品を参照しているだけの他部品の図が紛れる)。
  // 1 文字の部品名は照合しない (a や s がどのファイル名にも当たってしまう)。
  function matches(subject, name) {
    var id = _s(subject).toLowerCase();
    if (id.length < 2) return false;
    return baseName(name).toLowerCase().indexOf(id) >= 0;
  }

  // 近い順。同じ図種に何枚も当たったときに、部品名だけの短い名前を先に出す
  // (spi_sequence より spi_dma_bridge_sequence を写す方が遠い)。
  function _rank(a, b) {
    var an = baseName(a.name).toLowerCase(), bn = baseName(b.name).toLowerCase();
    if (an.length !== bn.length) return an.length - bn.length;
    if (an !== bn) return an < bn ? -1 : 1;
    return _s(a.folder).toLowerCase() < _s(b.folder).toLowerCase() ? -1 : 1;
  }

  // collect(subject, folders) — 隣のフォルダの一覧 → 図種ごとの手本。
  // folders: [{ folder, dir, entries: [{ name, kind, text }] }]
  // 返り値: { byKind, list, folders }。当たらなければ空 (呼び出し側はひな形のまま)。
  function collect(subject, folders) {
    var byKind = {};
    var list = [];
    var seenFolders = [];
    (Array.isArray(folders) ? folders : []).forEach(function(f) {
      if (!f) return;
      var entries = Array.isArray(f.entries) ? f.entries : [];
      var hit = false;
      entries.forEach(function(e) {
        if (!e || !matches(subject, e.name)) return;
        var dsl = _s(e.text || e.dsl);
        if (!dsl.trim()) return;          // 本文の無い一覧行は手本にならない
        var kind = kindOf(e);
        if (!kind) return;
        var ref = {
          folder: _s(f.folder) || _s(f.dir),
          dir: _s(f.dir),
          name: _s(e.name),
          kind: kind,
          dsl: dsl,
        };
        (byKind[kind] = byKind[kind] || []).push(ref);
        list.push(ref);
        hit = true;
      });
      if (hit) seenFolders.push(_s(f.folder) || _s(f.dir));
    });
    KINDS.forEach(function(k) { if (byKind[k]) byKind[k].sort(_rank); });
    return { byKind: byKind, list: list, folders: seenFolders };
  }

  // その図種に写せる手本 (無ければ null)。
  function pick(refs, kindKey) {
    var by = refs && refs.byKind;
    var arr = by && by[_s(kindKey)];
    return (arr && arr.length) ? arr[0] : null;
  }

  function label(ref) {
    if (!ref) return '';
    return _s(ref.folder) + ' / ' + _s(ref.name);
  }

  // 行に出す 1 行。「写す」と言い切る (見に行くのか写るのかが読めないと、
  // 開いてから中身を確かめる手が増える)。
  function noteText(ref) {
    if (!ref) return '';
    return '先輩の実図 ' + label(ref) + ' を写します';
  }

  // 押す前の 1 行。何枚が手本で、何枚がひな形かを数で言う。
  function summary(refs) {
    var n = refs && refs.list ? refs.list.length : 0;
    if (!n) return '';
    var who = (refs.folders || []).join('・');
    var kinds = Object.keys(refs.byKind || {}).length;
    return who + ' に同じ部品名の実図が ' + n + ' 枚 (' + kinds + ' 図種) あります';
  }

  return {
    KINDS: KINDS,
    baseName: baseName,
    kindFromDsl: kindFromDsl,
    kindOf: kindOf,
    matches: matches,
    collect: collect,
    pick: pick,
    label: label,
    noteText: noteText,
    summary: summary,
  };
})();
