'use strict';
window.MA = window.MA || {};

// close-guard — 未保存の図のタブを × で閉じる前に知らせるかを決める (TICKET-owner-20261124-0822-2)。
//
// 保存先を決めていない既定の画面では、Ctrl+S を押すまで図はどこにも書かれない。
// 以前はタブの × が確かめずに閉じ、直した内容も図の履歴も捨てていた。
// 閉じる前に聞くのは、上部バーが「● 保存」になる図 (前回保存版と違う・まだ保存していない) だけ。
// 保存済みの図と、見本・白紙のままの図 (利用者の成果が 1 文字も無い) は今どおり 1 押しで閉じる。
// ここは DOM に触らない純関数だけ。窓の結線は app.js の requestCloseTab。
window.MA.closeGuard = (function() {
  // o: {
  //   status    … docSaveStatus の値 ('same' | 'changed' | 'new')
  //   dsl       … その図のいまの本文
  //   untouched … 見本・白紙のままか (_isUntouchedDoc)
  //   asOpened  … ファイルを開いたときの本文のままか (sourceLock.isUnchanged。開いた元のファイルが既にこの内容)
  // }
  function needsAsk(o) {
    if (!o) return false;
    if (o.asOpened) return false;
    if (o.status === 'changed') return true;
    if (o.status !== 'new') return false;
    if (o.untouched) return false;
    return !!String(o.dsl == null ? '' : o.dsl).trim();
  }

  // 窓の見出しと本文。fileName は上部バーと同じ「{名前}.puml」、mode は保存の行き先 ('file' | 'download')。
  function message(fileName, mode) {
    var name = String(fileName || '(無題)');
    var where = mode === 'file' ? 'ファイルに書かれていない変更があります。'
      : 'まだどこにも保存していません (保存するとダウンロードになります)。';
    return {
      title: name + ' を閉じる前に保存しますか',
      body: where + '保存せずに閉じると、この図の変更と元に戻す履歴は残りません。',
    };
  }

  // 並び順 = 押せる順。開いたら最初のボタンに手が入る。Esc は 'cancel' と同じ。
  var CHOICES = [
    { id: 'save', label: '保存して閉じる' },
    { id: 'discard', label: '保存せずに閉じる' },
    { id: 'cancel', label: 'やめる' },
  ];
  function choices() { return CHOICES.map(function(c) { return { id: c.id, label: c.label }; }); }

  return { needsAsk: needsAsk, message: message, choices: choices };
})();
