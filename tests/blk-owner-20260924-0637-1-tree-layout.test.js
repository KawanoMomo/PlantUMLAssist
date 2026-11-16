'use strict';
// BLK-owner-20260924-0637-1 (design 10a): 「保存先」節の中はツリーだけ。
// 図はすべて保存先の直下に並べ、ファイル行の右に札を付ける
// (部品のフォルダに束ねることは TICKET-owner-20261116-0321-prune で外した)。

var W = (typeof window !== 'undefined' && window) || global.window;
var FT = W.MA.fileTree;

describe('保存先節のツリーの形', function() {
  test('図種の有無にかかわらず、図はすべて直下に名前の順で並ぶ', function() {
    var rows = FT.targetRows([
      { name: 'spi_state', kind: '' },
      { name: 'memo', kind: '' },
      { name: 'examples__usecase-ex', kind: '' },
    ]);
    expect(rows.map(function(f) { return f.name; })).toEqual(['examples__usecase-ex', 'memo', 'spi_state']);
  });

  test('本文から図種が読める図はその図種を行に持つ (線画のため)', function() {
    expect(FT.targetRows([{ name: 'diagram2', kind: 'class' }])).toEqual([{ name: 'diagram2', kind: 'class' }]);
  });

  // 「控え」「SVG 古い」の札は TICKET-owner-20261116-0241-prune で外した。
  test('ファイル行の札は 未保存 ● / 未反映 の順 (控え・SVG 古い は出さない)', function() {
    expect(FT.fileMarks({})).toBe('');
    expect(FT.fileMarks({ dirty: true, svgStale: true })).toBe('●');
    expect(FT.fileMarks({ dirty: true, unapplied: true, draft: true, svgStale: true })).toBe('● 未反映');
  });
});
