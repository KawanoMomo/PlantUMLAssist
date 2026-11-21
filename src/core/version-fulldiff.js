'use strict';
window.MA = window.MA || {};

// version-fulldiff — 1 枚の図の「その版」と「直前の版」を全文で読むための整え方。
//
// 版の前後を全文で並べる差分ビュー (live-diff ほか) の中身がここ。
//
// 行の突き合わせそのものは version-diff.js の diffLines (LCS) を借りる
// (同じ差分を 2 つの実装で出さない)。ここが足すのは、全文を読ませるための
// 「変わらない行の畳み」と「探していた語が動いた行の名指し」だけ。
// 並びが答え (どこに挿さったかを見に来ているので、行の順は崩せない)。DOM も fetch も触らない。
window.MA.versionFullDiff = (function() {

  function _s(v) { return v == null ? '' : String(v); }

  function _vd() { return window.MA.versionDiff; }

  function split(text) {
    var VD = _vd();
    return VD ? VD.lines(text) : [];
  }

  // 全文の突き合わせ → 行の並び。
  //   kind: 'same' | 'del' (前の版にしかない) | 'add' (この版で増えた)
  //   a: 前の版の行番号 (無ければ 0) / b: この版の行番号 (無ければ 0)
  // 行番号を 0 にするのは、画面が「片側にしかない行」を null 判定せずに出せるから。
  function rows(before, after) {
    var VD = _vd();
    if (!VD) return [];
    return VD.diffLines(before, after).map(function(d) {
      return {
        kind: d.kind,
        a: d.before == null ? 0 : d.before,
        b: d.after == null ? 0 : d.after,
        text: _s(d.text),
      };
    });
  }

  function counts(rowList) {
    var add = 0, del = 0, same = 0;
    for (var i = 0; i < rowList.length; i++) {
      if (rowList[i].kind === 'add') add++;
      else if (rowList[i].kind === 'del') del++;
      else if (rowList[i].kind === 'same') same++;
    }
    return { added: add, removed: del, same: same };
  }

  function summaryText(rowList) {
    var c = counts(rowList);
    if (!c.added && !c.removed) return '前の版と同じ本文です';
    return '+' + c.added + ' 行 / −' + c.removed + ' 行 (変わらない行 ' + c.same + ')';
  }

  // 変わらない行が続くところを畳む。前後 context 行は残す (文脈が答えなので
  // 変わった行だけにはしない)。畳んだ所は { kind: 'gap', count } の 1 行で出す。
  function collapse(rowList, context) {
    var ctx = (typeof context === 'number' && context >= 0) ? context : 3;
    var out = [];
    var i = 0, k;
    while (i < rowList.length) {
      if (rowList[i].kind !== 'same') { out.push(rowList[i]); i++; continue; }
      var j = i;
      while (j < rowList.length && rowList[j].kind === 'same') j++;
      var run = j - i;
      var head = (i === 0) ? 0 : ctx;                 // 先頭は前に変更が無いので残さない
      var tail = (j === rowList.length) ? 0 : ctx;    // 末尾も同じ
      if (run <= head + tail + 1) {
        for (k = i; k < j; k++) out.push(rowList[k]);
      } else {
        for (k = i; k < i + head; k++) out.push(rowList[k]);
        out.push({ kind: 'gap', a: 0, b: 0, count: run - head - tail, text: '' });
        for (k = j - tail; k < j; k++) out.push(rowList[k]);
      }
      i = j;
    }
    return out;
  }

  function gapText(row) {
    return '… 同じ行 ' + ((row && row.count) || 0) + ' 行';
  }

  // 見出し。どの図の、どの版と、どの版を並べているかを 1 行で言う。
  function title(file, label, prevLabel) {
    var f = _s(file);
    var now = _s(label) || 'この版';
    if (!_s(prevLabel)) return f + ' — ' + now + ' (これが残っている最古の版)';
    return f + ' — ' + _s(prevLabel) + ' → ' + now;
  }

  // 差分の中で、探していた語が居る変更行だけを拾う (全文のどこを見ればよいかを
  // 最初から指しておく)。
  function termRows(rowList, terms) {
    var ts = (terms || []).map(_s).filter(function(t) { return !!t; });
    if (!ts.length) return [];
    var out = [];
    for (var i = 0; i < rowList.length; i++) {
      var r = rowList[i];
      if (r.kind === 'same' || r.kind === 'gap') continue;
      for (var k = 0; k < ts.length; k++) {
        if (r.text.indexOf(ts[k]) >= 0) { out.push(r); break; }
      }
    }
    return out;
  }

  return {
    split: split,
    rows: rows,
    counts: counts,
    summaryText: summaryText,
    collapse: collapse,
    gapText: gapText,
    title: title,
    termRows: termRows,
  };
})();
