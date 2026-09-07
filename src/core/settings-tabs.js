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

  // ショートカット表 (design 5b)。フラットな一覧では「どのキーがどの状況で効くのか」も
  // 「まだ効かないキーがどれか」も読めなかった。design 5b は
  //   ・効く状況ごとに 4 つのグループへ束ねる
  //   ・実装済み (●) と 新設（未実装） を同じ表の上で区別する
  //   ・操作名で絞り込める
  // と定める。区別を表の上に置くのは「既存の割り当てと衝突させないため」なので、
  // 未実装の行も消さずに載せる。app.js のハンドラを増やしたら state を 'done' にする。
  var GROUPS = [
    {
      id: 'global', label: '全体', note: '',
      rows: [
        { keys: 'Ctrl+K',          desc: 'コマンドパレットを開く',                  state: 'done' },
        { keys: 'Ctrl+R',          desc: '再描画する',                              state: 'done' },
        { keys: 'Ctrl+Z / Ctrl+Y', desc: '元に戻す / やり直す',                     state: 'done' },
        { keys: 'Ctrl+S',          desc: 'ファイルを保存する',                      state: 'done' },
        { keys: 'Ctrl+E',          desc: 'エクスポートメニューを開く',              state: 'done' },
      ],
    },
    {
      id: 'diagram', label: '図の編集', note: '図形を選んでいるとき',
      rows: [
        { keys: '↑ / ↓',           desc: '前後の図形へ選択を移す',                  state: 'done' },
        { keys: 'Enter',           desc: '選択の直後に挿入する',                    state: 'done' },
        { keys: 'Delete',          desc: '選択を削除する',                          state: 'done' },
        { keys: 'Ctrl+D',          desc: '選択を複製する',                          state: 'done' },
        { keys: 'Esc',             desc: '選択を解除する / 開いているものを閉じる',  state: 'done' },
        { keys: 'D',               desc: '選択中メッセージの矢印を切り替える',      state: 'done' },
        { keys: 'Ctrl+Enter',      desc: '末尾に追加する',                          state: 'new' },
        { keys: 'Alt+↑ / Alt+↓',   desc: '選択を上下に並び替える — 同じ親の中だけ', state: 'new' },
      ],
    },
    {
      id: 'editor', label: 'DSL エディタ', note: 'テキスト欄にカーソルがあるとき',
      rows: [
        { keys: 'Ctrl+/',            desc: '選択行をコメント化 / 解除する',   state: 'done' },
        { keys: 'Tab / Shift+Tab',   desc: 'インデント / 解除する',           state: 'done' },
        { keys: 'Alt+↑ / Alt+↓',     desc: 'カーソル行を上下に移動する',      state: 'done' },
      ],
    },
    {
      id: 'view', label: '表示', note: '',
      rows: [
        { keys: 'Ctrl+ + / − / 0',   desc: '拡大 / 縮小 / 幅に合わせる',      state: 'done' },
        { keys: 'Ctrl+1 … Ctrl+6',   desc: '図の種類を切り替える',            state: 'done' },
      ],
    },
  ];

  var STATE_LABEL = { done: '実装済み', 'new': '新設（未実装）' };

  var EDITOR_FONT_MIN = 10;
  var EDITOR_FONT_MAX = 24;
  // design 5a の設計では「図をクリックしたら DSL の該当行へ移動」は入りで有効。
  var EDITOR_DEFAULTS = { fontSize: 13, wrap: false, clickToLine: true };

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
  function shortcutGroups() {
    var extra = (window.MA.exportShortcuts && window.MA.exportShortcuts.shortcutRows)
      ? window.MA.exportShortcuts.shortcutRows() : [];
    return GROUPS.map(function(g) {
      var rows = g.rows.map(function(r) {
        return { keys: r.keys, desc: r.desc, state: r.state };
      });
      // Export の 2 つは全体のキーなので「全体」に合流させる。
      if (g.id === 'global') {
        extra.forEach(function(r) {
          rows.push({ keys: r.keys, desc: r.desc, state: 'done' });
        });
      }
      return { id: g.id, label: g.label, note: g.note, rows: rows };
    });
  }

  // 平らな一覧。旧 API の呼び出し元と、件数を数えたいテストのため。
  function shortcutRows() {
    var out = [];
    shortcutGroups().forEach(function(g) {
      g.rows.forEach(function(r) { out.push(r); });
    });
    return out;
  }

  // 「⌕ 操作名で検索」。操作名だけでなくキー文字列でも当てる
  // (「ctrl+d は何だったか」を引ける方が、割り当ての衝突を見つけやすい)。
  // 空になったグループは見出しごと落とす。
  function filterGroups(groups, query) {
    var q = String(query == null ? '' : query).trim().toLowerCase();
    if (!q) return groups;
    var out = [];
    groups.forEach(function(g) {
      var rows = g.rows.filter(function(r) {
        return (r.desc + ' ' + r.keys).toLowerCase().indexOf(q) >= 0;
      });
      if (rows.length > 0) out.push({ id: g.id, label: g.label, note: g.note, rows: rows });
    });
    return out;
  }

  function groupHeading(g) {
    return g.note ? (g.label + '（' + g.note + '）') : g.label;
  }

  // 状態は ● / 「新設」のチップで示す。色だけに頼らないよう文字も出す。
  function stateChipHtml(state) {
    var s = state === 'new' ? 'new' : 'done';
    return '<span class="cfg-sc-state cfg-sc-' + s + '" title="' + esc(STATE_LABEL[s]) + '">'
      + (s === 'done' ? '●' : '新設') + '</span>';
  }

  function buildShortcutsHtml(query) {
    var groups = filterGroups(shortcutGroups(), query);
    if (groups.length === 0) {
      return '<div id="cfg-sc-empty" class="cfg-sc-empty">該当する操作がありません</div>';
    }
    return groups.map(function(g) {
      return '<div class="cfg-sc-group" data-sc-group="' + esc(g.id) + '">'
        + '<div class="cfg-sc-heading">' + esc(groupHeading(g)) + '</div>'
        + '<table class="cfg-sc-table"><tbody>'
        + g.rows.map(function(r) {
            return '<tr data-sc-state="' + esc(r.state) + '">'
              + '<th><kbd>' + esc(r.keys) + '</kbd></th>'
              + '<td>' + esc(r.desc) + '</td>'
              + '<td class="cfg-sc-state-cell">' + stateChipHtml(r.state) + '</td>'
              + '</tr>';
          }).join('')
        + '</tbody></table></div>';
    }).join('');
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
    // 未設定 (キーが無い) と false は区別する。既定が true なので、
    // undefined を !! で潰すと保存前の状態が「無効」に見えてしまう。
    var jump = p.clickToLine === undefined || p.clickToLine === null
      ? EDITOR_DEFAULTS.clickToLine : !!p.clickToLine;
    return { fontSize: n, wrap: !!p.wrap, clickToLine: jump };
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
    GROUPS: GROUPS,
    STATE_LABEL: STATE_LABEL,
    EDITOR_FONT_MIN: EDITOR_FONT_MIN,
    EDITOR_FONT_MAX: EDITOR_FONT_MAX,
    EDITOR_DEFAULTS: EDITOR_DEFAULTS,
    tabIds: tabIds,
    isValidTab: isValidTab,
    normalizeTab: normalizeTab,
    tabLabel: tabLabel,
    buildTabsHtml: buildTabsHtml,
    shortcutRows: shortcutRows,
    shortcutGroups: shortcutGroups,
    filterGroups: filterGroups,
    groupHeading: groupHeading,
    stateChipHtml: stateChipHtml,
    buildShortcutsHtml: buildShortcutsHtml,
    normalizeRenderMode: normalizeRenderMode,
    renderModeNote: renderModeNote,
    normalizeEditorPrefs: normalizeEditorPrefs,
    editorStyleFor: editorStyleFor,
  };
})();
