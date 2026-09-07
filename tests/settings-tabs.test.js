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

describe('settings-tabs — 設定モーダルの 5 タブ (design 1a)', () => {
  test('design 1a の 5 タブがこの順で並ぶ', () => {
    expect(ST.tabIds()).toEqual(['autosave', 'render', 'editor', 'shortcuts', 'data']);
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

    test('新設（未実装）の行も表から消さず、既存の割り当てと同じ表に載る', () => {
      var news = ST.shortcutRows().filter(function(r) { return r.state === 'new'; });
      expect(news.length).toBeGreaterThan(0);
      var html = ST.buildShortcutsHtml();
      news.forEach(function(r) { expect(html).toContain('<kbd>' + r.keys + '</kbd>'); });
      expect(html).toContain('data-sc-state="new"');
      expect(html).toContain('data-sc-state="done"');
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
      .toEqual({ fontSize: 15, wrap: true, clickToLine: true });
    expect(ST.normalizeEditorPrefs({ fontSize: 3 }).fontSize).toBe(10);
    expect(ST.normalizeEditorPrefs({ fontSize: 99 }).fontSize).toBe(24);
    expect(ST.normalizeEditorPrefs({ fontSize: '17' }).fontSize).toBe(17);
    expect(ST.normalizeEditorPrefs({ fontSize: 12.6 }).fontSize).toBe(13);
  });

  test('normalizeEditorPrefs: 壊れた入力でも既定に落ちて wrap は真偽値', () => {
    expect(ST.normalizeEditorPrefs(null)).toEqual({ fontSize: 13, wrap: false, clickToLine: true });
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
