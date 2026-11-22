'use strict';
// BLK-human-20260923-1701 (design 10b): FILES ツリーのファイル・フォルダの右クリックに
// ファイル単位の操作を集め、キーボードとドラッグで動かせるようにする。

var W = (typeof window !== 'undefined' && window) || global.window;
var FM = W.MA.fileMenu;
var TM = W.MA.toolMenu;
var CP = W.MA.commandPalette;

function ids(items) {
  return items.map(function(it) { return it.sep ? '-' : it.id; });
}

describe('ファイルの右クリック (design 10b)', function() {
  test('10b のモックどおりの並びと区切り', function() {
    expect(ids(FM.fileItems({}))).toEqual([
      // 右に並べて開く・比較の 3 行は TICKET-owner-20261115-2141-prune で外した。
      'open', '-',
      'history', '-',
      // 一時控えにする は TICKET-owner-20261116-0241-prune で外した。
      'rename', 'copy', 'move', '-',
      'export-svg', 'reveal', '-',
      'delete',
    ]);
  });

  test('開く は Enter、名前を変更 は F2、削除 は Delete をメニューに添える', function() {
    var by = {};
    FM.fileItems({}).forEach(function(it) { if (it.id) by[it.id] = it; });
    expect(by.open.key).toBe('Enter');
    expect(by.rename.key).toBe('F2');
    expect(by['delete'].key).toBe('Delete');
  });

  test('比較の行 (読むだけ / 前回保存版 / 過去のコミット) と 右に並べて開く は無い', function() {
    var got = FM.fileItems({ git: true }).map(function(it) { return it.id; });
    ['open-side', 'cmp-readonly', 'cmp-saved', 'cmp-commit'].forEach(function(id) {
      expect(got.indexOf(id)).toBe(-1);
    });
  });

  test('一時控えの行は出さない (TICKET-owner-20261116-0241-prune)', function() {
    [{ draft: false }, { draft: true }].forEach(function(ctx) {
      var hit = FM.fileItems(ctx).filter(function(it) { return it.id === 'draft' || /一時控え/.test(it.label || ''); });
      expect(hit.length).toBe(0);
    });
  });

  test('呼び出し側が書き換えても次の呼び出しに漏れない', function() {
    FM.fileItems({})[0].label = 'X';
    expect(FM.fileItems({})[0].label).toBe('開く');
  });
});

describe('フォルダの右クリック (design 10b)', function() {
  test('保存先: 新しい図 / 6 図種 / 保存先にする (今の保存先なので押せない) / 読むだけにする', function() {
    var it = FM.folderItems({ kind: 'target' });
    // BLK-primary-20260925-0232-design: 別のフォルダを保存先に替える入口が 2 つの灰色の後に並ぶ。
    // 「6 図種をまとめて作る」は TICKET-owner-20261116-0321-prune で外した。
    // TICKET-roadmap-20261122-0855-3: 「新しい図」のすぐ下に「新しいフォルダ」(実際にフォルダを作る)。
    expect(ids(it)).toEqual(['new-doc', 'new-folder', '-', 'set-target', 'set-readonly', 'change-target', '-', 'open-list']);
    expect(it[3].disabled).toBe(true);
    // BLK-owner-20260924-1836-prune: 「読むだけにする」は覗く窓を開かない。保存先は書く場所なので押せない。
    expect(it[4].disabled).toBe(true);
    expect(it[4].title).toContain('読むだけ');
  });

  // 部品のフォルダ (名前で束ねた見出し) は TICKET-owner-20261116-0321-prune で外した。
  // 種類の無い呼び出しは保存先として扱う。
  test('種類を渡さなければ保存先のメニュー', function() {
    expect(ids(FM.folderItems({}))).toEqual(ids(FM.folderItems({ kind: 'target' })));
  });

  // BLK-builder-20260924-1749-3 (design 10a): 読むだけのフォルダは「並べて比較」が先頭で、
  // 編集できないので「新しい図 / 6 図種をまとめて作る」は出さない (前は it[4] が「読むだけにする」だった)。
  test('読むだけのフォルダ: 保存先にする / 読むだけにする (押せない)。区切りから始めない', function() {
    var it = FM.folderItems({ kind: 'readonly' });
    // 比較の行と覗く窓「このフォルダの図を調べる…」は TICKET-owner-20261115-2141-prune で外した。
    expect(ids(it)).toEqual(['set-target', 'set-readonly']);
    expect(it[1].disabled).toBe(true);
  });
});

describe('キーボード', function() {
  test('メニューの ↑↓ は区切りと押せない行を飛ばし、端で回り込む', function() {
    var items = FM.fileItems({ git: false });
    var first = FM.nextIndex(items, -1, 1);
    expect(items[first].id).toBe('open');
    // open の次は区切りを飛ばして history。
    expect(items[FM.nextIndex(items, first, 1)].id).toBe('history');
    // 押せない行は飛ばす (読むだけのフォルダの「読むだけにする」は押せない)。
    var ro = FM.folderItems({ kind: 'readonly' });
    var tgt = ro.map(function(i) { return i.id; }).indexOf('set-target');
    expect(ro[FM.nextIndex(ro, tgt, 1)].id).toBe('set-target');
    // 先頭から ↑ で末尾 (削除) へ回る。
    expect(items[FM.nextIndex(items, first, -1)].id).toBe('delete');
    expect(FM.nextIndex([], 0, 1)).toBe(-1);
  });

  test('ツリーの ↑↓ は端で止まる', function() {
    expect(FM.moveInTree(5, 0, 1)).toBe(1);
    expect(FM.moveInTree(5, 4, 1)).toBe(4);
    expect(FM.moveInTree(5, 0, -1)).toBe(0);
    expect(FM.moveInTree(5, -1, 1)).toBe(0);
    expect(FM.moveInTree(0, 0, 1)).toBe(-1);
  });

  test('↑↓ で移動、→ ← で開閉、Enter で開く、F2 で名前変更、Delete で削除', function() {
    expect(FM.keyAction('ArrowDown', 'file')).toBe('down');
    expect(FM.keyAction('ArrowUp', 'folder', true)).toBe('up');
    expect(FM.keyAction('ArrowRight', 'folder', false)).toBe('expand');
    expect(FM.keyAction('ArrowRight', 'folder', true)).toBe('down');
    expect(FM.keyAction('ArrowLeft', 'folder', true)).toBe('collapse');
    expect(FM.keyAction('ArrowLeft', 'folder', false)).toBe('parent');
    expect(FM.keyAction('ArrowLeft', 'file')).toBe('parent');
    expect(FM.keyAction('ArrowRight', 'file')).toBe('');
    expect(FM.keyAction('Enter', 'file')).toBe('open');
    expect(FM.keyAction('Enter', 'section', true)).toBe('toggle');
    expect(FM.keyAction('F2', 'file')).toBe('rename');
    expect(FM.keyAction('F2', 'folder')).toBe('');
    expect(FM.keyAction('Delete', 'file')).toBe('delete');
    expect(FM.keyAction('Delete', 'section')).toBe('');
    expect(FM.keyAction('ContextMenu', 'file')).toBe('menu');
    expect(FM.keyAction('a', 'file')).toBe('');
  });
});

describe('名前の組み立て', function() {
  test('名前の入力は拡張子を落とし、空と同じ名前は null', function() {
    expect(FM.cleanName(' spi_state.puml ', 'x')).toBe('spi_state');
    expect(FM.cleanName('', 'x')).toBe(null);
    expect(FM.cleanName(null, 'x')).toBe(null);
    expect(FM.cleanName('x', 'x')).toBe(null);
  });

  test('複製は _copy、埋まっていれば _copy2 …', function() {
    expect(FM.copyName('spi_state', ['spi_state'])).toBe('spi_state_copy');
    expect(FM.copyName('spi_state', ['spi_state', 'spi_state_copy'])).toBe('spi_state_copy2');
    expect(FM.copyName('spi_state', ['spi_state_copy', 'spi_state_copy2'])).toBe('spi_state_copy3');
  });

  test('外から落としたファイルは .puml / .plantuml / .uml / .txt だけ取り込む', function() {
    var got = FM.importables([{ name: 'a.puml' }, { name: 'b.PlantUML' }, { name: 'c.png' }, { name: '.puml' }, { name: 'd.txt' }]);
    expect(got.map(function(g) { return g.name; })).toEqual(['a', 'b', 'd']);
  });
});

describe('元の入口 (ツール ▾) は右クリックへの案内に落とす', function() {
  test('一時控え・この図の変遷 はツール ▾ のパネルに並ばない', function() {
    var all = [];
    TM.panelGroups().forEach(function(g) { g.items.forEach(function(it) { all.push(it.id); }); });
    expect(all.indexOf('btn-tab-draft')).toBe(-1);
    expect(all.indexOf('btn-tab-versions')).toBe(-1);
  });

  test('パネルの下端に「FILES のファイルを右クリック」の案内が出る', function() {
    var html = TM.buildMenuHtml({});
    expect(html.indexOf('tool-menu-files-note') >= 0).toBe(true);
    expect(html.indexOf('右クリック') >= 0).toBe(true);
  });

  test('ボタンの実体は畳んだまま残り、Ctrl+K / Ctrl+P からは「ファイル」の見出しで引ける', function() {
    // 一時控え (btn-tab-draft) は TICKET-owner-20261116-0241-prune で外した。
    expect(TM.isFoldable('btn-tab-versions')).toBe(true);
    expect(TM.labelOf('btn-tab-versions')).toBe('この図の履歴を見る'); // BLK-owner-20260924-1212-prune: 行名は画面の名前にそろえた
    var items = CP.buildItems([
      { id: 'tab-versions', title: 'この図の履歴を見る / History', button: 'btn-tab-versions', run: function() {} },
      { id: 'spi_state', group: 'file', badge: 'ファイル', title: 'spi_state', run: function() {} },
    ], '');
    var hist = items.filter(function(i) { return i.id === 'file:tab-versions'; })[0];
    expect(hist.group).toBe('file');
    expect(CP.groupsOf(items)).toContain('file');
    expect(CP.filterByGroup(items, 'file').length).toBe(2);
    expect(CP.groupLabel('file')).toBe('ファイル / Files');
  });
});

// BLK-builder-20260924-1915-4 の「部品のフォルダに落とした図を部品名に付け替えて取り込む」は
// TICKET-owner-20261116-0321-prune で外した。外から落とした図は保存先の直下へ元の名前で取り込む。
describe('外から落とした図の名前 (design 10b)', function() {
  test('元の名前のまま (部品名に付け替えない)', function() {
    expect(FM.importNameForPart).toBe(undefined);
    expect(FM.importables([{ name: 'gpt_state.puml' }]).map(function(g) { return g.name; })).toEqual(['gpt_state']);
  });
});
