'use strict';

// rename-guard — 図の名前を変えたとき、前の名前のファイルに「今回の編集」が
// 残ってしまう事故を見つけて、元の版に戻せるようにする。
//
// BLK-junior-20260908-1603: 台本の「タイトルの末尾に (先輩反映) を付け足す」を
// DSL の `title` 行のことだと思って editor に書き戻そうとした。ファイル名を
// 決めているのはタブの図名の方で、その対応関係は画面のどこにも書かれていない。
// さらに、名前を変える前に自動保存が走り、前周の完了物である
// 「…(レビュー反映).puml」に今回追加した行が紛れ込んだ。
//
// ここは 2 つのことだけを決める:
//   - 図名とファイル名の対応 (fileNameOf / hintText)
//   - 名前を変えたあと、前の名前のファイルを「今回の編集が入る前の版」に
//     戻せるか (previousVersion)。戻せるならその版を返す。
// 版の控えは version-timeline が持っている。DOM にもサーバにも触らない。
(function() {

  var EXT = '.puml';

  function _s(v) { return v == null ? '' : String(v); }
  function _list(v) { return Array.isArray(v) ? v : []; }

  // 比較用の正規化。改行コードと末尾の空白だけを落とす
  // (version-timeline.normalize と同じ考え方で、見た目が同じ版を別版にしない)。
  function _norm(dsl) {
    return _s(dsl).replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
  }

  function fileNameOf(name) {
    return _s(name) ? _s(name) + EXT : '';
  }

  // 図の設定に出す 1 行。title と図名の役割が混ざらないように言う。
  function hintText(name, fileDir) {
    var f = fileNameOf(name);
    var dir = _s(fileDir);
    if (!f) return '図名を入れると、その名前でファイルが作られます';
    return '保存されるファイル名は ' + (dir ? dir + '/' : '') + f
      + ' です（上の Title は図の中の見出しで、ファイル名にはなりません）';
  }

  // 前の名前のファイルを戻せる版。history は version-timeline.historyOf() の
  // 並び (古い順)。今の内容と違う一番新しい版を返す。
  // 「今の内容」しか控えが無ければ戻す先が無いので null。
  function previousVersion(history, currentDsl) {
    var cur = _norm(currentDsl);
    var list = _list(history);
    for (var i = list.length - 1; i >= 0; i--) {
      var e = list[i];
      if (!e) continue;
      if (_norm(e.dsl) !== cur) return { dsl: _s(e.dsl), at: _s(e.at), label: _s(e.label) };
    }
    return null;
  }

  // 名前を変えた直後の知らせ。戻せる版があるときだけ「戻す」を勧める。
  // opts: { from, to, saved: 前の名前で保存済みか, version: previousVersion の返り値 }
  function notice(opts) {
    var o = opts || {};
    var from = _s(o.from), to = _s(o.to);
    if (!from || !to || from === to) return null;
    if (!o.saved) {
      return {
        kind: 'renamed',
        text: '図名を ' + to + ' に変えました。以降の保存は ' + fileNameOf(to) + ' に書かれます',
        canRestore: false,
      };
    }
    if (!o.version) {
      return {
        kind: 'left-behind',
        text: fileNameOf(from) + ' は保存フォルダに残ります。'
          + '今回の編集が入ったまま残っている場合は、そのファイルを開いて直してください',
        canRestore: false,
      };
    }
    return {
      kind: 'restorable',
      text: fileNameOf(from) + ' には、名前を変える前に自動保存された今回の編集が入っています。'
        + (_s(o.version.at) ? _s(o.version.at) + ' の版' : '直前の版') + 'に戻せます',
      canRestore: true,
    };
  }

  var api = {
    EXT: EXT,
    fileNameOf: fileNameOf,
    hintText: hintText,
    previousVersion: previousVersion,
    notice: notice,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.renameGuard = api;
  }
})();
