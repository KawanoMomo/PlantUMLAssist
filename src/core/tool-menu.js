'use strict';
window.MA = window.MA || {};

// tool-menu — タブ列に横並びだった機能ボタンを「ツール」1 か所に畳む (design 7a)。
//
// タブ列には 2 種類のものが混ざっている。図のタブ (今どれを見ているか) と、機能ボタン
// (何をするか)。後者が 20 個以上あるため、目的のボタンを目で探す時間が業務のたびに要る。
// ここでは機能ボタンを 6 分類のメニューに畳み、分類ごとに開いて選べるようにする。
// メニュー項目は既存のボタンの id を指すだけで、実際の処理は元のボタンの click に委ねる
// (同じ操作が Ctrl+K のコマンドパレットからも引ける、という関係を崩さないため)。
// ここは DOM に触らない純関数だけを置き、描画と結線は app.js。
window.MA.toolMenu = (function() {
  // 分類と並びは design 7a のパネルに合わせる。label はメニュー上の文言で、
  // タブ列のボタン文字 (絵文字 + 短い語) ではなく「何をするか」で読める形にする。
  var GROUPS = [
    { key: 'make', title: '図をつくる', items: [
      { id: 'btn-tab-template', label: 'テンプレートから作る' },
      { id: 'btn-tab-skeleton', label: '骨格から作る' },
      { id: 'btn-tab-set',      label: '系統ごと複製する' },
      { id: 'btn-tab-draft',    label: '一時控えにする' },
    ] },
    { key: 'edit', title: '書き換える', items: [
      { id: 'btn-tab-lines',  label: '行を書き換える' },
      { id: 'btn-tab-rename', label: '部品名を一括置換する' },
      { id: 'btn-tab-apply',  label: '複数クラスに一括適用する' },
    ] },
    { key: 'find', title: '探す・見比べる', items: [
      { id: 'btn-tab-symptom', label: '症状から関連図を探す' },
      { id: 'btn-tab-xref',    label: '部品名で図をまたいで辿る' },
      { id: 'btn-tab-compare', label: '別の図を右に並べる' },
      { id: 'btn-tab-peek',    label: '他の保存フォルダを覗く' },
    ] },
    { key: 'check', title: '確かめる', items: [
      { id: 'btn-tab-audit',          label: '名前の表記揺れ' },
      { id: 'btn-tab-family',         label: '系統内の動作名のずれ' },
      { id: 'btn-tab-drivermap',      label: '系統マップの崩れ' },
      { id: 'btn-tab-trace',          label: '状態遷移のトレース漏れ' },
      { id: 'btn-tab-pattern',        label: '1 つの観点で全図を棚卸し' },
      { id: 'btn-tab-submit',         label: '提出前チェック' },
      { id: 'btn-tab-audit-timeline', label: '監査履歴' },
    ] },
    { key: 'review', title: 'レビュー', items: [
      { id: 'btn-tab-review',   label: '基準の図と突き合わせる' },
      { id: 'btn-tab-pins',     label: 'この図の指摘' },
      { id: 'btn-tab-inbox',    label: '図をまたぐ指摘箱' },
      { id: 'btn-tab-findings', label: '手動指摘の台帳' },
      { id: 'btn-tab-diff',     label: '前回保存からの差分' },
      { id: 'btn-tab-versions', label: 'この図の変遷' },
      { id: 'btn-tab-board',    label: '変更サマリ' },
    ] },
    { key: 'give', title: '渡す', items: [
      { id: 'btn-tab-handoff',  label: '引き継ぎ zip' },
      { id: 'btn-tab-delivery', label: '納品パッケージ zip' },
    ] },
  ];

  // タブ列に残すもの。図そのものの出し入れ (＋ / 📂 一覧) はツールではないので畳まない。
  var KEEP_IN_TAB_BAR = ['btn-tab-new', 'btn-tab-folder'];

  var NOTE = 'Ctrl+K でも同じ操作が引ける';

  function groups() {
    // 呼び出し側が書き換えても内部が壊れないよう複製を返す。
    return GROUPS.map(function(g) {
      return {
        key: g.key,
        title: g.title,
        items: g.items.map(function(it) { return { id: it.id, label: it.label }; }),
      };
    });
  }

  function menuIds() {
    var ids = [];
    GROUPS.forEach(function(g) {
      g.items.forEach(function(it) { ids.push(it.id); });
    });
    return ids;
  }

  function keepIds() {
    return KEEP_IN_TAB_BAR.slice();
  }

  function groupOf(id) {
    for (var i = 0; i < GROUPS.length; i++) {
      for (var j = 0; j < GROUPS[i].items.length; j++) {
        if (GROUPS[i].items[j].id === id) return GROUPS[i].key;
      }
    }
    return null;
  }

  function labelOf(id) {
    for (var i = 0; i < GROUPS.length; i++) {
      for (var j = 0; j < GROUPS[i].items.length; j++) {
        if (GROUPS[i].items[j].id === id) return GROUPS[i].items[j].label;
      }
    }
    return null;
  }

  // 畳む対象か。タブ列に残すものとメニューに無いものは畳まない
  // (新しいボタンが増えたとき、メニューに載せ忘れたまま画面から消えるのを避ける)。
  function isFoldable(id) {
    if (KEEP_IN_TAB_BAR.indexOf(id) >= 0) return false;
    return groupOf(id) !== null;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // メニューの中身。badges は { 'btn-tab-diff': '2' } のように件数を持つものだけ渡す
  // (タブ列のボタン文字から拾った数字。0 件・未計算のものは付けない)。
  function buildMenuHtml(badges) {
    var b = badges || {};
    var body = GROUPS.map(function(g) {
      var items = g.items.map(function(it) {
        var badge = b[it.id];
        return '<button type="button" class="tool-menu-item" data-target="' + esc(it.id) + '">'
          + '<span class="tool-menu-label">' + esc(it.label) + '</span>'
          + (badge ? '<span class="tool-menu-badge">' + esc(badge) + '</span>' : '')
          + '</button>';
      }).join('');
      return '<div class="tool-menu-group" data-group="' + esc(g.key) + '">'
        + '<div class="tool-menu-title">' + esc(g.title) + '</div>'
        + items + '</div>';
    }).join('');
    return '<div class="tool-menu-note">' + esc(NOTE) + '</div>' + body;
  }

  return {
    groups: groups,
    menuIds: menuIds,
    keepIds: keepIds,
    groupOf: groupOf,
    labelOf: labelOf,
    isFoldable: isFoldable,
    buildMenuHtml: buildMenuHtml,
    NOTE: NOTE,
  };
})();
