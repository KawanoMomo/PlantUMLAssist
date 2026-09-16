'use strict';

// rename-sweep — 図名を変えたあと、前の名前のファイルを保存フォルダに
// 二重に残さない。
//
// BLK-junior-20260915-0307: 「部品を起こす」で開いた spi_sequence の図名を
// 「SPIドライバ初期化シーケンス」に変えて Ctrl+S すると、保存フォルダには
// 新しい名前の .puml と元の spi_sequence.puml が内容同一のまま 2 枚残った。
// さらに Export の「1 枚を資料化」は保存フォルダ側の一覧から拾うので、
// 古い spi_sequence を対象にし、資料も spi_sequence(資料用).puml/png という
// 変更前の名前で作られる。表示名とファイル名が食い違ったままになる。
//
// rename-guard は「前の名前のファイルに今回の編集が紛れ込んだ事故」を
// 見つけて戻す係で、残ること自体は前提にしていた。ここはその手前を決める:
// **前の名前のファイルが今の図そのものなら、それは改名であって複製ではない**
// ので新しい名前へ付け替え (保存 → 旧ファイル削除)、中身が食い違うなら
// 別物として残し rename-guard の知らせに渡す。
//
// DOM にも fetch にも触らない。実際の保存・削除は workspace、結線は app.js。
(function() {

  var EXT = '.puml';

  function _s(v) { return v == null ? '' : String(v); }

  // 比較用の正規化。改行コードと行末の空白だけを落とす
  // (rename-guard._norm と同じ考え方。見た目が同じ本文を別物にしない)。
  function _norm(dsl) {
    return _s(dsl).replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
  }

  function fileNameOf(name) {
    return _s(name) ? _s(name) + EXT : '';
  }

  // plan(opts) — 前の名前のファイルをどうするか。
  // opts: { from, to, saved: 保存フォルダを使っているか,
  //         oldDsl: 前の名前のファイルの本文 (無ければ null), currentDsl: 今の図の本文 }
  // 返り値: { action: 'none' | 'move' | 'keep', from, to, text }
  //   none — 片付けるものが無い (保存フォルダ未使用 / 前の名前のファイルが無い)
  //   move — 今の図そのものなので、新しい名前で保存して前の名前を消す
  //   keep — 中身が違う別物なので残す (rename-guard の知らせに任せる)
  function plan(opts) {
    var o = opts || {};
    var from = _s(o.from).trim();
    var to = _s(o.to).trim();
    if (!from || !to || from === to) return null;
    var base = { action: 'none', from: from, to: to, text: '' };
    if (!o.saved) return base;
    if (o.oldDsl == null) return base;
    if (_norm(o.oldDsl) !== _norm(o.currentDsl)) {
      return {
        action: 'keep', from: from, to: to,
        text: fileNameOf(from) + ' は中身が今の図と違うため残しました（別の図として扱います）',
      };
    }
    return {
      action: 'move', from: from, to: to,
      text: fileNameOf(from) + ' を ' + fileNameOf(to) + ' に付け替えました（古い名前のファイルは残りません）',
    };
  }

  // resultText(p, outcome) — 付け替えを実行したあとの 1 行。
  // outcome: { saved: 新しい名前で書けたか, deleted: 古い名前を消せたか, error }
  // 途中で失敗したら「消したつもり」で見送らせない。何が残っているかを言う。
  function resultText(p, outcome) {
    if (!p || p.action !== 'move') return p ? p.text : '';
    var o = outcome || {};
    if (!o.saved) {
      return fileNameOf(p.to) + ' を書けなかったので ' + fileNameOf(p.from)
        + ' はそのまま残しています（保存フォルダを確かめてください）';
    }
    if (!o.deleted) {
      return fileNameOf(p.to) + ' を作りましたが ' + fileNameOf(p.from)
        + ' を消せませんでした' + (o.error ? '（' + _s(o.error) + '）' : '')
        + '。資料化の対象に古い名前が残ります';
    }
    return p.text;
  }

  var api = {
    EXT: EXT,
    fileNameOf: fileNameOf,
    plan: plan,
    resultText: resultText,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MA = window.MA || {};
    window.MA.renameSweep = api;
  }
})();
