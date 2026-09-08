'use strict';

// name-title-link — 図名 (= 保存されるファイル名) とタイトルの「末尾の付け足し」を
// 連動させる。
//
// BLK-junior-20260909-0003: 台本の手順4「タイトルの末尾に (資料用) を付け足し、
// 図をこの名前で保存する」は、画面では「タイトル / Title」欄と「図名 / File name」欄の
// 2 か所を別々に書き換える作業になっていた。片方だけ直すと見出しとファイル名がずれる。
// 末尾を足した / 外しただけの編集は、もう片方にも同じことをすればよい。
//
// ここが決めるのは 2 つだけ:
//   - ある欄の before → after が「末尾の付け足し / 取り外し」か (suffixEdit)
//   - その付け足しをもう片方の値に当てるとどうなるか (applyEdit)
// 名前として使えるかの判定 (workspace.isValidName) と DOM は呼び出し側の職掌。
(function() {

  function _s(v) { return v == null ? '' : String(v); }
  function _t(v) { return _s(v).trim(); }

  // before → after が末尾だけの変化なら {add} / {remove}、そうでなければ null。
  // before が空のとき (タイトルを初めて書いたとき) は「付け足し」と見なさない。
  // 名前ごと入れ替えたのに図名まで付いていくと事故になるため。
  function suffixEdit(before, after) {
    var b = _t(before);
    var a = _t(after);
    if (!b || !a || b === a) return null;
    if (a.length > b.length && a.slice(0, b.length) === b) {
      var add = a.slice(b.length);
      return _t(add) ? { add: add } : null;
    }
    if (b.length > a.length && b.slice(0, a.length) === a) {
      var rm = b.slice(a.length);
      return _t(rm) ? { remove: rm } : null;
    }
    return null;
  }

  // もう片方の値に同じ末尾の変化を当てる。当てる先が無い / 既にそうなっている /
  // 外したら空になる、のときは null (= 何もしない)。
  function applyEdit(other, edit) {
    var o = _s(other);
    if (!o.trim() || !edit) return null;
    if (edit.add) {
      var add = _s(edit.add);
      if (o.slice(-add.length) === add) return null;
      return o + add;
    }
    if (edit.remove) {
      var rm = _s(edit.remove);
      if (o.length <= rm.length || o.slice(-rm.length) !== rm) return null;
      var next = o.slice(0, o.length - rm.length);
      return next.trim() ? next : null;
    }
    return null;
  }

  // 新しいタブの既定名 (diagram1 / diagram2_sequence-3 …)。人が付けた名前ではないので、
  // タイトルを書いたらタイトルごと引き継いでよい。
  //
  // BLK-junior-20260909-0103: 新規タブでタイトルに「GpioDrv派生クラス図(資料用)」と
  // 書いたとき、末尾だけの連動では図名が「diagram2_sequence-3(資料用)」になり、
  // タイトルの本体と図名の本体が食い違ったまま保存されていた。
  function isAutoName(name) {
    var n = _t(name);
    if (!n) return false;
    return /^diagram(\d+)?(_[A-Za-z0-9]+)*(-\d+)?$/.test(n);
  }

  // タイトルが before → after に変わったとき、図名 (currentName) をどうするか。
  // 図名が既定名のままなら、タイトルの全体を図名にする (末尾だけでは足りない)。
  // 人が名前を付けた図では、これまでどおり末尾の付け足し / 取り外しだけを移す。
  function titleSync(before, after, currentName) {
    var a = _t(after);
    var cur = _s(currentName);
    if (isAutoName(cur)) {
      if (!a || a === _t(cur)) return null;
      return { name: a, whole: true };
    }
    var edit = suffixEdit(before, after);
    if (!edit) return null;
    var next = applyEdit(cur, edit);
    return next ? { name: next, whole: false } : null;
  }

  // 連動したことを画面に出す文言。黙って書き換えない。
  function noticeText(fieldLabel, from, to) {
    return _s(fieldLabel) + ' も「' + _s(from) + '」→「' + _s(to) + '」に合わせました';
  }

  var api = {
    suffixEdit: suffixEdit,
    applyEdit: applyEdit,
    isAutoName: isAutoName,
    titleSync: titleSync,
    noticeText: noticeText,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.nameTitleLink = api;
  }
})();
