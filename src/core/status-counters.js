'use strict';
window.MA = window.MA || {};

// status-counters — 件数を持つものを下端のステータスに寄せる (design 7a / 7b)。
//
// 差分・指摘・指摘箱の件数はタブ列のボタン文字の末尾にしか出ていない。ツールを畳むと
// (BLK-primary-20260908-0823-design) その件数が画面から消え、「未対応の指摘が何件あるか」を
// 見るのにメニューを開く手が要る。design は件数を持つものだけを状態表示として下端に置き、
// 押せば従来と同じパネルが開く形にしている。
// ここは DOM に触らない純関数だけを置き、描画と結線は app.js。
window.MA.statusCounters = (function() {
  // src はタブ列のボタン (件数の出どころ)、id は下端に置くボタン。
  // prefix は下端での見出しで、design の並び (± 差分 / 指摘 / 指摘箱) に合わせて短くする。
  // BLK-owner-20260923-1409-prune: 「指摘」と「指摘箱」は同じ 1 件を別々に数えていた
  // (この図の指摘は、指摘箱にも同じものが並ぶ)。指摘箱を全体の勘定にし、指摘はその
  // 内数と読めるように見出しを変える。内数であることは subsetOf で持つ。
  var ITEMS = [
    { id: 'status-diff',  src: 'btn-tab-diff',  prefix: '± 差分',  title: '前回保存した時点から変わった図の一覧' },
    { id: 'status-pins',  src: 'btn-tab-pins',  prefix: 'うち この図', subsetOf: 'status-inbox',
      title: '指摘箱の内数。この図に付いた指摘の一覧（同じ 1 件を二重には数えません）' },
    { id: 'status-inbox', src: 'btn-tab-inbox', prefix: '指摘箱',  title: '保存フォルダの図をまたいだ未対応の指摘（監査が出したものも手で書いたものも 1 つの勘定）' },
  ];

  function items() {
    return ITEMS.map(function(it) {
      return { id: it.id, src: it.src, prefix: it.prefix, title: it.title,
               subsetOf: it.subsetOf || '' };
    });
  }

  // ボタン文字の末尾に出る件数 (「📌 指摘 3」の 3、「± 差分 −」の −)。
  // 数も − も無ければ「−」(まだ数えていない) を返す。
  // BLK-owner-20260924-1712-prune: 「± 変更 2/10」は変わった図 2 枚 / 開いている図 10 枚。
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
