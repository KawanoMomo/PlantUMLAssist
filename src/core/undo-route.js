'use strict';
window.MA = window.MA || {};

// undo-route — Ctrl+Z / Ctrl+Y を図の履歴に回すか、入力欄のネイティブ undo に任せるか。
//
// 右パネルの「末尾に追加」で 1 件足すと、フォーカスは次の 1 件のために欄 (別名・ラベル等) に残る。
// 欄にフォーカスがある間の Ctrl+Z は欄のネイティブ undo に回していたので、足した直後に押しても
// 欄は空で戻すものが無く、図は何も変わらなかった (Undo が壊れたように見える)。
// 手書きのエディタでも draw.io でも、足した直後の Ctrl+Z は足したものを消す。
//
// 規則 (TICKET-owner-20261115-1900-1):
//   - 本文欄 (エディタ) と、入力欄以外にフォーカスがあるときは図の履歴。
//   - 右パネルの欄にフォーカスがあり、直前に積んだ操作が右パネルから来ていて、
//     その後どの欄にも 1 字も打っていない間は図の履歴 (足した 1 件が戻る / 進む)。
//   - それ以外の欄 (打ち始めた後・右パネルの外の欄) は今どおり欄のネイティブ undo。
// ここは DOM に触らない純関数だけを置き、どこにフォーカスがあるかを調べるのは app.js。
window.MA.undoRoute = (function() {
  function create() { return { pending: false }; }

  // 操作を 1 つ積んだ。そのとき右パネルにフォーカスがあったか (フォームの確定 = Enter か追加ボタン)。
  function onPush(st, fromForm) {
    if (st) st.pending = !!fromForm;
  }

  // 欄に字を打った。以後の Ctrl+Z はその欄の字を戻す。
  function onFieldInput(st) {
    if (st) st.pending = false;
  }

  // ctx: { inEditor, inField, inForm }
  //   inEditor — 本文欄にフォーカス
  //   inField  — input / textarea / select / contenteditable にフォーカス
  //   inForm   — そのフォーカスが右パネルの中
  // 戻り値: 'history' (図の履歴) / 'native' (欄に任せる)
  function route(st, ctx) {
    var c = ctx || {};
    if (c.inEditor || !c.inField) return 'history';
    if (c.inForm && st && st.pending) return 'history';
    return 'native';
  }

  return { create: create, onPush: onPush, onFieldInput: onFieldInput, route: route };
})();
