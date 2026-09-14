'use strict';
window.MA = window.MA || {};

// props-tab-label — 右ペインの 1 枚目のタブを、いま何のタブなのかで呼ぶ。
//
// design 2b / 3d: 右ペインのタブは「追加 / Add」と「図の設定」。何も選んでいないときの
// 1 枚目は「図に足す」ためのタブであり、アートボードでもそう書かれている。
// 現状は英語の `Properties` 固定で、他が全部日本語の中でここだけ英語であるうえ、
// 何も選んでいないときに何ができるタブなのかが読めない。
//
// 選択があるときは足す場所ではなく選んだものを直す場所になるので、そちらは「選択中」と呼ぶ。
// DOM には触らない。差し替えは app.js。
window.MA.propsTabLabel = (function() {

  function _n(count) {
    var n = Number(count);
    return (isNaN(n) || n < 0) ? 0 : Math.floor(n);
  }

  // labelFor: 選択数からタブの文字。2 件以上は数を出す
  // (「2 つ選ぶと関係を追加できる」の合図が右ペインの側にも要る)。
  function labelFor(count) {
    var n = _n(count);
    if (n === 0) return '追加';
    if (n === 1) return '選択中';
    return '選択中 ' + n;
  }

  function titleFor(count) {
    var n = _n(count);
    if (n === 0) return '図に要素を足す。種別を選ぶと、その種別に要る入力だけが出る';
    if (n === 1) return '選んでいる要素を直す';
    return n + ' つ選んでいる。関係を追加できる';
  }

  return { labelFor: labelFor, titleFor: titleFor };
})();
