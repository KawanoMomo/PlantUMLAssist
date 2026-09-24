'use strict';
// BLK-builder-20260924-1917-1 (design 10b「名前を変更 F2」): 開いていない保存先の図は、ツリーのその行の名前が
// その場で入力欄になる。以前は window.prompt (画面の上端の入力窓) で、どの行を直しているか読めなかった。

var fs = require('fs');
var path = require('path');
var W = (typeof window !== 'undefined' && window) || global.window;
var FM = W.MA.fileMenu;
var WSm = W.MA.workspace;

var ui = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'ui', 'file-menu.js'), 'utf8');
var html = fs.readFileSync(path.resolve(__dirname, '..', 'plantuml-assist.html'), 'utf8');

describe('決まりに合わない名前の理由 (fileMenu.renameProblem)', function() {
  test('合う名前は空文字', function() {
    expect(FM.renameProblem('spi_state_v2', WSm.isValidName, WSm.nameRuleText())).toBe('');
    expect(FM.renameProblem('SPI 状態 (改)', WSm.isValidName, WSm.nameRuleText())).toBe('');
  });
  test('合わない名前は名前の決まりを 1 行で返す (判定は workspace.isValidName)', function() {
    expect(FM.renameProblem('spi/state', WSm.isValidName, WSm.nameRuleText())).toBe(WSm.nameRuleText());
    expect(FM.renameProblem('spi_state.', WSm.isValidName, WSm.nameRuleText())).toBe(WSm.nameRuleText());
  });
  test('判定が無ければ止めない', function() {
    expect(FM.renameProblem('a/b', null, '')).toBe('');
    expect(FM.renameProblem('', WSm.isValidName, 'x')).toBe('');
  });
});

describe('ツリーの行の上で名前を直す (src/ui/file-menu.js)', function() {
  var body = ui.slice(ui.indexOf('function renameFile'), ui.indexOf('function copyFile'));
  test('開いていない図で行が見えていれば、入力窓ではなく行の上の入力欄', function() {
    var i = body.indexOf('var row = treeFileRow(name);');
    expect(i).toBeGreaterThan(0);
    expect(body.indexOf('return renameInline(row, name)')).toBeGreaterThan(i);
    // 入力窓は行が見えないとき (旧 📂 一覧など) だけの退避路
    expect(body.indexOf('window.prompt(')).toBeGreaterThan(body.indexOf('return renameInline(row, name)'));
  });
  test('Enter で確定・Esc で取り消し・外を押すと確定、理由を出している間は開いたまま', function() {
    var r = ui.slice(ui.indexOf('function renameInline'), ui.indexOf('function copyFile'));
    expect(r).toContain("ev.key === 'Enter'");
    expect(r).toContain("ev.key === 'Escape'");
    expect(r).toContain("addEventListener('blur'");
    expect(r).toContain('note.hidden) commit()');
    expect(r).toContain('FM().renameProblem(');
  });
  test('開いている図は今までどおりタブの上で直す道', function() {
    expect(body).toContain("tab.dispatchEvent(new MouseEvent('dblclick'");
  });
  test('入力欄と理由の見た目がある', function() {
    expect(html).toContain('#files-panel .files-rename-input {');
    expect(html).toContain('#files-panel .files-rename-note {');
  });
});
