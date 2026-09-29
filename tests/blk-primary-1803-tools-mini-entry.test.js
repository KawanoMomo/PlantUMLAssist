'use strict';
// BLK-primary-20260908-1803: 畳んだ機能の入口が Ctrl+K のコマンド名しか無い状態を作らない。
// 静かなタブ列 (7b) で「ツール ▾」を出さないときは、代わりに「他 N 件」の小さな札を出し、
// コマンド名を知らない人でも 1 クリックで畳んだ一覧を開けるようにする。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/tool-menu.js')]; } catch (e) {}
require('../src/core/tool-menu.js');

const tm = global.window.MA.toolMenu;

describe('畳んだツールの小さな入口 (BLK-primary-20260908-1803)', function() {
  test('「ツール ▾」を出さないときだけ札を出す', function() {
    expect(tm.showsMiniButton(true, true)).toBe(true);
  });

  test('「ツール ▾」が出ているときは札を出さない (入口が二重にならない)', function() {
    expect(tm.showsMiniButton(true, false)).toBe(false);
    expect(tm.showsMiniButton(false, true)).toBe(false);
    expect(tm.showsMiniButton(false, false)).toBe(false);
  });

  test('どの状態でも入口はちょうど 1 つある', function() {
    [[true, true], [true, false], [false, true], [false, false]].forEach(function(c) {
      var n = (tm.showsToolButton(c[0], c[1]) ? 1 : 0) + (tm.showsMiniButton(c[0], c[1]) ? 1 : 0);
      expect(n).toBe(1);
    });
  });

  // BLK-builder-20260924-1416-3 (design 7a / 9a / 10a): 札の文字は「ツール ▾」。
  // 以前の「他 25 件」は押すまで何の件数か読めなかった。件数は title に回す。
  test('札の文字はどの件数でも「ツール ▾」', function() {
    expect(tm.miniLabel(25)).toBe('ツール ▾');
    expect(tm.miniLabel(1)).toBe('ツール ▾');
    expect(tm.miniLabel(0)).toBe('ツール ▾');
  });

  test('畳んでいる件数は title で読める', function() {
    expect(tm.miniTitle(25)).toContain('畳んでいるツール 25 件');
    expect(tm.miniTitle(1)).toContain('畳んでいるツール 1 件');
    expect(tm.miniTitle(25)).toContain('Ctrl+K');
  });

  test('件数が数でない・0 以下でも壊れない', function() {
    expect(tm.miniTitle(0)).toContain('畳んでいるツール 0 件');
    expect(tm.miniTitle(null)).toContain('畳んでいるツール 0 件');
    expect(tm.miniTitle(undefined)).toContain('畳んでいるツール 0 件');
  });

  test('メニューに載っているボタンは全部畳む対象 (札の件数と一致する)', function() {
    var ids = tm.menuIds();
    expect(ids.length).toBeGreaterThan(0);
    ids.forEach(function(id) { expect(tm.isFoldable(id)).toBe(true); });
    // 入口そのものは畳まない
    expect(tm.isFoldable('btn-tab-tools-mini')).toBe(false);
    expect(tm.isFoldable('btn-tab-tools')).toBe(false);
  });
});
