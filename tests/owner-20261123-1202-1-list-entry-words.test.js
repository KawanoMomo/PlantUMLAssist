'use strict';
// TICKET-owner-20261123-1202-1: 保存先の一覧を開く 3 つの入口 (FILES の保存先の右クリック・Import ▾・Ctrl+K) が
// 「保存先の一覧を開く」「保存フォルダの図を開く（一覧）」「FILES: 保存先を開く / Files: save folder」と 3 つの名前で出て、
// 右クリックで覚えた語「保存先の一覧」を Ctrl+K に打つと 0 件だった。3 つを右クリックの語に揃え、Ctrl+K はその語で引ける
// (前の語でも引ける)。実マウスの確かめは tests/scenarios/owner-20261123-1202-1.spec.js。
var fs = require('fs');
var path = require('path');

var W = (typeof window !== 'undefined' && window) || global.window;
var FM = W.MA.fileMenu;
var CP = W.MA.commandPalette;
var ROOT = path.join(__dirname, '..');
var HTML = fs.readFileSync(path.join(ROOT, 'plantuml-assist.html'), 'utf8');
var APP = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');

var WORD = '保存先の一覧を開く';

// app.js の commands() の 1 行 1 コマンドの行を、画面と同じ値の候補として読む (run は呼ばない)。
function paletteCommands(src) {
  var s = src.indexOf('function commands() {');
  var e = src.indexOf('\n  }\n', s);
  var out = [];
  src.slice(s, e).split('\n').forEach(function(line) {
    if (!/^\s*\{ id: '[^']+', title: '/.test(line)) return;
    try { out.push(new Function('return (' + line.trim().replace(/,\s*$/, '') + ');')()); } catch (err) { /* 1 行で閉じない行は読まない */ }
  });
  return out;
}

function commandIds(items) {
  // buildItems は id に分類を前置きする (command:tab-folder)。
  return items.filter(function(x) { return (x.group || 'command') === 'command'; }).map(function(x) { return x.id.replace(/^command:/, ''); });
}

var CMDS = paletteCommands(APP);
var ITEMS = CP.buildItems(CMDS, '');

describe('保存先の一覧を開く 3 つの入口は同じ語 (TICKET-owner-20261123-1202-1)', function() {
  test('app.js の Ctrl+K のコマンドを 20 行以上読める (読み方が変わっても黙って 0 件にならない)', function() {
    expect(CMDS.length).toBeGreaterThanOrEqual(20);
  });
  test('FILES の保存先の右クリック', function() {
    var it = FM.folderItems({ kind: 'target' }).filter(function(x) { return x.id === 'open-list'; })[0];
    expect(it.label).toBe(WORD);
  });
  test('Import ▾', function() {
    expect(HTML).toContain('<button id="imp-folder">' + WORD + '</button>');
    expect(HTML).not.toContain('保存フォルダの図を開く（一覧）');
  });
  test('Ctrl+K の行の題は同じ語で、英語の併記・「FILES:」の前置きは無い', function() {
    var row = CMDS.filter(function(x) { return x.id === 'tab-folder'; })[0];
    expect(row.title).toBe(WORD);
  });
});

describe('Ctrl+K は入口の語で引ける (前の語でも)', function() {
  test('「保存先の一覧」で返るコマンドは 1 行で、その行', function() {
    expect(commandIds(CP.filter(ITEMS, '保存先の一覧'))).toEqual(['tab-folder']);
  });
  test('「保存先の一覧を開く」でも同じ 1 行', function() {
    expect(commandIds(CP.filter(ITEMS, WORD))).toEqual(['tab-folder']);
  });
  ['一覧', '保存フォルダの図', '保存先を開く', 'いちらん', 'Files: save folder'].forEach(function(q) {
    test('「' + q + '」で先頭に出る', function() {
      expect(CP.filter(ITEMS, q)[0].id).toBe('command:tab-folder');
    });
  });
});

describe('突き合わせが変異で落ちる', function() {
  test('題が前の語なら「保存先の一覧」で 0 件 (直す前の画面)', function() {
    var old = CMDS.map(function(x) {
      return x.id === 'tab-folder'
        ? { id: x.id, title: 'FILES: 保存先を開く / Files: save folder', hint: 'Files', keywords: ['folder', 'files', 'tree', 'list', 'いちらん', 'ふぉるだ', 'ほぞんさき'] }
        : x;
    });
    expect(commandIds(CP.filter(CP.buildItems(old, ''), '保存先の一覧'))).toEqual([]);
  });
  test('1 行で閉じない行は読まず、閉じる行は読む', function() {
    var src = "  function commands() {\n    var list = [\n      { id: 'a', title: 'A', run: function() { x(); } },\n      { id: 'b', title: 'B',\n        run: 1 },\n    ];\n  }\n";
    expect(paletteCommands(src).map(function(x) { return x.id; })).toEqual(['a']);
  });
});
