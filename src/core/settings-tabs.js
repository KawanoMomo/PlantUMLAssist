'use strict';
window.MA = window.MA || {};

// settings-tabs — 設定モーダルの 5 タブ (design 1a)。
//
// 設定モーダルは自動保存だけの 1 枚もののフォームで、レンダリングモードや
// エディタの見た目、ショートカット一覧を確かめる経路が無かった。design 1a は
// これを「自動保存 / レンダリング / エディタ / ショートカット / データ」の
// 5 タブに割る。ここは DOM に触らない純関数だけを置き、結線は app.js。
window.MA.settingsTabs = (function() {
  var TABS = [
    { id: 'autosave',  label: '自動保存',       en: 'Autosave' },
    { id: 'render',    label: 'レンダリング',   en: 'Render' },
    { id: 'editor',    label: 'エディタ',       en: 'Editor' },
    { id: 'shortcuts', label: 'ショートカット', en: '' },
    { id: 'data',      label: 'データ',         en: 'Data' },
  ];

  var DEFAULT_TAB = 'autosave';

  // 画面に出しているキーだけを載せる。ここに無いキーは「無い」と読めてしまうので、
  // app.js のハンドラを増やしたらこの表も足す。
  var SHORTCUTS = [
    { keys: 'Ctrl+K',        desc: 'コマンドパレットを開く' },
    { keys: 'Ctrl+Z',        desc: '元に戻す' },
    { keys: 'Ctrl+Y',        desc: 'やり直す' },
    { keys: 'Ctrl+D',        desc: '選択中の要素を複製する' },
    { keys: 'Ctrl+E',        desc: 'エクスポートメニューを開く' },
    { keys: 'Ctrl+/',        desc: 'カーソル行をコメント / 解除する' },
    { keys: 'Tab',           desc: 'エディタでインデントする' },
    { keys: 'Alt+↑ / Alt+↓', desc: 'カーソル行を上下に移動する' },
    { keys: '↑ / ↓',         desc: '前後の要素へ選択を移す' },
    { keys: 'Enter',         desc: '選択行の直後に挿入する' },
    { keys: 'Delete',        desc: '選択中の要素を削除する' },
    { keys: 'D',             desc: '選択中メッセージの矢印を切り替える' },
    { keys: 'Esc',           desc: '開いているモーダル / メニューを閉じる' },
  ];

  var EDITOR_FONT_MIN = 10;
  var EDITOR_FONT_MAX = 24;
  var EDITOR_DEFAULTS = { fontSize: 13, wrap: false };

  function tabIds() {
    return TABS.map(function(t) { return t.id; });
  }

  function isValidTab(id) {
    return tabIds().indexOf(String(id)) >= 0;
  }

  // 不明な id は既定タブに落とす。localStorage に古い id が残っていても
  // 「どのペインも出ない設定モーダル」にはしない。
  function normalizeTab(id) {
    return isValidTab(id) ? String(id) : DEFAULT_TAB;
  }

  function tabLabel(id) {
    for (var i = 0; i < TABS.length; i++) {
      if (TABS[i].id === id) return TABS[i].en ? (TABS[i].label + ' / ' + TABS[i].en) : TABS[i].label;
    }
    return '';
  }

  function esc(s) {
    return (window.MA.htmlUtils && window.MA.htmlUtils.escHtml)
      ? window.MA.htmlUtils.escHtml(s) : String(s);
  }

  function buildTabsHtml(activeId) {
    var active = normalizeTab(activeId);
    return TABS.map(function(t) {
      return '<button type="button" class="cfg-tab' + (t.id === active ? ' active' : '')
        + '" id="cfg-tab-' + t.id + '" data-cfg-tab="' + t.id + '"'
        + (t.id === active ? ' aria-selected="true"' : ' aria-selected="false"')
        + '>' + esc(tabLabel(t.id)) + '</button>';
    }).join('');
  }

  // 書き出しのキー割り当ては export-shortcuts が持っている (design 2c)。
  // 一覧はそこから引いて足し、キー文字列を 2 箇所に書かない。
  function shortcutRows() {
    var extra = (window.MA.exportShortcuts && window.MA.exportShortcuts.shortcutRows)
      ? window.MA.exportShortcuts.shortcutRows() : [];
    return SHORTCUTS.concat(extra);
  }

  function buildShortcutsHtml() {
    return '<table class="cfg-sc-table"><tbody>' + shortcutRows().map(function(s) {
      return '<tr><th><kbd>' + esc(s.keys) + '</kbd></th><td>' + esc(s.desc) + '</td></tr>';
    }).join('') + '</tbody></table>';
  }

  // ── レンダリングモード ────────────────────────────────────────────
  function normalizeRenderMode(m) {
    return String(m) === 'online' ? 'online' : 'local';
  }

  // online は DSL が plantuml.com に出ていく。設定画面でそれを明示する。
  function renderModeNote(mode) {
    return normalizeRenderMode(mode) === 'online'
      ? '⚠ online では DSL が plantuml.com に送信されます。'
      : '常駐 JVM で描画します。外部送信はありません。';
  }

  // ── エディタの見た目 ──────────────────────────────────────────────
  function normalizeEditorPrefs(prefs) {
    var p = prefs || {};
    var n = Number(p.fontSize);
    if (!isFinite(n)) n = EDITOR_DEFAULTS.fontSize;
    n = Math.max(EDITOR_FONT_MIN, Math.min(EDITOR_FONT_MAX, Math.round(n)));
    return { fontSize: n, wrap: !!p.wrap };
  }

  // textarea に直接あてる style。折り返し無しでは横スクロールを残す。
  function editorStyleFor(prefs) {
    var p = normalizeEditorPrefs(prefs);
    return {
      fontSize: p.fontSize + 'px',
      whiteSpace: p.wrap ? 'pre-wrap' : 'pre',
      overflowX: p.wrap ? 'auto' : 'scroll',
    };
  }

  return {
    TABS: TABS,
    DEFAULT_TAB: DEFAULT_TAB,
    SHORTCUTS: SHORTCUTS,
    EDITOR_FONT_MIN: EDITOR_FONT_MIN,
    EDITOR_FONT_MAX: EDITOR_FONT_MAX,
    EDITOR_DEFAULTS: EDITOR_DEFAULTS,
    tabIds: tabIds,
    isValidTab: isValidTab,
    normalizeTab: normalizeTab,
    tabLabel: tabLabel,
    buildTabsHtml: buildTabsHtml,
    shortcutRows: shortcutRows,
    buildShortcutsHtml: buildShortcutsHtml,
    normalizeRenderMode: normalizeRenderMode,
    renderModeNote: renderModeNote,
    normalizeEditorPrefs: normalizeEditorPrefs,
    editorStyleFor: editorStyleFor,
  };
})();
