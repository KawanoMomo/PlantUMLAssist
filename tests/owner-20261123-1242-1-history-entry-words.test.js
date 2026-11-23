'use strict';
// TICKET-owner-20261123-1242-1: 「この図の履歴」の窓を開く入口が、FILES のファイルの右クリックでは「この図の履歴を表示」、
// Ctrl+K では「この図の履歴を見る」と 2 つの名前で出て、右クリックの語「履歴を表示」を Ctrl+K に打つと 0 件だった。
// Ctrl+K の行を右クリックの語に揃え、前の語でも引ける。あわせて Ctrl+K の「行を書き換える」の行の右端に出ていた
// 前の名前「行編集」を出さない (「行編集」と打てば今どおり引ける)。
var fs = require('fs');
var path = require('path');

['../src/core/tool-menu.js', '../src/core/command-palette.js', '../src/core/file-menu.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var W = global.window;
var CP = W.MA.commandPalette;
var TM = W.MA.toolMenu;
var FM = W.MA.fileMenu;
var APP = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

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

var CMDS = paletteCommands(APP);
function rows(cmds, q) { return CP.filter(CP.buildItems(cmds, ''), q); }
function versionRows(got) { return got.filter(function(i) { return /:tab-versions$/.test(i.id); }); }
function rightClickWord() {
  return FM.fileItems({}).filter(function(x) { return x.id === 'history'; })[0].label;
}

describe('この図の履歴の入口は右クリックと Ctrl+K で同じ語 (TICKET-owner-20261123-1242-1)', function() {
  test('app.js の Ctrl+K のコマンドを 20 行以上読める', function() {
    expect(CMDS.length).toBeGreaterThanOrEqual(20);
  });
  test('右クリックの語は「この図の履歴を表示」', function() {
    expect(rightClickWord()).toBe('この図の履歴を表示');
  });
  test('Ctrl+K の行の題は右クリックの語と同じで、右端に別の呼び名が無い', function() {
    var v = versionRows(rows(CMDS, '履歴'));
    expect(v.length).toBe(1);
    expect(v[0].title).toBe(rightClickWord());
    expect(v[0].hint).toBe('');
  });
  ['この図の履歴を表示', '履歴を表示', 'この図の履歴を見る', '変遷'].forEach(function(q) {
    test('「' + q + '」でその行が 1 行、先頭に出る', function() {
      var got = rows(CMDS, q);
      expect(versionRows(got).length).toBe(1);
      expect(got[0].id).toBe('file:tab-versions');
    });
  });
});

describe('Ctrl+K の「行を書き換える」の行に前の名前「行編集」が並ばない', function() {
  test('行の題はツール ▾ の語、右端は空', function() {
    var r = rows(CMDS, '行を書き換える').filter(function(i) { return /:tab-lines$/.test(i.id); })[0];
    expect(r.title).toBe(TM.labelOf('tool-lines'));
    expect(r.hint).toBe('');
  });
  test('「行編集」と打てば今どおり引ける', function() {
    expect(/:tab-lines$/.test(rows(CMDS, '行編集')[0].id)).toBe(true);
  });
});

describe('突き合わせが変異で落ちる', function() {
  // Ctrl+K の履歴の行の題は tool-menu.js の言い換え (labelOf) から作る。言い換えを前の語に戻すと
  // 上の「題は右クリックの語と同じ」が赤になる。ここは行編集の側: 前の題なら右端に「行編集」が出る。
  test('前の題「行編集を開く / Line edit」なら右端に「行編集」が出る (直す前の画面)', function() {
    var old = CMDS.map(function(x) {
      return x.id === 'tab-lines' ? { id: x.id, title: '行編集を開く / Line edit', hint: 'Tabs', keywords: ['line', 'edit'], button: 'tool-lines' } : x;
    });
    var lines = rows(old, '行を書き換える').filter(function(i) { return /:tab-lines$/.test(i.id); })[0];
    expect(lines.hint).toBe('行編集');
  });
});
