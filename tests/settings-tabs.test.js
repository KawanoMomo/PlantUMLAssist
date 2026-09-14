'use strict';
// ランナーは全テストを 1 プロセスで動かす。global.window を差し替えると
// 先に読み込まれたモジュールが載っている window ごと消えるので、既にあれば使う。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/html-utils.js')]; } catch (e) {}
require('../src/core/html-utils.js');
try { delete require.cache[require.resolve('../src/core/settings-tabs.js')]; } catch (e) {}
require('../src/core/settings-tabs.js');
var ST = global.window.MA.settingsTabs;

describe('settings-tabs — 設定モーダルのタブ (design 1a / 5d)', () => {
  // design 1a の 5 タブに、design 5d の「UML 要素の網羅一覧」が末尾に加わって 6 タブ。
  test('タブがこの順で並ぶ', () => {
    expect(ST.tabIds()).toEqual(['autosave', 'render', 'editor', 'shortcuts', 'data', 'coverage']);
  });

  test('tabLabel: 和英併記のタブは「和 / 英」、ショートカットは和のみ', () => {
    expect(ST.tabLabel('autosave')).toBe('自動保存 / Autosave');
    expect(ST.tabLabel('data')).toBe('データ / Data');
    expect(ST.tabLabel('shortcuts')).toBe('ショートカット');
    expect(ST.tabLabel('nope')).toBe('');
  });

  test('normalizeTab: 未知の id は既定タブに落とす (どのペインも出ない状態を作らない)', () => {
    expect(ST.normalizeTab('render')).toBe('render');
    expect(ST.normalizeTab('legacy-tab')).toBe('autosave');
    expect(ST.normalizeTab(undefined)).toBe('autosave');
    expect(ST.normalizeTab(null)).toBe('autosave');
    expect(ST.isValidTab('editor')).toBe(true);
    expect(ST.isValidTab('editorX')).toBe(false);
  });

  test('buildTabsHtml: 指定タブだけが active、id は cfg-tab-{id}', () => {
    var html = ST.buildTabsHtml('editor');
    expect(html).toContain('id="cfg-tab-autosave"');
    expect(html).toContain('id="cfg-tab-editor"');
    expect(html).toContain('id="cfg-tab-shortcuts"');
    expect(/class="cfg-tab active" id="cfg-tab-editor"/.test(html)).toBe(true);
    expect((html.match(/cfg-tab active/g) || []).length).toBe(1);
    expect(html).toContain('data-cfg-tab="data"');
  });

  test('buildTabsHtml: 未知のタブ指定でも active は既定タブに 1 つだけ付く', () => {
    var html = ST.buildTabsHtml('zzz');
    expect((html.match(/cfg-tab active/g) || []).length).toBe(1);
    expect(/class="cfg-tab active" id="cfg-tab-autosave"/.test(html)).toBe(true);
  });

  test('buildShortcutsHtml: 主要キーが kbd で出る', () => {
    var html = ST.buildShortcutsHtml();
    expect(html).toContain('<kbd>Ctrl+K</kbd>');
    expect(html).toContain('コマンドパレットを開く');
    expect(html).toContain('<kbd>Ctrl+Z / Ctrl+Y</kbd>');
    // design 2c で書き出しのキー (export-shortcuts) が一覧に加わったため、
    // 行数は GROUPS 単体ではなく shortcutRows() を基準にする。
    expect((html.match(/<tr /g) || []).length).toBe(ST.shortcutRows().length);
  });

  // ── ショートカット表 (design 5b) ────────────────────────────────────
  describe('ショートカット表 — グループ・検索・実装済み/新設 (design 5b)', () => {
    test('shortcutGroups: design 5b の 4 グループが順に並ぶ', () => {
      var ids = ST.shortcutGroups().map(function(g) { return g.id; });
      expect(ids).toEqual(['global', 'diagram', 'editor', 'view']);
    });

    test('groupHeading: 効く状況を括弧で添える', () => {
      var g = ST.shortcutGroups();
      expect(ST.groupHeading(g[0])).toBe('全体');
      expect(ST.groupHeading(g[1])).toBe('図の編集（図形を選んでいるとき）');
      expect(ST.groupHeading(g[2])).toBe('DSL エディタ（テキスト欄にカーソルがあるとき）');
    });

    test('すべての行が実装済み / 新設 のどちらかに分類されている', () => {
      ST.shortcutRows().forEach(function(r) {
        expect(['done', 'new']).toContain(r.state);
      });
    });

    // BLK-builder-20260907-1346-3: 表に残っていた 'new' の 2 行 (Ctrl+Enter /
    // Alt+↑ Alt+↓) を実装したので、いま 'new' の行は 0 件である。design 5b が求めるのは
    // 「未実装の行も消さずに載せ、実装済みと区別する」仕組みなので、'new' が
    // 1 件以上あることではなく、あれば表に出て state で区別されることを確かめる。
    test('新設（未実装）の行も表から消さず、既存の割り当てと同じ表に載る', () => {
      var html = ST.buildShortcutsHtml();
      var news = ST.shortcutRows().filter(function(r) { return r.state === 'new'; });
      news.forEach(function(r) {
        expect(html).toContain('<kbd>' + r.keys + '</kbd>');
      });
      expect(html).toContain('data-sc-state="' + (news.length ? 'new' : 'done') + '"');
      expect(html).toContain('data-sc-state="done"');
      // 区別の仕組み自体は行の有無によらず残っている。
      expect(ST.stateChipHtml('new')).toContain('新設');
    });

    test('stateChipHtml: 色だけでなく文字でも区別する', () => {
      expect(ST.stateChipHtml('done')).toContain('●');
      expect(ST.stateChipHtml('done')).toContain('実装済み');
      expect(ST.stateChipHtml('new')).toContain('新設');
    });

    test('filterGroups: 操作名で絞り込み、空になった見出しは落とす', () => {
      var out = ST.filterGroups(ST.shortcutGroups(), 'コマンドパレット');
      expect(out.length).toBe(1);
      expect(out[0].id).toBe('global');
      expect(out[0].rows.length).toBe(1);
      expect(out[0].rows[0].keys).toBe('Ctrl+K');
    });

    test('filterGroups: キー文字列でも当たる (割り当ての衝突を引けるように)', () => {
      var out = ST.filterGroups(ST.shortcutGroups(), 'alt+');
      var ids = out.map(function(g) { return g.id; });
      expect(ids).toContain('diagram');
      expect(ids).toContain('editor');
    });

    test('filterGroups: 空の検索語は全件そのまま返す', () => {
      var all = ST.shortcutGroups();
      expect(ST.filterGroups(all, '')).toBe(all);
      expect(ST.filterGroups(all, '   ')).toBe(all);
      expect(ST.filterGroups(all, null)).toBe(all);
    });

    test('filterGroups: 大文字小文字を問わない', () => {
      expect(ST.filterGroups(ST.shortcutGroups(), 'CTRL+K').length).toBe(1);
    });

    test('buildShortcutsHtml: 該当なしなら表ではなくその旨を出す', () => {
      var html = ST.buildShortcutsHtml('存在しない操作名');
      expect(html).toContain('該当する操作がありません');
      expect(html).not.toContain('<kbd>');
    });

    test('同じキーに 2 つの操作が割り当てられていない (Alt+↑↓ のフォーカス排他を除く)', () => {
      var seen = {};
      var dup = [];
      ST.shortcutRows().forEach(function(r) {
        if (r.keys === 'Alt+↑ / Alt+↓') return;  // 図側と DSL 側でフォーカス排他
        if (seen[r.keys]) dup.push(r.keys);
        seen[r.keys] = true;
      });
      expect(dup).toEqual([]);
    });
  });

  test('normalizeRenderMode: online 以外はすべて local', () => {
    expect(ST.normalizeRenderMode('online')).toBe('online');
    expect(ST.normalizeRenderMode('local')).toBe('local');
    expect(ST.normalizeRenderMode(undefined)).toBe('local');
    expect(ST.normalizeRenderMode('ONLINE')).toBe('local');
  });

  test('renderModeNote: online のときだけ外部送信を明示する', () => {
    expect(ST.renderModeNote('online')).toContain('plantuml.com に送信');
    expect(ST.renderModeNote('local')).toContain('外部送信はありません');
  });

  test('normalizeEditorPrefs: フォントサイズは 10〜24 に丸めてクランプする', () => {
    expect(ST.normalizeEditorPrefs({ fontSize: 15, wrap: true }))
      .toEqual({ fontSize: 15, wrap: true, clickToLine: true, indent: '2' });
    expect(ST.normalizeEditorPrefs({ fontSize: 3 }).fontSize).toBe(10);
    expect(ST.normalizeEditorPrefs({ fontSize: 99 }).fontSize).toBe(24);
    expect(ST.normalizeEditorPrefs({ fontSize: '17' }).fontSize).toBe(17);
    expect(ST.normalizeEditorPrefs({ fontSize: 12.6 }).fontSize).toBe(13);
  });

  test('normalizeEditorPrefs: 壊れた入力でも既定に落ちて wrap は真偽値', () => {
    expect(ST.normalizeEditorPrefs(null)).toEqual({ fontSize: 13, wrap: false, clickToLine: true, indent: '2' });
    expect(ST.normalizeEditorPrefs({ fontSize: 'abc' }).fontSize).toBe(13);
    expect(ST.normalizeEditorPrefs({ wrap: 'yes' }).wrap).toBe(true);
  });

  test('editorStyleFor: 折り返し ON/OFF で white-space と横スクロールが変わる', () => {
    expect(ST.editorStyleFor({ fontSize: 15, wrap: true }))
      .toEqual({ fontSize: '15px', whiteSpace: 'pre-wrap', overflowX: 'auto' });
    expect(ST.editorStyleFor({ fontSize: 13, wrap: false }))
      .toEqual({ fontSize: '13px', whiteSpace: 'pre', overflowX: 'scroll' });
  });
});

// design 5d: UML 要素の網羅一覧。図種ごとの「常時表示 / その他パレット」の配分を
// 1 枚の表で見せ、配分そのものをレビュー対象にする。
describe('design 5d — UML 要素の網羅一覧', function() {
  test('6 図種すべてが表に載る', function() {
    var rows = ST.coverageRows(null);
    expect(rows.length).toBe(6);
    expect(rows.map(function(r) { return r.label; }))
      .toEqual(['Sequence', 'UseCase', 'Component', 'Class', 'Activity', 'State']);
  });

  test('どの図種も常時表示とその他パレットの両方を持つ', function() {
    ST.coverageRows(null).forEach(function(r) {
      expect(r.always.length).toBeGreaterThan(0);
      expect(r.palette.length).toBeGreaterThan(0);
      expect(r.alwaysCount).toBe(r.always.length);
      expect(r.paletteCount).toBe(r.palette.length);
    });
  });

  test('いま編集している図種だけ current が立つ', function() {
    var rows = ST.coverageRows('plantuml-state');
    var cur = rows.filter(function(r) { return r.current; });
    expect(cur.length).toBe(1);
    expect(cur[0].label).toBe('State');
  });

  test('タブ一覧に coverage が入り、既定タブは変わらない', function() {
    expect(ST.tabIds().indexOf('coverage')).toBeGreaterThan(-1);
    expect(ST.isValidTab('coverage')).toBe(true);
    expect(ST.DEFAULT_TAB).toBe('autosave');
    expect(ST.tabLabel('coverage')).toBe('UML 要素の網羅一覧');
  });

  test('要素名で絞ると、その要素を持つ図種の行だけが残る', function() {
    var rows = ST.filterCoverage(ST.coverageRows(null), 'スイムレーン');
    expect(rows.length).toBe(1);
    expect(rows[0].label).toBe('Activity');
    expect(rows[0].always).toEqual(['スイムレーン']);
    // 件数は絞り込んでも元のままで、配分が読めなくならない
    expect(rows[0].alwaysCount).toBe(7);
  });

  test('図種名でも絞れる', function() {
    var rows = ST.filterCoverage(ST.coverageRows(null), 'sequence');
    expect(rows.length).toBe(1);
    expect(rows[0].label).toBe('Sequence');
    expect(rows[0].always.length).toBe(rows[0].alwaysCount);
  });

  test('当たらない語では空になる', function() {
    expect(ST.filterCoverage(ST.coverageRows(null), 'まったく無い要素').length).toBe(0);
  });

  test('空の検索語では全部返す', function() {
    expect(ST.filterCoverage(ST.coverageRows(null), '  ').length).toBe(6);
  });

  test('buildCoverageHtml は 6 行の表を作り、編集中の図種に印を付ける', function() {
    var html = ST.buildCoverageHtml('plantuml-class', '');
    expect(html.indexOf('data-cv-rows="6"')).toBeGreaterThan(-1);
    expect(html.indexOf('data-cv-type="plantuml-class"')).toBeGreaterThan(-1);
    expect(html.indexOf('cfg-cv-current')).toBeGreaterThan(-1);
    expect(html.indexOf('編集中')).toBeGreaterThan(-1);
    expect(html.indexOf('常時表示')).toBeGreaterThan(-1);
    expect(html.indexOf('その他パレット')).toBeGreaterThan(-1);
  });

  test('当たらない検索では該当なしを出す', function() {
    var html = ST.buildCoverageHtml(null, 'まったく無い要素');
    expect(html.indexOf('cfg-cv-empty')).toBeGreaterThan(-1);
    expect(html.indexOf('該当する要素がありません')).toBeGreaterThan(-1);
  });

  test('要素名の < > は素通ししない (DSL の矢印記法をそのまま載せているため)', function() {
    var html = ST.buildCoverageHtml('plantuml-sequence', '');
    expect(html.indexOf('<->')).toBe(-1);
    expect(html.indexOf('&lt;-&gt;')).toBeGreaterThan(-1);
  });
});
