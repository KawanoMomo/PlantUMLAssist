'use strict';
window.MA = window.MA || {};

// status-badges — 下端の件数表示を 1 種類の形に揃える (design 9c)。
//
// BLK-human-20260923-1602: 「整合 3」はオレンジの枠付き、「⇄ イベント 0」は緑の文字と、
// 同じ「件数を持つ項目」が札ごとに違う見た目で出ていた。0 件の項目も常に場所を取るので、
// 下端は「今なにも起きていない」ときがいちばん賑やかだった。
//
// 9c の After に揃える:
//   - 件数を持つ項目は「● 名前 N」の 1 種類。文字色は全部同じで、色を持つのは点だけ
//   - 0 件 (と、まだ数えていない) の項目は出さない。件数が増えたときだけ現れる
//   - 枠は付けない
// ここは DOM に触らない純関数だけを置き、描画と結線は app.js。
window.MA.statusBadges = (function() {
  var DOT = '●';

  // 札の文字から件数を読む。
  //   '整合 3' → 3 / '整合 OK' → 0 / '± 差分 −' → null (まだ数えていない)
  // 「OK」「済」「同じ」「なし」は 0 件を言い切っている回なので 0 として扱う。
  function countOf(text) {
    var s = String(text == null ? '' : text).trim();
    if (!s) return null;
    var m = /([0-9]+)\s*$/.exec(s);
    if (m) return parseInt(m[1], 10);
    if (/(OK|済|同じ|なし)\s*$/.test(s)) return 0;
    return null;
  }

  // 数えた結果があり、かつ 1 件以上あるときだけ下端に出す。
  function isVisible(count) {
    return typeof count === 'number' && isFinite(count) && count > 0;
  }

  // 点の色。tone は呼ぶ側が決める (正常 = ok / 要確認 = warn / 崩れ = bad)。
  // 既定は「要確認」— 件数が出ている時点で、見る人に用があるため。
  function toneOf(tone) {
    return (tone === 'ok' || tone === 'warn' || tone === 'bad') ? tone : 'warn';
  }

  // 下端に出す文字。「● 名前 N」だけ。名前には ± や ⇄ のような記号を付けない
  // (記号が付くものと付かないものが混ざると「1 種類の形」に見えない)。
  function label(name) {
    return String(name == null ? '' : name).replace(/^[\s±⇄↔👀●]+/, '').trim();
  }

  function text(name, count) {
    return DOT + ' ' + label(name) + ' ' + String(count);
  }

  return {
    DOT: DOT,
    countOf: countOf,
    isVisible: isVisible,
    toneOf: toneOf,
    label: label,
    text: text,
  };
})();
