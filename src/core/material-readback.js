'use strict';
window.MA = window.MA || {};

// material-readback — 資料化した 1 枚の「保存先に置かれた本文そのもの」を、
// 資料化したその場で読めるようにする。
//
// BLK-junior-20260915-0106: 置けたこと (名前・時刻・大きさ) は material-verify が
// モーダルに残すようになったが、台本の手順7 が求めるのは「指摘の内容が反映されて
// いるか」であり、それは本文を読まないと分からない。そのため置けたと分かった直後に
// モーダルを閉じ → 📂フォルダタブ → フィルタに図名(資料用)を打ち直し → 行をクリック、
// という同じ確認をもう一度たどることになっていた。
//
// ここは「保存先から読み直した本文」と「いま書き込んだ本文」を突き合わせて言葉に
// する純関数だけ。fetch も DOM も触らない (読み直すのは app.js)。
window.MA.materialReadback = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  // 改行を揃え、末尾の空白行だけ落とす。server は書き込んだ本文をそのまま返すが、
  // 改行コードの差だけで「食い違う」と言うと確認の役に立たない。
  function normalize(text) {
    return _s(text).replace(/\r\n/g, '\n').replace(/\s+$/, '');
  }

  function toLines(text) {
    var t = normalize(text);
    return t === '' ? [] : t.split('\n');
  }

  // 本文の中から、探している言葉を含む行を行番号付きで拾う。
  // 手順7 は「指摘の内容が反映されているか」を見るので、note などの追記を
  // 目で探させずに当てられるようにする。
  function findLines(text, needle) {
    var want = _s(needle).trim();
    if (want === '') return [];
    var ls = toLines(text);
    var hits = [];
    for (var i = 0; i < ls.length; i++) {
      if (ls[i].indexOf(want) >= 0) hits.push({ no: i + 1, text: ls[i] });
    }
    return hits;
  }

  // 資料化の直後の読み直し。
  //   saved:    保存先から読み直した本文 (読めなければ null)
  //   expected: いま書き込んだ本文
  //   plan:     { docName }
  // status は 'same' (読めて一致) / 'diff' (読めたが食い違う) / 'unreadable'。
  function report(saved, expected, plan) {
    var p = plan || {};
    var docName = _s(p.docName);
    var body = normalize(saved);
    if (saved == null || body === '') {
      return {
        status: 'unreadable', docName: docName, body: '', lines: [], lineCount: 0,
        text: docName + '.puml の本文を読み直せませんでした。FILES の保存先から開いて確かめてください',
      };
    }
    var ls = toLines(body);
    var same = normalize(expected) === body;
    return {
      status: same ? 'same' : 'diff',
      docName: docName, body: body, lines: ls, lineCount: ls.length,
      text: '保存先の ' + docName + '.puml を読み直しました（' + ls.length + ' 行）。'
        + (same
          ? 'いま書き込んだ本文と同じです。下の本文で中身を確かめられます'
          : 'いま書き込んだ本文と食い違います。下は保存先にある方の本文です'),
    };
  }

  return {
    normalize: normalize,
    toLines: toLines,
    findLines: findLines,
    report: report,
  };
})();
