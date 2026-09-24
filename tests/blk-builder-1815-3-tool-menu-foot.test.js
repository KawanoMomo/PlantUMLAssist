'use strict';
// BLK-builder-20260924-1815-3 (design 9b / 9a): ツール ▾ のパネル下端の切り替え。
// 9b のパネルは絞り込み欄と 2 段だけ。既定 (畳む・ツール ▾ は右端) の人に切り替えは出さず、
// 以前に自分で既定から外した人にだけ、既定へ戻す 1 行を出す。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/tool-menu.js')]; } catch (e) {}
require('../src/core/tool-menu.js');

const tm = global.window.MA.toolMenu;

describe('ツール ▾ の下端の切り替え (BLK-builder-20260924-1815-3)', function() {
  test('既定 (畳む・静か) の人には何も出さない', function() {
    expect(tm.footToggles(tm.foldedAtStart(null), tm.quietAtStart(null))).toEqual([]);
  });

  test('畳みを解いている人には「タブ列から畳む」だけを出す', function() {
    expect(tm.footToggles(false, true)).toEqual([{ id: 'tool-menu-fold', label: 'タブ列から畳む' }]);
    expect(tm.footToggles(false, false)).toEqual([{ id: 'tool-menu-fold', label: 'タブ列から畳む' }]);
  });

  test('畳んでいて ツール ▾ が ＋ の隣にある人には「ツール ▾ を右端へ戻す」だけを出す', function() {
    expect(tm.footToggles(true, false)).toEqual([{ id: 'tool-menu-quiet', label: 'ツール ▾ を右端へ戻す' }]);
  });

  test('既定から外す文言 (タブ列に戻す・ツール ▾ をタブ列に出す) はどの状態でも出さない', function() {
    [[true, true], [true, false], [false, true], [false, false]].forEach(function(s) {
      tm.footToggles(s[0], s[1]).forEach(function(t) {
        expect(t.label).not.toBe('タブ列に戻す');
        expect(t.label).not.toBe('ツール ▾ をタブ列に出す');
        expect(t.label).not.toBe('タブ列を図のタブだけにする');
      });
    });
  });
});
