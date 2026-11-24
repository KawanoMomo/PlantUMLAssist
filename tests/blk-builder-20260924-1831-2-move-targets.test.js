'use strict';
// BLK-builder-20260924-1831-2 (design 10b): ファイルの右クリック「別のフォルダへ移動…」は、
// 絶対パスを打たせる前に、ツリーに見えている行き先を同じメニューの中に並べる。
// 部品のフォルダ (名前の頭を部品名に差し替えて移す) の行は TICKET-owner-20261116-0321-prune で外した。
// 行き先は実在のフォルダ (読むだけの節に並ぶ隣の保存フォルダ) と「パスを入力…」だけ。

var W = (typeof window !== 'undefined' && window) || global.window;
var FM = W.MA.fileMenu;
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');

function ids(items) {
  return items.map(function(it) { return it.sep ? '-' : it.id; });
}

describe('移動の行き先 (moveTargets)', function() {
  var DIRS = [{ path: 'C:/work/senior', name: 'senior' }, { path: 'C:/work/release_v1.2', name: 'release_v1.2' }];

  test('隣の保存フォルダ → パスを入力…。名前は変えない', function() {
    var items = FM.moveTargets('spi_class', DIRS);
    expect(ids(items)).toEqual(['move-dir', 'move-dir', '-', 'move-path']);
    expect(items[0].label).toBe('senior');
    expect(items[0].dir).toBe('C:/work/senior');
    expect(items[0].title).toContain('名前はそのまま');
    expect(items[3].label).toBe('パスを入力…');
    expect(items.some(function(it) { return it.id === 'move-part'; })).toBe(false);
  });
  test('行き先が 1 つも無ければ「パスを入力…」だけ', function() {
    expect(ids(FM.moveTargets('spi_class', []))).toEqual(['move-path']);
    expect(ids(FM.moveTargets('spi_class', null))).toEqual(['move-path']);
  });
  test('同じフォルダは 2 度出さない。名前の無いフォルダはパスの末尾で呼ぶ', function() {
    var items = FM.moveTargets('spi_class', [{ path: 'D:\\x\\peer' }, { path: 'D:\\x\\peer' }]);
    expect(ids(items)).toEqual(['move-dir', '-', 'move-path']);
    expect(items[0].label).toBe('peer');
  });
  test('↑↓ は区切りを飛ばして行き先の間を動く', function() {
    var items = FM.moveTargets('spi_class', DIRS);
    expect(FM.nextIndex(items, -1, 1)).toBe(0);
    expect(FM.nextIndex(items, 0, 1)).toBe(1);
    expect(FM.nextIndex(items, 1, 1)).toBe(3);
  });
  test('部品名で名前を付け替える関数は無い', function() {
    expect(FM.renameForPart).toBe(undefined);
    expect(FM.importNameForPart).toBe(undefined);
  });
});

describe('メニューへの組み込み (src/ui/file-menu.js)', function() {
  var ui = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'file-menu.js'), 'utf-8');
  test('「別のフォルダへ移動…」はメニューを閉じずに行き先の一覧へ替える', function() {
    expect(/it\.id === 'move'[\s\S]{0,200}openMenu\(\{ type: 'move'/.test(ui)).toBe(true);
    expect(ui).toContain("ctx.type === 'move'");
  });
  test('行き先は読むだけの節のフォルダの行から拾う (部品のフォルダの見出しは無い)', function() {
    expect(ui).not.toContain('.files-part-head');
    expect(ui).toContain(".files-ro-folder[data-ro-dir]");
  });
  test('フォルダは move、パスを入力…は今の入力窓', function() {
    expect(ui).not.toContain('renameToPart');
    expect(/'move-dir'\) return moveToDir/.test(ui)).toBe(true);
    expect(/'move-path'\) return moveFile/.test(ui)).toBe(true);
  });
});
