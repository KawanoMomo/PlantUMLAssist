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

  // 読むだけはフォルダの数だけ (右の枠に出している相手の札は TICKET-owner-20261115-2141-prune で外した)。
  test('畳んだままでも件数が読める (N / main · M 2 ↑1)', function() {
    expect(FT.readonlyCountLabel(2)).toBe('2');
    expect(FT.readonlyCountLabel(0)).toBe('');
    expect(FT.gitCountLabel({ branch: 'main', modified: 2, ahead: 1 })).toBe('main · M 2 ↑1');
    expect(FT.gitCountLabel({ branch: 'main', modified: 0, ahead: 0 })).toBe('main');
    // Git リポジトリでなければ何も言わない (10c で中身が入る)。
    expect(FT.gitCountLabel(null)).toBe('');
  });
});

// 部品ごとのフォルダ (ファイル名から部品名を読んで束ねる・`SPI 4 / 6`・未作成の図種) は
// TICKET-owner-20261116-0321-prune で外した。保存先は実在のファイルを名前の順に並べる。
describe('保存先は実在のファイルを名前の順に並べる', function() {
  test('ファイル名から図種を読む (行頭の線画のため)', function() {
    expect(FT.kindOf('spi_init_sequence')).toBe('sequence');
    expect(FT.kindOf('spi_state.puml')).toBe('state');
    expect(FT.kindOf('driver_common_class')).toBe('class');
    expect(FT.kindOf('diagram1')).toBe('');
  });

  test('名前の順に並び、本文の図種があればそれを、無ければ名前の図種を持つ', function() {
    var rows = FT.targetRows([
      { name: 'spi_state', kind: '' },
      { name: 'TIMERドライバ', kind: 'class' },
      { name: 'can_init_sequence', kind: '' },
      'diagram2',
    ]);
    expect(rows.map(function(r) { return r.name; }))
      .toEqual(['TIMERドライバ', 'can_init_sequence', 'diagram2', 'spi_state']);
    expect(rows.map(function(r) { return r.kind; })).toEqual(['class', 'sequence', '', 'state']);
  });

  test('部品で束ねる・未作成を数える関数は無い', function() {
    ['partOf', 'splitPart', 'partLabel', 'groups', 'layout', 'partFor', 'partOpen', 'missingParts', 'freeName']
      .forEach(function(k) { expect(FT[k]).toBe(undefined); });
  });
});

describe('絞り込みはファイル名で引く', function() {
  test('ファイル名の一部で引く (大小は問わない)', function() {
    expect(FT.filter(FOLDER, 'state').map(function(e) { return e.name; }))
      .toEqual(['spi_state', 'can_state']);
    expect(FT.filter(FOLDER, 'SPI').length).toBe(4);
  });

  test('空の絞り込みは全部を返す (打つ前の状態を隠さない)', function() {
    expect(FT.filter(FOLDER, '').length).toBe(FOLDER.length);
    expect(FT.filter(FOLDER, '   ').length).toBe(FOLDER.length);
  });
});

describe('下端に出していた枚数の 1 行をパネル内に移す', function() {
  // 「控え N」は TICKET-owner-20261116-0241-prune で外した (一時控えの仕分けごと)。
  test('「12 図 · 未反映 1」の 1 行にまとまる', function() {
    expect(FT.summaryLine({ total: 12, unapplied: 1, draft: 1 })).toBe('12 図 · 未反映 1');
  });

  test('0 件のものは言わない (下端と同じく、場所を取らせない)', function() {
    expect(FT.summaryLine({ total: 12, unapplied: 0, draft: 0 })).toBe('12 図');
  });
});
