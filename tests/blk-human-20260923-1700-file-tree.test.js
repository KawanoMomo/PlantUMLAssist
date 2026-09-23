'use strict';
// BLK-human-20260923-1700 (design 10a): レール右の FILES ツリーの中身。
// 「保存先チップ / 📂 一覧 / 📄 開く / ⇔ 先輩」の 4 入口を 1 本のツリーに畳む。

var W = (typeof window !== 'undefined' && window) || global.window;
var FT = W.MA.fileTree;

var FOLDER = [
  { name: 'spi_init_sequence', kind: 'sequence' },
  { name: 'spi_state', kind: 'state' },
  { name: 'spi_class', kind: 'class' },
  { name: 'spi_flow_component', kind: 'component' },
  { name: 'can_init_sequence', kind: 'sequence' },
  { name: 'can_state', kind: 'state' },
  { name: 'driver_common_class', kind: 'class' },
];

describe('FILES ツリーの節 (design 10a)', function() {
  test('節は 開いている図 / 保存先 / 読むだけ / GIT の 4 つ', function() {
    expect(FT.sections().map(function(s) { return s.id; }))
      .toEqual(['open', 'target', 'readonly', 'git']);
  });

  test('保存先を広く見せるため、読むだけ と GIT は既定で畳む', function() {
    expect(FT.defaultOpen('open')).toBe(true);
    expect(FT.defaultOpen('target')).toBe(true);
    expect(FT.defaultOpen('readonly')).toBe(false);
    expect(FT.defaultOpen('git')).toBe(false);
  });

  test('畳んだままでも件数が読める (比較中 N / main · M 2 ↑1)', function() {
    expect(FT.readonlyCountLabel(1)).toBe('比較中 1');
    expect(FT.readonlyCountLabel(0)).toBe('');
    expect(FT.gitCountLabel({ branch: 'main', modified: 2, ahead: 1 })).toBe('main · M 2 ↑1');
    expect(FT.gitCountLabel({ branch: 'main', modified: 0, ahead: 0 })).toBe('main');
    // Git リポジトリでなければ何も言わない (10c で中身が入る)。
    expect(FT.gitCountLabel(null)).toBe('');
  });
});

describe('保存先は部品ごとのフォルダ (design 10a)', function() {
  test('ファイル名から図種を読む', function() {
    expect(FT.kindOf('spi_init_sequence')).toBe('sequence');
    expect(FT.kindOf('spi_state.puml')).toBe('state');
    expect(FT.kindOf('driver_common_class')).toBe('class');
    expect(FT.kindOf('diagram1')).toBe('');
  });

  test('図種の語を落とした先頭の語が部品 (spi_init_sequence も spi_state も SPI)', function() {
    expect(FT.partOf('spi_init_sequence')).toBe('spi');
    expect(FT.partOf('spi_state')).toBe('spi');
    expect(FT.partOf('can_init_sequence')).toBe('can');
    expect(FT.partLabel('spi')).toBe('SPI');
  });

  test('部品ごとにまとまり、6 図種のうち何枚あるかが出る', function() {
    var g = FT.groups(FOLDER);
    expect(g.map(function(x) { return x.part; })).toEqual(['can', 'driver', 'spi']);
    var spi = g.filter(function(x) { return x.part === 'spi'; })[0];
    expect(spi.countLabel).toBe('SPI 4 / 6');
    expect(spi.files.length).toBe(4);
  });

  test('同じ図種が 2 枚あっても「揃い具合」は二重に数えない', function() {
    var g = FT.groups([
      { name: 'spi_init_sequence', kind: 'sequence' },
      { name: 'spi_reset_sequence', kind: 'sequence' },
    ]);
    expect(g[0].countLabel).toBe('SPI 1 / 6');
    expect(g[0].files.length).toBe(2);
  });

  test('展開すると未作成の図種が名指しされる (押せばその場で作れる形)', function() {
    var spi = FT.groups(FOLDER).filter(function(x) { return x.part === 'spi'; })[0];
    expect(spi.missing).toEqual(['usecase', 'activity']);
    expect(spi.missingLabel).toBe('未作成 2 図種（UC・ACT）');
  });

  test('6 図種が揃っている部品は未作成を出さない', function() {
    var all = FT.KINDS.map(function(k) { return { name: 'spi_' + k, kind: k }; });
    var g = FT.groups(all)[0];
    expect(g.countLabel).toBe('SPI 6 / 6');
    expect(g.missingLabel).toBe('');
  });
});

describe('絞り込みはファイル名と部品名のどちらでも引ける', function() {
  test('ファイル名の一部で引く', function() {
    expect(FT.filter(FOLDER, 'state').map(function(e) { return e.name; }))
      .toEqual(['spi_state', 'can_state']);
  });

  test('部品名で引く (大小は問わない)', function() {
    expect(FT.filter(FOLDER, 'SPI').length).toBe(4);
  });

  test('図の中の部品名でも引く', function() {
    var rows = [{ name: 'diagram1', kind: 'sequence', parts: ['Spi_Driver', 'Hal'] }];
    expect(FT.filter(rows, 'spi_driver').length).toBe(1);
    expect(FT.filter(rows, 'gpio').length).toBe(0);
  });

  test('空の絞り込みは全部を返す (打つ前の状態を隠さない)', function() {
    expect(FT.filter(FOLDER, '').length).toBe(FOLDER.length);
    expect(FT.filter(FOLDER, '   ').length).toBe(FOLDER.length);
  });
});

describe('下端に出していた枚数の 1 行をパネル内に移す', function() {
  test('「12 図 · 未反映 1 · 控え 1」の 1 行にまとまる', function() {
    expect(FT.summaryLine({ total: 12, unapplied: 1, draft: 1 })).toBe('12 図 · 未反映 1 · 控え 1');
  });

  test('0 件のものは言わない (下端と同じく、場所を取らせない)', function() {
    expect(FT.summaryLine({ total: 12, unapplied: 0, draft: 0 })).toBe('12 図');
  });
});
