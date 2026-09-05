'use strict';
var jsdom = require('jsdom');
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
require('../src/core/selection.js');
var sel = window.MA.selection;

describe('selection range', function() {
  beforeEach(function() {
    sel.init(function() {});
    sel.clearSelection();
  });
  test('getRange returns min/max line of multi-selection', function() {
    sel.setSelected([
      { type: 'message', id: 'a', line: 5 },
      { type: 'message', id: 'b', line: 8 },
      { type: 'message', id: 'c', line: 6 },
    ]);
    var r = sel.getRange();
    expect(r).toEqual({ start: 5, end: 8 });
  });
  test('getRange returns null when no selection', function() {
    expect(sel.getRange()).toBe(null);
  });
});

// FEAT-123 [AC-5] (resolves UI-014 / HFR-064)
// 挿入フォームが退避する prevSelection が、退避後の選択変更に影響されない複製であること。
// 🔴 分類 (b) 回帰ガード / 非退行テスト: 本ケースは変更前のコードでも PASS する
//    (getSelected() は元々 sel.slice() を返す)。E5 [R-1](b) に従い分類を明記する。
describe('FEAT-123: selection snapshot is a copy (regression guard)', function() {
  beforeEach(function() {
    sel.init(function() {});
    sel.clearSelection();
  });
  test('[AC-5] getSelected() の戻り値は以後の setSelected に影響されない', function() {
    sel.setSelected([{ type: 'message', id: 'm1', line: 8 }]);
    var snapshot = sel.getSelected();
    sel.setSelected([{ type: 'message', id: 'm2', line: 12 }]);
    expect(snapshot).toEqual([{ type: 'message', id: 'm1', line: 8 }]);
    // 退避した値でそのまま復帰できる。
    sel.setSelected(snapshot);
    expect(sel.getSelected()).toEqual([{ type: 'message', id: 'm1', line: 8 }]);
  });
});
