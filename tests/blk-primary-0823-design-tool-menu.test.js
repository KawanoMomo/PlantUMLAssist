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
  // 「渡す」1 か所に集めた。分類自体は Ctrl+K のために残るので groupOf は 'give' を返す。
  test('design 7a の分類がこの順で並ぶ (渡す は Export ▾ へ移した)', function() {
    expect(tm.groups().map(function(g) { return g.title; }))
      .toEqual(['図をつくる', '書き換える', '探す', '確かめる', 'レビュー']);
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

  // BLK-junior-20260914-1406-wish: ⇔ 先輩の図 を残す側に足した。開いて終わる道具ではなく
  // 画面の枠の出し入れで、畳むと据え置き (深い経路を通らない) の値打ちが消えるため。
  test('タブ列に残すのは 図の出し入れ と 枠の出し入れ だけで、それらは畳まない', function() {
    expect(tm.keepIds()).toEqual(['btn-tab-new', 'btn-tab-folder', 'btn-open-file', 'btn-tab-senior']);
    expect(tm.isFoldable('btn-tab-new')).toBe(false);
    expect(tm.isFoldable('btn-tab-folder')).toBe(false);
    expect(tm.isFoldable('btn-tab-senior')).toBe(false);
    expect(tm.isFoldable('btn-tab-board')).toBe(true);
    // メニューに載っていない未知のボタンは畳まない (画面から消してしまわない)
    expect(tm.isFoldable('btn-tab-unknown')).toBe(false);
  });

  test('分類と文言が id から引ける', function() {
    expect(tm.groupOf('btn-tab-handoff')).toBe('give');
    expect(tm.labelOf('btn-tab-handoff')).toBe('引き継ぎ zip');
    expect(tm.groupOf('btn-tab-nope')).toBe(null);
  });
});

describe('タブ列の機能ボタンとの対応', function() {
  test('タブ列の .tab-tool が漏れなく「残す」か「どれかの分類」に入る', function() {
    var ids = [];
    var re = /<button[^>]*class="tab-tool"[^>]*id="([^"]+)"/g;
    var m;
    while ((m = re.exec(html))) ids.push(m[1]);
    expect(ids.length).toBeGreaterThan(20);
    var uncovered = ids.filter(function(id) {
      return id !== 'btn-tab-tools' && tm.keepIds().indexOf(id) < 0 && tm.groupOf(id) === null;
    });
    expect(uncovered).toEqual([]);
  });

  test('メニューが指す id はすべてタブ列に実在する', function() {
    tm.menuIds().forEach(function(id) {
      expect(html.indexOf('id="' + id + '"')).toBeGreaterThan(0);
    });
  });
});

describe('メニューの HTML', function() {
  test('分類見出しと項目、Ctrl+K の注記が出る', function() {
    var out = tm.buildMenuHtml();
    expect(out).toContain('Ctrl+K でも引けます');
    expect(out).toContain('>レビュー<');
    expect(out).toContain('data-target="btn-tab-board"');
    expect(out).toContain('変更サマリ');
  });

  test('件数を持つものだけ数字が付く', function() {
    var out = tm.buildMenuHtml({ 'btn-tab-pins': '3' });
    expect(out).toContain('<span class="tool-menu-badge">3</span>');
    expect((out.match(/tool-menu-badge/g) || []).length).toBe(1);
  });

  test('文言はエスケープされる', function() {
    expect(tm.buildMenuHtml({ 'btn-tab-pins': '<b>' })).toContain('&lt;b&gt;');
  });
});
