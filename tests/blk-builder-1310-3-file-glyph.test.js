'use strict';
// BLK-builder-20260924-1310-3 (design 10a「ファイルの頭にはその図種の線画が付きます」):
// FILES ツリーのファイル行の頭に、左レールと同じ図種の線画を置く。

var W = (typeof window !== 'undefined' && window) || global.window;
var FT = W.MA.fileTree;
var R = W.MA.diagramRail;

describe('FILES ツリーのファイル行の図種の線画 (design 10a)', function() {
  test('保存先の一覧の短い図種もタブの図種も、レールの図種に読み替える', function() {
    expect(FT.glyphType('sequence')).toBe('plantuml-sequence');
    expect(FT.glyphType('state')).toBe('plantuml-state');
    expect(FT.glyphType('class')).toBe('plantuml-class');
    expect(FT.glyphType('plantuml-usecase')).toBe('plantuml-usecase');
    expect(FT.glyphType('plantuml-activity')).toBe('plantuml-activity');
    expect(FT.glyphType('cmp')).toBe('plantuml-component');
  });

  test('図種が読めなければ空 (線画を出さず幅だけ空ける)', function() {
    expect(FT.glyphType('')).toBe('');
    expect(FT.glyphType(null)).toBe('');
    expect(FT.glyphType('gantt')).toBe('');
    expect(FT.glyphSvg('')).toBe('');
  });

  test('線画は左レールと同じ絵 (ツリーだけの絵を作らない)', function() {
    ['sequence', 'usecase', 'component', 'class', 'activity', 'state'].forEach(function(k) {
      var svg = FT.glyphSvg(k);
      expect(svg).toBe(R.glyphSvg('plantuml-' + k));
      expect(svg).toContain('<svg');
      expect(svg).toContain('currentColor');
    });
  });

  test('行の図種は本文から判定済みのものを先に、無ければ名前の末尾の語', function() {
    expect(FT.fileKind('spi_init', 'sequence')).toBe('sequence');
    expect(FT.fileKind('spi_state', '')).toBe('state');
    expect(FT.fileKind('spi_state', 'class')).toBe('class');
    expect(FT.fileKind('memo', '')).toBe('');
  });
});
