'use strict';
window.MA = window.MA || {};

// folder-filter — 📂 一覧を図の名前で絞り込む。
//
// BLK-junior-20260908-1103: 保存フォルダの一覧は 20 枚超の行が縦に並び、行ごとに
// 印・役割・差分・控えのボタンが付く。目的の 1 枚 (gpio_state) を名前だけを頼りに
// 1 回で正確に押すのは難しく、隣の図 (gpio_init_sequence) を開いてしまっても
// トーストが出るまで気づけない。名前を数文字打てば候補がその 1 枚になる、という
// 引き方を足す。ここは DOM を持たない純関数だけ (描画と結線は app.js)。
window.MA.folderFilter = (function() {
  function _terms(query) {
    return String(query == null ? '' : query).toLowerCase().split(/\s+/)
      .filter(function(t) { return t !== ''; });
  }

  // 名前に絞り込みの語が全部含まれるか。語の順序は問わない
  // (「seq gpio」でも gpio_init_sequence に当たる)。
  function match(name, query) {
    var terms = _terms(query);
    if (terms.length === 0) return true;
    var n = String(name == null ? '' : name).toLowerCase();
    if (!n) return false;
    for (var i = 0; i < terms.length; i++) {
      if (n.indexOf(terms[i]) < 0) return false;
    }
    return true;
  }

  function filter(names, query) {
    if (!Array.isArray(names)) return [];
    return names.filter(function(n) { return match(n, query); });
  }

  // Enter で開ける 1 枚。候補が 2 枚以上なら空を返す (誤って別の図を開かないため)。
  // ただし打った名前がそのまま 1 枚と一致するなら、それを前方一致の他候補より優先する。
  function soleMatch(names, query) {
    var terms = _terms(query);
    if (terms.length === 0) return '';
    var hits = filter(names, query);
    if (hits.length === 1) return hits[0];
    var exact = hits.filter(function(n) { return exactMatch(n, query); });
    return exact.length === 1 ? exact[0] : '';
  }

  // BLK-junior-20260916-2314: 部分一致なので、フルネームを打っても同じ接頭辞の
  // 「…(資料用)」が一緒に残り、並び順次第で資料用を開いてしまう。打った名前と
  // 拡張子を除いて丸ごと同じ図は「完全一致」として先頭に出す。
  function _base(s) {
    return String(s == null ? '' : s).trim().replace(/\.(puml|pu|plantuml|txt)$/i, '').toLowerCase();
  }
  function exactMatch(name, query) {
    var q = _base(query);
    return q !== '' && _base(name) === q;
  }
  // 完全一致を先頭に、残りは元の順のまま。
  function rank(names, query) {
    if (!Array.isArray(names)) return [];
    var head = [], rest = [];
    names.forEach(function(n) { (exactMatch(n, query) ? head : rest).push(n); });
    return head.concat(rest);
  }

  // 絞り込み中の 1 行。何枚に絞れたかが分かればよい。
  function summaryText(shown, total, query) {
    var q = String(query == null ? '' : query).trim();
    if (!q) return '';
    if (!shown) return q + ' に当たる図はありません (' + total + ' 枚中)';
    return q + ' に当たる図 ' + shown + ' / ' + total + ' 枚';
  }

  // BLK-junior-20260916-0546: この一覧は「保存先フォルダ」だけを見せている。
  // 先輩の図を探している人には「無い」としか見えず、見るには保存先ごと切り替えるしか
  // 無いと思って諦めていた (切り替えると次の保存先も先輩のフォルダになる)。
  // 読むだけの入口が別にあることを、探しているその場で言うための 1 行。
  function peekHintText(shown, query) {
    var q = String(query == null ? '' : query).trim();
    if (!q) return 'この一覧は保存先フォルダだけです。他の人の図は「他フォルダ」から読むだけ見られます';
    if (shown > 0) return '';
    return '「' + q + '」は保存先にありません。他の人のフォルダを読むだけ探せます (保存先は変わりません)';
  }

  // 読むだけの入口を強く出すべき場面か (探していて 0 枚のとき)。
  function peekUrged(shown, query) {
    return String(query == null ? '' : query).trim() !== '' && !shown;
  }

  // 覚きの一覧を同じ規則で絞る。一覧で打った名前をそのまま持ち越せるので、
  // 向こうで打ち直さなくて済む。
  function peekSummaryText(shown, total, query) {
    var q = String(query == null ? '' : query).trim();
    if (!q) return '';
    if (!shown) return '「' + q + '」に当たる図はこのフォルダにもありません (' + total + ' 枚中)';
    return '「' + q + '」で絞り込み中 ' + shown + ' / ' + total + ' 枚';
  }

  return {
    match: match,
    filter: filter,
    soleMatch: soleMatch,
    exactMatch: exactMatch,
    rank: rank,
    summaryText: summaryText,
    peekHintText: peekHintText,
    peekUrged: peekUrged,
    peekSummaryText: peekSummaryText,
  };
})();
