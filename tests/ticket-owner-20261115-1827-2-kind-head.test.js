'use strict';
// TICKET-owner-20261115-1827-2: FILES の保存先で、先頭の語が図種の語の図 (seq-1・state-1・class-1 …) を
// 部品名として束ねない。6 枚そろえると「SEQ」「STATE」… の 6 つの部品に 1 枚ずつ割れ、
// どれにも「未作成 5 図種」が付いていた。部品名で始まる図 (SPI_seq・spi_state) の束ね方は変えない。

// 全件の実行では前のファイルが global.window を差し替えるので、file-tree.js を自前の window に読み込む。
var fs = require('fs');
var path = require('path');
var ownWin = { MA: {} };
new Function('window', fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'file-tree.js'), 'utf8'))(ownWin);
var FT = ownWin.MA.fileTree;

describe('先頭が図種の語の図は部品に束ねない (TICKET-owner-20261115-1827-2)', function() {
  var entries = [
    { name: 'seq-1', kind: 'sequence' },
    { name: 'state-1', kind: 'state' },
    { name: 'class-1', kind: 'class' },
    { name: 'comp-1', kind: 'component' },
    { name: 'act-1', kind: 'activity' },
    { name: 'uc-1', kind: 'usecase' },
    { name: 'SPI_seq', kind: '' },
    { name: 'spi_state', kind: '' },
  ];

  test('seq-1 など 6 枚は直下、SPI_seq と spi_state は SPI', function() {
    var lay = FT.layout(entries);
    expect(lay.groups.map(function(g) { return g.part; })).toEqual(['spi']);
    expect(lay.groups[0].files.map(function(f) { return f.name; })).toEqual(['SPI_seq', 'spi_state']);
    expect(lay.groups[0].countLabel).toBe('SPI 2 / 6');
    expect(lay.loose.map(function(f) { return f.name; }).sort())
      .toEqual(['act-1', 'class-1', 'comp-1', 'seq-1', 'state-1', 'uc-1']);
  });

  test('直下に並べた図も図種は持つ (行の頭の線画のため)', function() {
    var lay = FT.layout(entries);
    var byName = {};
    lay.loose.forEach(function(f) { byName[f.name] = f.kind; });
    expect(byName['seq-1']).toBe('sequence');
    expect(byName['uc-1']).toBe('usecase');
  });

  test('長い語・略号・大文字でも直下 (sequence / stm / cmp / CLS / ST)', function() {
    var lay = FT.layout([
      { name: 'sequence_1', kind: 'sequence' }, { name: 'stm-2', kind: 'state' },
      { name: 'cmp_a', kind: 'component' }, { name: 'CLS-3', kind: 'class' },
      { name: 'ST 4', kind: 'state' }, { name: 'activity', kind: 'activity' },
    ]);
    expect(lay.groups).toEqual([]);
    expect(lay.loose.length).toBe(6);
  });

  test('図種の語を名前の途中に持つ部品は今のまま束ねる', function() {
    var lay = FT.layout([{ name: 'spi_init_sequence' }, { name: 'stack_state' }, { name: 'actuator_class' }]);
    expect(lay.groups.map(function(g) { return g.part; })).toEqual(['actuator', 'spi', 'stack']);
    expect(lay.loose).toEqual([]);
  });

  test('パンくずの部品の段も出さない', function() {
    expect(FT.partFor('seq-1', entries)).toBe(null);
    expect(FT.partFor('spi_state', entries).part).toBe('spi');
  });
});
