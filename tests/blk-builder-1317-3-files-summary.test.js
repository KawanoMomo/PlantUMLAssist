'use strict';
// BLK-builder-20260924-1317-3 (design 10a): FILES ツリー下端の「12 図 未反映 1 控え 1」は、
// 開いているタブではなく保存先の図を、ツリーのファイル行の札と同じ事実で数える。

var W = (typeof window !== 'undefined' && window) || global.window;
var FT = W.MA.fileTree;

describe('FILES ツリー下端の 1 行 (design 10a)', function() {
  test('図 1 枚ごとの札から、図の数・未反映・控えを数える', function() {
    var states = [
      { unapplied: false, draft: false },
      { unapplied: true, draft: false },
      { unapplied: false, draft: true },
      { dirty: true },
      {}, {}, {}, {}, {}, {}, {}, {},
    ];
    expect(FT.summaryOf(states)).toEqual({ total: 12, unapplied: 1, draft: 1 });
    expect(FT.summaryLine(FT.summaryOf(states))).toBe('12 図 · 未反映 1 · 控え 1');
  });

  test('未反映・控えが無ければ図の数だけ', function() {
    expect(FT.summaryLine(FT.summaryOf([{}, {}, {}, {}, {}]))).toBe('5 図');
  });

  test('何も無ければ 0 図 (空の配列・未指定でも落ちない)', function() {
    expect(FT.summaryOf([])).toEqual({ total: 0, unapplied: 0, draft: 0 });
    expect(FT.summaryOf(null)).toEqual({ total: 0, unapplied: 0, draft: 0 });
  });
});
