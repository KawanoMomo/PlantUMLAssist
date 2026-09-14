'use strict';
window.MA = window.MA || {};

// save-redirect — 押した保存が「開いている図とは別のファイル」に書かれたことを、
// 保存したその場で言い、1 押しで本体へ書き直せるようにする。
//
// BLK-primary-20260914-1406: 保存先をファイル (file backend) にして 💾 保存を押しても、
// plantuml-usecase / diagram1 / Fig1 / SpiInit の中身がディスクで変わらない、という
// 詰まりが 3 周続いた。`/autosave` は 200 を返しており、書かれてはいた ——
// 書かれた先が `{名前}-編集中.puml` だった。source-lock の確認 (「元ファイルは
// 変更前のまま保つ」) には「開いている他のファイルも同じ扱いにする」が既定で入っており、
// 一度そう答えると、以後に開いた図は **何も聞かれずに** 控えへ逸れる。
// 画面に出ているのは上部バーの小さな 🔒 と、状態バーに流れる 1 行だけなので、
// 「保存した」と「本体が変わった」の食い違いに気付けない。
// (reviewer が同じ日に見つけた「直した内容が -編集中 にしか入っていない」は、この裏側。)
//
// ここは「逸れたかどうか」と「何と言うか」だけを決める純関数。
// 書き直しと描画は app.js。
window.MA.saveRedirect = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  // 逸れたか。開いている図の名前と、実際に書いた名前が違えば逸れている。
  function isRedirected(origin, written) {
    var a = _s(origin), b = _s(written);
    return a !== '' && b !== '' && a !== b;
  }

  var REASONS = {
    'lock-copy': '「元ファイルは変更前のまま保つ」を選んでいるため',
    'kind-split': '開いてあるファイルと図種が違うため',
    '': '',
  };

  // 保存のその場で出す帯の中身。逸れていなければ null (黙る)。
  //   origin  … 画面で開いている図の名前
  //   written … 実際に書いた名前
  //   reason  … 'lock-copy' | 'kind-split' | ''
  //   dir     … 保存フォルダ (あれば書いた場所まで言う)
  function notice(origin, written, reason, dir) {
    if (!isRedirected(origin, written)) return null;
    var why = REASONS[_s(reason)] || '';
    var where = _s(dir);
    return {
      origin: _s(origin),
      written: _s(written),
      reason: _s(reason),
      text: '⚠ ' + _s(written) + '.puml に書きました。'
        + _s(origin) + '.puml は変更前のままです'
        + (why ? '（' + why + '）' : ''),
      detail: where ? '書いた先: ' + where + '/' + _s(written) + '.puml' : '',
      // 本体へ書き直す側を既定の行動にする。「保存したのに変わっていない」を
      // 読んだ人がまずしたいのは、本体に入れることなので。
      overwriteLabel: _s(origin) + '.puml に書く',
      overwriteTitle: _s(origin) + '.puml を今の本文で上書きし、以後この図の保存も本体へ書きます'
        + '（他のファイルは黙って控えへ逸らさず、次からその都度確認します）',
      keepLabel: 'このままにする',
      keepTitle: _s(origin) + '.puml は変更前のまま保ちます（書き先は ' + _s(written) + '.puml のまま）',
    };
  }

  // 書き直した後に出す 1 行。何が起きたかを言い切る (黙って閉じない)。
  function doneText(origin) {
    return '💾 ' + _s(origin) + '.puml に書きました。以後この図の保存も本体へ書きます';
  }

  // 保存を押した図が控えへ逸れる状態のまま何度も押されることがあるので、
  // 同じ組 (origin → written) の帯は 1 回の保存につき 1 つに畳む。
  function key(origin, written) { return _s(origin) + '→' + _s(written); }

  return {
    isRedirected: isRedirected,
    notice: notice,
    doneText: doneText,
    key: key,
    REASONS: REASONS,
  };
})();
