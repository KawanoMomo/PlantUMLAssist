'use strict';
window.MA = window.MA || {};

// folder-export — 保存フォルダの一覧で印を付けた図を、開かずにそのまま SVG へ書き出す。
//
// BLK-primary-20260914-1806-wish: 「新人に引き継ぐ」場面で全図を SVG にしたところ、
// zip に入ったのはその回に開いた 2 枚だけだった。`exportAllSVG` の対象は
// `workspace.list()`(= 今開いているタブ) で、保存フォルダの 14 枚ではない。
// 渡したい図を毎回 1 枚ずつ開き直さないと資料が作れず、手順 1 で数えた 14 枚を
// 開き直す作業そのものが手順になっていた。
//
// ここは「印 → 書き出す図の並び」と「読めた本文 → 書き出す docs」だけを持つ。
// ファイルの読み込みと zip は app.js (bulk-export)。
window.MA.folderExport = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  // 書き出す図の並び。一覧の並びに揃える (zip の中身が画面と同じ順で並ぶ)。
  // 開いているタブかどうかは見ない —— 開いていない図を出すのがこの口の目的で、
  // 開いている図もファイルの中身で書き出す (編集中の分は保存が先)。
  function toExport(picked, names) {
    var want = {};
    (picked || []).forEach(function(p) { want[_s(p)] = true; });
    var out = [];
    (names || []).forEach(function(n) {
      var v = _s(n);
      if (!v || !want[v] || out.indexOf(v) >= 0) return;
      out.push(v);
    });
    return out;
  }

  // 読めた本文だけを bulk-export が期待する形にする。読めなかった図・空の図は
  // 落とし、落とした名前を別に返す (黙って減らすと「14 枚のはずが 12 枚」の
  // 理由が zip を開くまで分からない)。
  function docsFrom(names, textByName) {
    var map = textByName || {};
    var docs = [];
    var missing = [];
    (names || []).forEach(function(n) {
      var name = _s(n);
      if (!name) return;
      var dsl = map[name];
      if (typeof dsl !== 'string' || dsl.trim() === '') { missing.push(name); return; }
      docs.push({ name: name, dsl: dsl });
    });
    return { docs: docs, missing: missing };
  }

  // ボタンの文言。印が 0 枚でも枚数を出す (押せない理由が文言で分かる)。
  function buttonLabel(count) {
    var n = Number(count) || 0;
    return '選んだ図を SVG で書き出す（' + n + ' 枚）';
  }

  function buttonTitle() {
    return 'ここで印を付けた図を、タブで開かずにそのまま zip にします'
      + '（開き直さずに保存フォルダの図をそのまま渡せます）';
  }

  // 読めなかった図があれば、書き出した後の 1 行に足す文言。
  function missingNote(missing) {
    var list = missing || [];
    if (!list.length) return '';
    return '（読めなかった図 ' + list.length + ' 枚: ' + list.join(', ') + '）';
  }

  return {
    toExport: toExport,
    docsFrom: docsFrom,
    buttonLabel: buttonLabel,
    buttonTitle: buttonTitle,
    missingNote: missingNote,
  };
})();
