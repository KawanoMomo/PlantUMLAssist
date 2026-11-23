'use strict';
// BLK-primary-20260908-0823-design (design 7a): タブ列の機能ボタンを「ツール」1 か所に畳む。
//
// タブ列に 20 個以上の機能ボタンが常時横並びで出ており、目的のボタンを目で探す手間が
// 業務のたびに要る。6 分類のメニューに畳み、分類だけを開いて選べるようにする。

const fs = require('fs');
const path = require('path');

var W = (typeof window !== 'undefined' && window) || global.window;
var tm = W.MA.toolMenu;

const html = fs.readFileSync(path.resolve(__dirname, '..', 'plantuml-assist.html'), 'utf8');

describe('ツールメニューの分類', function() {
  // BLK-owner-20260918-0329-prune: 「渡す」はこのメニューから外し、Export ▾ の
  // 「渡す」1 か所に集めた (TICKET-owner-20261115-1828-prune で引き継ぎ・納品ごと外した)。
  test('design 7a の分類がこの順で並ぶ (渡す は Export ▾ へ移した)', function() {
    expect(tm.groups().map(function(g) { return g.title; }))
      .toEqual(['書き換える']);
    // 「図をつくる」(既存の図や雛形から起こす) は TICKET-owner-20261116-0321-prune で中身ごと外した。
    expect(tm.menuIds().indexOf('btn-tab-template')).toBe(-1);
    // 「探す」(図をまたぐ調べ物) は TICKET-owner-20261115-2140-prune で中身ごと外した。
    ['btn-tab-symptom', 'btn-tab-blame', 'btn-tab-xref', 'btn-tab-lineage'].forEach(function(id) {
      expect(tm.menuIds().indexOf(id)).toBe(-1);
    });
    // 「確かめる」(図をまたぐ監査) は TICKET-owner-20261115-1841-prune で中身ごと外した。
    expect(tm.menuIds().indexOf('btn-tab-cross')).toBe(-1);
    expect(tm.menuIds().indexOf('btn-tab-handoff')).toBe(-1);
    expect(tm.menuIds().indexOf('btn-tab-delivery')).toBe(-1);
  });

  test('どの分類も 1 件以上を持ち、項目 id は重複しない', function() {
    var seen = {};
    tm.groups().forEach(function(g) {
      expect(g.items.length).toBeGreaterThan(0);
      g.items.forEach(function(it) {
        expect(typeof it.label === 'string' && it.label.length > 0).toBe(true);
        expect(seen[it.id] === true).toBe(false);
        seen[it.id] = true;
      });
    });
  });

  test('分類と文言が id から引ける', function() {
    // 引き継ぎ zip・納品パッケージ (渡す) は TICKET-owner-20261115-1828-prune で外した。
    expect(tm.groupOf('btn-tab-handoff')).toBe(null);
    // 「レビュー」分類 (前回保存からの差分) は TICKET-owner-20261115-2141-prune で外した。
    expect(tm.groupOf('btn-tab-diff')).toBe(null);
    expect(tm.groupOf('tool-lines')).toBe('edit');
    expect(tm.labelOf('tool-lines')).toBe('行を書き換える');
    expect(tm.groupOf('btn-tab-lineage')).toBe(null);
    expect(tm.groupOf('btn-tab-nope')).toBe(null);
  });
});

// TICKET-owner-20261123-0222-prune: タブ列に道具のボタンを並べる切り替え (畳む / 畳まない) を外し、
// 道具の入口は右端の「ツール ▾」1 つにした。メニューの行は道具の名前 (tool-*) を持ち、
// app.js の runTool が窓を開く (タブ列のボタンを押させない)。
describe('タブ列は 図のタブ・＋・ツール ▾ だけ', function() {
  test('タブ列の .tab-tool は ＋・(隠した) 開く・ツール ▾ の 3 つだけ', function() {
    var bar = html.slice(html.indexOf('<div id="tab-bar">'), html.indexOf('<div id="tool-menu"'));
    var ids = [];
    var re = /<button[^>]*class="tab-tool"[^>]*id="([^"]+)"/g;
    var m;
    while ((m = re.exec(bar))) ids.push(m[1]);
    expect(ids).toEqual(['btn-tab-new', 'btn-open-file', 'btn-tab-tools']);
  });

  test('畳む・置き場の切り替えの痕跡が画面と部品に無い', function() {
    var src = html + fs.readFileSync(path.resolve(__dirname, '..', 'src', 'app.js'), 'utf8')
      + fs.readFileSync(path.resolve(__dirname, '..', 'src', 'core', 'tool-menu.js'), 'utf8');
    ['plantuml-tools-folded', 'tool-menu-fold', 'tool-menu-quiet', 'タブ列から畳む', '右端へ戻す',
      'btn-tab-tools-mini', 'btn-tab-lines', 'btn-tab-versions', 'btn-tab-rename'].forEach(function(w) {
      expect(src.indexOf(w)).toBe(-1);
    });
    ['foldedAtStart', 'quietAtStart', 'footToggles', 'miniTitle', 'isFoldable', 'keepIds'].forEach(function(k) {
      expect(typeof tm[k]).toBe('undefined');
    });
  });

  test('メニューが指す id はどれも道具の名前で、app.js の runTool が受ける', function() {
    var app = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'app.js'), 'utf8');
    expect(tm.menuIds()).toEqual(['tool-lines', 'tool-rename']);
    tm.menuIds().concat(['tool-versions']).forEach(function(id) {
      expect(app.indexOf("_toolRunners['" + id + "'] =")).toBeGreaterThan(0);
    });
  });
});

describe('メニューの HTML', function() {
  // TICKET-roadmap-20261115-2114-2: 分類の見出しは出さない (1 段の一覧。小見出しは残す)。
  test('小見出しと項目、Ctrl+K の注記が出る', function() {
    var out = tm.buildMenuHtml();
    expect(out).toContain('Ctrl+K でも引けます');
    expect(out).toContain('>まとめて直す<');
    expect(out).not.toContain('>書き換える<');
    expect(out).toContain('data-target="tool-lines"');
    expect(out).toContain('行を書き換える');
    expect(out).not.toContain('>レビュー<');
  });

  test('件数を持つものだけ数字が付く', function() {
    var out = tm.buildMenuHtml({ 'tool-lines': '3' });
    expect(out).toContain('<span class="tool-menu-badge">3</span>');
    expect((out.match(/tool-menu-badge/g) || []).length).toBe(1);
  });

  test('文言はエスケープされる', function() {
    expect(tm.buildMenuHtml({ 'tool-lines': '<b>' })).toContain('&lt;b&gt;');
  });
});
