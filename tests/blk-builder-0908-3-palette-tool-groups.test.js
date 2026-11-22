'use strict';
// BLK-builder-20260908-0908-3 (design 7b): タブ列を畳むと機能の存在に気付く手掛かりが
// Ctrl+K だけになる。道具を 1 つの「コマンド」見出しに積むのをやめ、ツールメニューと
// 同じ 6 分類で並べて Tab で絞り込めることを確かめる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/tool-menu.js')]; } catch (e) {}
require('../src/core/tool-menu.js');
try { delete require.cache[require.resolve('../src/core/command-palette.js')]; } catch (e) {}
require('../src/core/command-palette.js');
var CP = global.window.MA.commandPalette;
var TM = global.window.MA.toolMenu;

function noop() {}

// 道具のコマンド (button 付き) と、道具でないコマンド (button 無し) を混ぜる。
var COMMANDS = [
  // TICKET-owner-20261115-1841-prune: 「確かめる」分類 (突合ボードほか) は外した。書き換えるの代表は ⇄ 一括置換。
  { id: 'tab-rename', title: '部品名の一括置換 / Bulk rename', hint: 'Tabs', keywords: ['rename', 'ちかん'], button: 'btn-tab-rename', run: noop },
  // 変更サマリ・引き継ぎ (渡す) は TICKET-owner-20261115-1828-prune で、
  // 「レビュー」分類 (± 差分ほか) は TICKET-owner-20261115-2141-prune で外した。書き換えるの 2 つ目は ✎ 行編集。
  { id: 'tab-lines', title: '行編集を開く / Line edit', hint: 'Tabs', button: 'btn-tab-lines', run: noop },
  // 「図をつくる」分類 (⧉ 既存の図や雛形から新しい図を起こす) は TICKET-owner-20261116-0321-prune で外した。
  { id: 'tab-apply', title: '複数クラスに一括適用 / Bulk apply', hint: 'Tabs', button: 'btn-tab-apply', run: noop },
  { id: 'save', title: 'ファイルを保存 / Save', hint: 'File', run: noop },
  // タブ列に残るもの (＋ / 一覧) はツールメニューに載っていないので分類しない。
  { id: 'tab-folder', title: '保存フォルダの図を一覧 / Folder', hint: 'Tabs', button: 'btn-tab-folder', run: noop },
];

function itemsOf() { return CP.buildItems(COMMANDS, ''); }
function byId(items, id) {
  return items.filter(function(it) { return it.id.indexOf(id) >= 0; })[0] || null;
}

describe('道具のコマンドは 6 分類に入る', () => {
  test('分類はツールメニューと同じ key になる', () => {
    var items = itemsOf();
    expect(byId(items, 'tab-rename').group).toBe('edit');
    expect(byId(items, 'tab-lines').group).toBe('edit');
    expect(byId(items, 'tab-apply').group).toBe('edit');
  });

  test('ツールメニューに載っていないコマンドは従来どおり「コマンド」', () => {
    var items = itemsOf();
    expect(byId(items, 'command:save').group).toBe('command');
    expect(byId(items, 'tab-folder').group).toBe('command');
  });

  test('行のチップは分類名になる', () => {
    expect(byId(itemsOf(), 'tab-rename').badge).toBe('書き換える');
    expect(byId(itemsOf(), 'tab-apply').badge).toBe('書き換える');
    expect(byId(itemsOf(), 'command:save').badge).toBe('コマンド');
  });

  test('題はツールメニューと同じ言い換えになる (メニューで覚えた語で引ける)', () => {
    expect(byId(itemsOf(), 'tab-rename').title).toBe('部品名を一括置換する');
    expect(byId(itemsOf(), 'tab-rename').title).toBe(TM.labelOf('btn-tab-rename'));
  });

  test('右端には道具の短い呼び名が残る (どの道具かが消えない)', () => {
    expect(byId(itemsOf(), 'tab-lines').hint).toBe('行編集');
  });

  test('元の題でもメニューの言い換えでも引ける', () => {
    var items = itemsOf();
    expect(CP.filter(items, 'Bulk rename').map(function(i) { return i.id; }))
      .toContain('edit:tab-rename');
    expect(CP.filter(items, '一括置換').map(function(i) { return i.id; }))
      .toContain('edit:tab-rename');
  });
});

describe('見出しと Tab の絞り込み', () => {
  test('見出しの並びは 図に足す → 移動 → 選択中 → 6 分類 → コマンド', () => {
    var groups = CP.groupsOf(itemsOf());
    expect(groups).toEqual(['edit', 'command']);
  });

  test('6 分類の見出しに日本語の名前が付く', () => {
    expect(CP.groupLabel('check')).toBe('確かめる / Check');
    expect(CP.groupLabel('review')).toBe('レビュー / Review');
  });

  test('Tab は 6 分類も巡回先にする', () => {
    var present = CP.groupsOf(itemsOf());
    expect(CP.cycleGroup(null, present, 1)).toBe('edit');
    expect(CP.cycleGroup('edit', present, 1)).toBe('command');
    expect(CP.cycleGroup('command', present, 1)).toBe(null);
  });

  test('分類で絞り込むとその分類の道具だけになる', () => {
    var only = CP.filterByGroup(itemsOf(), 'edit');
    expect(only.map(function(i) { return i.id; })).toEqual(['edit:tab-rename', 'edit:tab-lines', 'edit:tab-apply']);
  });
});

describe('toolShortName', () => {
  test('英語併記と「を開く」を落とす', () => {
    expect(CP.toolShortName('名前突合を開く / Name audit')).toBe('名前突合');
    expect(CP.toolShortName('セット複製 / Clone a set')).toBe('セット複製');
  });

  test('空でも落ちない', () => {
    expect(CP.toolShortName(null)).toBe('');
  });
});

describe('ツールメニューの道具はすべてパレットから引ける (7b の前提)', () => {
  // メニューに載っているのにコマンドが無い道具があると、タブ列を畳んだあと
  // その道具へ行く経路が 1 本も無くなる。
  var appJs = require('fs').readFileSync(require('path').join(__dirname, '../src/app.js'), 'utf-8');

  // ツール ▾ の案内行 (Ctrl+K に写さず、別名のコマンドが経路を持つ行)。
  // 唯一の案内行だった「部品名で図をまたいで辿る」は TICKET-owner-20261115-2140-prune で外した。
  var GUIDE_ROWS = {};

  test('menuIds の全部が app.js のコマンドに button として現れる', () => {
    var missing = TM.menuIds().filter(function(id) {
      if (GUIDE_ROWS[id]) return appJs.indexOf(GUIDE_ROWS[id]) < 0;
      return appJs.indexOf("button: '" + id + "'") < 0;
    });
    expect(missing).toEqual([]);
  });
});

describe('名指しされた道具は見出し順より前に出る', () => {
  // 見出しが 9 つに増えると、たまたま同じ語を含むだけの候補が前の見出しから
  // 名指しの候補を抜く。「保存」で「前回保存からの差分」が 1 位になった
  // (その行は TICKET-owner-20261115-2141-prune で外したので、同じ形を 一括適用 で確かめる)。
  var CMDS = [
    { id: 'save', title: 'ファイルを保存 / Save', keywords: ['保存', 'save'], run: noop },
    { id: 'tab-apply', title: '保存した図に一括適用 / Bulk apply', button: 'btn-tab-apply', run: noop },
    { id: 'tab-folder', title: '保存フォルダの図を一覧 / Folder', run: noop },
  ];

  test('完全一致の道具が 1 位になる', () => {
    var r = CP.filter(CP.buildItems(CMDS, ''), '保存');
    expect(r[0].id).toBe('command:save');
  });

  test('完全一致が無ければ従来どおり見出し順', () => {
    var r = CP.filter(CP.buildItems(CMDS, ''), '適用');
    expect(r[0].id).toBe('edit:tab-apply');
  });

  test('図の中身 (足す / 移動) は見出し順のまま', () => {
    var items = CP.buildItems(
      [{ id: 'u', group: 'add', title: 'User を足す', run: noop }].concat(CMDS),
      '@startuml\nactor User\n@enduml');
    var groups = [];
    CP.filter(items, 'user').forEach(function(i) {
      if (groups[groups.length - 1] !== i.group) groups.push(i.group);
    });
    expect(groups).toEqual(['add', 'jump']);
  });
});

describe('右端の呼び名', () => {
  test('言い換えと同じ文字なら出さない (同じ語が 2 度並ばない)', () => {
    var items = CP.buildItems([
      { id: 'tab-lines', title: '行を書き換える / Line edit', button: 'btn-tab-lines', run: noop },
    ], '');
    expect(items[0].title).toBe('行を書き換える');
    expect(items[0].hint).toBe('');
  });
});
