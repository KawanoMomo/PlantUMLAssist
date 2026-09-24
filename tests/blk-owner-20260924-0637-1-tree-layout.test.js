'use strict';
// BLK-owner-20260924-0637-1 (design 10a): 「保存先」節の中はツリーだけ。
// 図種の読めない図は部品のフォルダに分けず保存先の直下に並べ、ファイル行の右に札を付ける。

var W = (typeof window !== 'undefined' && window) || global.window;
var FT = W.MA.fileTree;

describe('保存先節のツリーの形', function() {
  test('名前にも本文にも図種が無い図は、部品のフォルダにせず直下に並ぶ', function() {
    var lay = FT.layout([
      { name: 'spi_state', kind: '' },
      { name: 'memo', kind: '' },
      { name: 'examples__usecase-ex', kind: '' },
    ]);
    expect(lay.groups.map(function(g) { return g.part; })).toEqual(['spi']);
    expect(lay.loose.map(function(f) { return f.name; })).toEqual(['examples__usecase-ex', 'memo']);
  });

  test('本文から図種が読める図は部品の側で数え、その図種を未作成に出さない', function() {
    var lay = FT.layout([{ name: 'diagram2', kind: 'class' }]);
    expect(lay.loose).toEqual([]);
    expect(lay.groups[0].countLabel).toBe('DIAGRAM2 1 / 6');
    expect(lay.groups[0].missing).not.toContain('class');
  });

  test('ファイル行の札は 未保存 ● / 未反映 / 控え / SVG 古い の順', function() {
    expect(FT.fileMarks({})).toBe('');
    expect(FT.fileMarks({ dirty: true, svgStale: true })).toBe('● SVG 古い');
    expect(FT.fileMarks({ dirty: true, unapplied: true, draft: true, svgStale: true })).toBe('● 未反映 控え SVG 古い');
  });
});
