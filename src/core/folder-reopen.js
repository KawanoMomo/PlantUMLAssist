'use strict';
window.MA = window.MA || {};

// folder-reopen — 「📂 一覧」から図を開き直したときに、何が起きたかを言葉にする
// (BLK-junior-20260907-1803)。
//
// 一覧の項目を押しても、それが今アクティブなタブと同じ名前だと画面は何も動かない。
// 保存した内容を確かめるための操作なのに、無反応と「読み直した結果が同じだった」の
// 区別が付かないので、保存できていない事故に気付けない。
//
// ここは DOM に触らない純関数だけ。実際の読み込みとタブ操作は app.js。
window.MA.folderReopen = (function() {

  // 保存フォルダの本文と、今エディタにある本文を突き合わせる。
  // fileText が null は「読めなかった」(消えている / フォルダ未設定)。
  // 戻り値: { kind, changed, message }
  //   kind: 'missing' | 'same' | 'replaced' | 'opened'
  //   changed: エディタの本文を差し替えたか (差し替えたときだけ元に戻せる)
  function describe(name, fileText, bufferText, sameTab) {
    var label = name == null ? '' : String(name);
    if (fileText == null) {
      return {
        kind: 'missing', changed: false,
        message: label + ' を保存フォルダから読めませんでした',
      };
    }
    if (!sameTab) {
      return {
        kind: 'opened', changed: true,
        message: label + ' をタブで開きました',
      };
    }
    if (String(bufferText == null ? '' : bufferText) === String(fileText)) {
      return {
        kind: 'same', changed: false,
        message: label + ' を読み直しました。保存されている内容と同じです ('
          + countLines(fileText) + ' 行)',
      };
    }
    return {
      kind: 'replaced', changed: true,
      message: label + ' を保存フォルダの内容に差し替えました。編集中だった内容は「元に戻す」で戻せます',
    };
  }

  function countLines(text) {
    if (text == null || text === '') return 0;
    return String(text).split('\n').length;
  }

  return { describe: describe, countLines: countLines };
})();
