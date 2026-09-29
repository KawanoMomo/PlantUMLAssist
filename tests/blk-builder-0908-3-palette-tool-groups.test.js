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
  // BLK-owner-20260924-1332-prune: 🔍 名前突合の行は ▦ 突合ボードの行に畳んだので、確かめるの代表はボード。
  { id: 'tab-cross', title: '突合ボード / Cross-check board', hint: 'Tabs', keywords: ['名前突合', 'name audit'], button: 'btn-tab-cross', run: noop },
  { id: 'tab-board', title: '変更サマリを開く / Change board', hint: 'Tabs', button: 'btn-tab-board', run: noop },
  { id: 'tab-handoff', title: '引き継ぎパッケージを作る / Handoff package', hint: 'Tabs', button: 'btn-tab-handoff', run: noop },
  { id: 'tab-template', title: 'テンプレートから新しい図を作る / Template', hint: 'Tabs', button: 'btn-tab-template', run: noop },
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
    expect(byId(items, 'tab-cross').group).toBe('check');
    expect(byId(items, 'tab-board').group).toBe('review');
    expect(byId(items, 'tab-handoff').group).toBe('give');
    expect(byId(items, 'tab-template').group).toBe('make');
  });

  test('ツールメニューに載っていないコマンドは従来どおり「コマンド」', () => {
    var items = itemsOf();
    expect(byId(items, 'command:save').group).toBe('command');
    expect(byId(items, 'tab-folder').group).toBe('command');
  });

  test('行のチップは分類名になる', () => {
    expect(byId(itemsOf(), 'tab-cross').badge).toBe('確かめる');
    expect(byId(itemsOf(), 'tab-handoff').badge).toBe('渡す');
    expect(byId(itemsOf(), 'command:save').badge).toBe('コマンド');
  });

  test('題はツールメニューと同じ言い換えになる (メニューで覚えた語で引ける)', () => {
    expect(byId(itemsOf(), 'tab-cross').title).toBe('突合ボード (表記揺れ・宣言なし・メソッドも 1 画面で)');
    expect(byId(itemsOf(), 'tab-cross').title).toBe(TM.labelOf('btn-tab-cross'));
  });

  test('右端には道具の短い呼び名が残る (どの道具かが消えない)', () => {
    expect(byId(itemsOf(), 'tab-template').hint).toBe('テンプレートから新しい図');
    expect(byId(itemsOf(), 'tab-handoff').hint).toBe('引き継ぎパッケージ');
  });

  test('元の題でもメニューの言い換えでも引ける', () => {
    var items = itemsOf();
    expect(CP.filter(items, 'Cross-check').map(function(i) { return i.id; }))
      .toContain('check:tab-cross');
    // 旧 🔍 名前突合の語でもボードの行に当たる (Ctrl+K は 1 画面 1 行)。
    expect(CP.filter(items, 'Name audit').map(function(i) { return i.id; }))
      .toContain('check:tab-cross');
    expect(CP.filter(items, '表記揺れ').map(function(i) { return i.id; }))
      .toContain('check:tab-cross');
  });
});

describe('見出しと Tab の絞り込み', () => {
  test('見出しの並びは 図に足す → 移動 → 選択中 → 6 分類 → コマンド', () => {
    var groups = CP.groupsOf(itemsOf());
    expect(groups).toEqual(['make', 'check', 'review', 'give', 'command']);
  });

  test('6 分類の見出しに日本語の名前が付く', () => {
    expect(CP.groupLabel('check')).toBe('確かめる / Check');
    expect(CP.groupLabel('give')).toBe('渡す / Deliver');
  });

  test('Tab は 6 分類も巡回先にする', () => {
    var present = CP.groupsOf(itemsOf());
    expect(CP.cycleGroup(null, present, 1)).toBe('make');
    expect(CP.cycleGroup('make', present, 1)).toBe('check');
    expect(CP.cycleGroup('command', present, 1)).toBe(null);
  });

  test('分類で絞り込むとその分類の道具だけになる', () => {
    var only = CP.filterByGroup(itemsOf(), 'review');
    expect(only.map(function(i) { return i.id; })).toEqual(['review:tab-board']);
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

  // BLK-owner-20260924-1212-prune: ツール ▾ の案内行 (→ ▤ 影響を見る) は Ctrl+K に写さない。
  // その行き先は別名のコマンド 1 行が持つので、そのコマンドが在ることで経路があると数える。
  var GUIDE_ROWS = { 'btn-tab-xref': "{ id: 'name-search'" };

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
  // 名指しの候補を抜く。「保存」で「前回保存からの差分」が 1 位になった。
  var CMDS = [
    { id: 'save', title: 'ファイルを保存 / Save', keywords: ['保存', 'save'], run: noop },
    { id: 'tab-diff', title: '前回保存からの差分 / Diff', button: 'btn-tab-diff', run: noop },
    { id: 'tab-folder', title: '保存フォルダの図を一覧 / Folder', run: noop },
  ];

  test('完全一致の道具が 1 位になる', () => {
    var r = CP.filter(CP.buildItems(CMDS, ''), '保存');
    expect(r[0].id).toBe('command:save');
  });

  test('完全一致が無ければ従来どおり見出し順', () => {
    var r = CP.filter(CP.buildItems(CMDS, ''), '差分');
    expect(r[0].id).toBe('review:tab-diff');
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
      { id: 'tab-symptom', title: '症状から関連図を探す / Symptom search', button: 'btn-tab-symptom', run: noop },
    ], '');
    expect(items[0].title).toBe('症状から関連図を探す');
    expect(items[0].hint).toBe('');
  });
});
