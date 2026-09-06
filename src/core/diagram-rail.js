'use strict';
window.MA = window.MA || {};

// diagram-rail — 画面左端の図種レール (design 1a「Quiet Rail」)。
//
// 図種はツールバーの <select> に埋もれており、切り替えに「開く→選ぶ」の 2 手が要り、
// 今どの図種を編集しているかも閉じたセレクトの表示文字でしか分からない。
// レールは 6 図種を縦に並べて 1 クリックで切り替えられるようにし、現在の図種を
// 常時ハイライトする。ここは DOM に触らない純関数だけを置き、描画と結線は app.js。
window.MA.diagramRail = (function() {
  // 並び順は design の左レール (SEQ / UC / CMP / CLS / ACT / ST) に合わせる。
  var ITEMS = [
    { type: 'plantuml-sequence',  code: 'SEQ', label: 'Sequence',  title: 'シーケンス図' },
    { type: 'plantuml-usecase',   code: 'UC',  label: 'UseCase',   title: 'ユースケース図' },
    { type: 'plantuml-component', code: 'CMP', label: 'Component', title: 'コンポーネント図' },
    { type: 'plantuml-class',     code: 'CLS', label: 'Class',     title: 'クラス図' },
    { type: 'plantuml-activity',  code: 'ACT', label: 'Activity',  title: 'アクティビティ図' },
    { type: 'plantuml-state',     code: 'ST',  label: 'State',     title: '状態遷移図' },
  ];

  function items() {
    // 呼び出し側が書き換えても内部が壊れないよう複製を返す。
    return ITEMS.map(function(it) { return { type: it.type, code: it.code, label: it.label, title: it.title }; });
  }

  function indexOfType(type) {
    for (var i = 0; i < ITEMS.length; i++) {
      if (ITEMS[i].type === type) return i;
    }
    return -1;
  }

  function codeFor(type) {
    var i = indexOfType(type);
    return i < 0 ? '' : ITEMS[i].code;
  }

  function labelFor(type) {
    var i = indexOfType(type);
    return i < 0 ? '' : ITEMS[i].label;
  }

  // 未知の図種は「どれも選ばれていない」として扱い、例外は投げない
  // (タブ復元やロールバックで見知らぬ type が来ても画面を落とさないため)。
  function isKnownType(type) {
    return indexOfType(type) >= 0;
  }

  // 隣の図種。端では巻き戻る (Ctrl+Alt+↑/↓ の送り先)。
  function stepType(type, delta) {
    var i = indexOfType(type);
    if (i < 0) i = 0;
    var n = ITEMS.length;
    var next = ((i + delta) % n + n) % n;
    return ITEMS[next].type;
  }

  // レール内のボタン列の HTML。active と一致する項目にだけ .active を付ける。
  function buildRailHtml(activeType) {
    var esc = (window.MA.htmlUtils && window.MA.htmlUtils.escHtml)
      ? window.MA.htmlUtils.escHtml
      : function(s) { return String(s); };
    return ITEMS.map(function(it) {
      var on = it.type === activeType;
      return '<button type="button" class="rail-btn' + (on ? ' active' : '') + '"'
        + ' id="rail-' + esc(it.code.toLowerCase()) + '"'
        + ' data-type="' + esc(it.type) + '"'
        + ' title="' + esc(it.title + ' (' + it.label + ')') + '"'
        + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
        + '>' + esc(it.code) + '</button>';
    }).join('');
  }

  return {
    items: items,
    indexOfType: indexOfType,
    codeFor: codeFor,
    labelFor: labelFor,
    isKnownType: isKnownType,
    stepType: stepType,
    buildRailHtml: buildRailHtml,
  };
})();
