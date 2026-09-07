'use strict';
window.MA = window.MA || {};

// diagram-rail — 画面左端の図種レール (design 1a「Quiet Rail」)。
//
// 図種はツールバーの <select> に埋もれており、切り替えに「開く→選ぶ」の 2 手が要り、
// 今どの図種を編集しているかも閉じたセレクトの表示文字でしか分からない。
// レールは 6 図種を縦に並べて 1 クリックで切り替えられるようにし、現在の図種を
// 常時ハイライトする。ここは DOM に触らない純関数だけを置き、描画と結線は app.js。
window.MA.diagramRail = (function() {
  // 略号だけでは「SEQ」「CMP」を知っている人にしか読めないので、その図の形そのものを
  // 1px の線画で添える (design 7a)。16x16 の座標系に統一し、線幅・角丸・見た目の大きさを
  // 揃えてある。色は currentColor で、選択状態はボタン側の色がそのまま乗る。
  var GLYPHS = {
    // ライフライン 2 本と、その間を渡るメッセージ 1 本
    'plantuml-sequence':
      '<path d="M4.5 2.5v11M11.5 2.5v11" stroke-dasharray="2 1.6"/>'
      + '<path d="M4.5 7.5h7M9.6 5.9l1.9 1.6-1.9 1.6"/>',
    // 楕円 (ユースケース) と、それを指すアクターの線
    'plantuml-usecase':
      '<ellipse cx="9.5" cy="8" rx="5" ry="3.6"/>'
      + '<path d="M1.5 8h2.4"/>',
    // 部品 (左辺に 2 つの接続タブが出た箱)
    'plantuml-component':
      '<rect x="4.5" y="3.5" width="9" height="9" rx="1"/>'
      + '<path d="M2.5 6h2M2.5 10h2"/>',
    // 区切り付きの箱 (クラス: 名前 / メンバー)
    'plantuml-class':
      '<rect x="2.5" y="3.5" width="11" height="9" rx="1"/>'
      + '<path d="M2.5 6.8h11"/>',
    // 菱形 (分岐) と、そこへ入る流れ
    'plantuml-activity':
      '<path d="M8 4.2l3.6 3.8L8 11.8 4.4 8z"/>'
      + '<path d="M8 1.4v2.2M8 12.4v2.2"/>',
    // 丸角の状態 2 つを繋ぐ遷移の矢印
    'plantuml-state':
      '<rect x="1.6" y="5" width="5.4" height="6" rx="2.4"/>'
      + '<path d="M7.6 8h5.2M11.4 6.6L12.9 8l-1.5 1.4"/>'
      + '<path d="M13.4 5.6v4.8"/>',
  };

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

  // 図種の線画 (16x16 の <svg> の中身)。未知の図種は空文字で、レールは略号だけを出す。
  function glyphFor(type) {
    return GLYPHS[type] || '';
  }

  // 線画を <svg> で包む。装飾なので支援技術からは隠す (ボタン本体が略号と title を持つ)。
  function glyphSvg(type) {
    var g = glyphFor(type);
    if (!g) return '';
    return '<svg class="rail-glyph" viewBox="0 0 16 16" width="16" height="16"'
      + ' fill="none" stroke="currentColor" stroke-width="1"'
      + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
      + g + '</svg>';
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
        + '>' + glyphSvg(it.type)
        + '<span class="rail-code">' + esc(it.code) + '</span></button>';
    }).join('');
  }

  return {
    items: items,
    indexOfType: indexOfType,
    codeFor: codeFor,
    labelFor: labelFor,
    isKnownType: isKnownType,
    stepType: stepType,
    glyphFor: glyphFor,
    glyphSvg: glyphSvg,
    buildRailHtml: buildRailHtml,
  };
})();
