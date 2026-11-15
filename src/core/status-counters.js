'use strict';
window.MA = window.MA || {};

// status-counters — 件数を持つものを下端のステータスに寄せる (design 7a / 7b)。
//
// 差分の件数はタブ列のボタン文字の末尾にしか出ていない。ツールを畳むと
// その件数が画面から消える。design は件数を持つものだけを状態表示として下端に置き、
// 押せば従来と同じパネルが開く形にしている。
// ここは DOM に触らない純関数だけを置き、描画と結線は app.js。
window.MA.statusCounters = (function() {
  // src はタブ列のボタン (件数の出どころ)、id は下端に置くボタン。
  // prefix は下端での見出し。subsetOf は内数の行が持つ (今は無い)。
  // 「± 差分」(下端の札とタブ列のボタン) は TICKET-owner-20261115-2141-prune で外したので、今は無い
  // (前回保存版と比べる入口は「この図の履歴」の行の「比較」1 つ)。
  var ITEMS = [];

  function items() {
    return ITEMS.map(function(it) {
      return { id: it.id, src: it.src, prefix: it.prefix, title: it.title,
               subsetOf: it.subsetOf || '' };
    });
  }

  // ボタン文字の末尾に出る件数 (「± 差分 3」の 3、「± 差分 −」の −)。
  // 数も − も無ければ「−」(まだ数えていない) を返す。
  // 「± 変更 2/10」は変わった図 2 枚 / 開いている図 10 枚。
  // 件数は分子 (変わった数) で、末尾の総数を拾わない。
  function countToken(text) {
    var frac = /([0-9]+)\s*\/\s*[0-9]+\s*$/.exec(String(text == null ? '' : text));
    if (frac) return frac[1];
    var m = /([0-9]+|[−-])\s*$/.exec(String(text == null ? '' : text));
    if (!m) return '−';
    return m[1] === '-' ? '−' : m[1];
  }

  // 下端に出す文字。
  function statusText(prefix, srcText) {
    return prefix + ' ' + countToken(srcText);
  }

  // 0 件・未計算のときは目を引かせない。件数があるときだけ色を付ける。
  function isActive(srcText) {
    var t = countToken(srcText);
    return /^[0-9]+$/.test(t) && t !== '0';
  }

  return {
    items: items,
    countToken: countToken,
    statusText: statusText,
    isActive: isActive,
  };
})();
