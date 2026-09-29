'use strict';
// BLK-builder-20260924-1831-2 (design 10b): ファイルの右クリック「別のフォルダへ移動…」は、
// 絶対パスを打たせる前に、ツリーに見えている行き先を同じメニューの中に並べる。

var W = (typeof window !== 'undefined' && window) || global.window;
var FM = W.MA.fileMenu;
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');

function ids(items) {
  return items.map(function(it) { return it.sep ? '-' : it.id; });
}

describe('移動の行き先 (moveTargets)', function() {
  var PARTS = [{ part: 'spi', label: 'SPI' }, { part: 'timer', label: 'TIMER' }, { part: 'gpio', label: 'GPIO' }];
  var DIRS = [{ path: 'C:/work/senior', name: 'senior' }, { path: 'C:/work/release_v1.2', name: 'release_v1.2' }];

  test('部品のフォルダ (今いる部品以外) → 隣の保存フォルダ → パスを入力…', function() {
    var items = FM.moveTargets('spi_class', PARTS, DIRS);
    expect(ids(items)).toEqual(['move-part', 'move-part', '-', 'move-dir', 'move-dir', '-', 'move-path']);
    expect(items[0].label).toBe('TIMER');
    expect(items[0].to).toBe('timer_class');
    expect(items[1].label).toBe('GPIO');
    expect(items[3].label).toBe('senior');
    expect(items[3].dir).toBe('C:/work/senior');
    expect(items[6].label).toBe('パスを入力…');
  });
  test('部品の行はドラッグと同じ名前の付け替え (title で新しい名前を言う)', function() {
    var items = FM.moveTargets('spi_init_sequence', PARTS, []);
    var timer = items.filter(function(it) { return it.part === 'timer'; })[0];
    expect(timer.to).toBe(FM.renameForPart('spi_init_sequence', 'timer'));
    expect(timer.title).toContain('timer_init_sequence');
  });
  test('行き先が 1 つも無ければ「パスを入力…」だけ', function() {
    expect(ids(FM.moveTargets('spi_class', [{ part: 'spi' }], []))).toEqual(['move-path']);
    expect(ids(FM.moveTargets('spi_class', null, null))).toEqual(['move-path']);
  });
  test('部品が無くフォルダだけなら区切りは 1 つ', function() {
    expect(ids(FM.moveTargets('spi_class', [], DIRS))).toEqual(['move-dir', 'move-dir', '-', 'move-path']);
  });
  test('同じ部品・同じフォルダは 2 度出さない。名前の無いフォルダはパスの末尾で呼ぶ', function() {
    var items = FM.moveTargets('spi_class', [{ part: 'adc' }, { part: 'ADC' }], [{ path: 'D:\\x\\peer' }, { path: 'D:\\x\\peer' }]);
    expect(ids(items)).toEqual(['move-part', '-', 'move-dir', '-', 'move-path']);
    expect(items[0].label).toBe('ADC');
    expect(items[2].label).toBe('peer');
  });
  test('↑↓ は区切りを飛ばして行き先の間を動く', function() {
    var items = FM.moveTargets('spi_class', PARTS, DIRS);
    expect(FM.nextIndex(items, -1, 1)).toBe(0);
    expect(FM.nextIndex(items, 1, 1)).toBe(3);
    expect(FM.nextIndex(items, 4, 1)).toBe(6);
  });
});

describe('メニューへの組み込み (src/ui/file-menu.js)', function() {
  var ui = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'file-menu.js'), 'utf-8');
  test('「別のフォルダへ移動…」はメニューを閉じずに行き先の一覧へ替える', function() {
    expect(/it\.id === 'move'[\s\S]{0,200}openMenu\(\{ type: 'move'/.test(ui)).toBe(true);
    expect(ui).toContain("ctx.type === 'move'");
  });
  test('行き先は部品のフォルダの見出しと、読むだけの節のフォルダの行から拾う', function() {
    expect(ui).toContain(".files-part-head[data-part]");
    expect(ui).toContain(".files-ro-folder[data-ro-dir]");
  });
  test('部品はドラッグと同じ道、フォルダは move、パスを入力…は今の入力窓', function() {
    expect(/'move-part'\) return renameToPart/.test(ui)).toBe(true);
    expect(/'move-dir'\) return moveToDir/.test(ui)).toBe(true);
    expect(/'move-path'\) return moveFile/.test(ui)).toBe(true);
  });
});
