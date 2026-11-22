'use strict';
// TICKET-owner-20261122-2242-2: 今の図を SVG で書き出す同じ操作の入口が 3 通りの語で出ていた
// (Export ▾「SVGとして保存」・FILES の右クリック「SVG で書き出す」・Ctrl+K「SVG として保存 / Export SVG」)。
// Ctrl+K で「書き出」と打つと 0 行だった (書き出しの行は「保存」の語でしか引けなかった)。
// principles「同じ操作の入口 (メニュー・右クリック・Ctrl+K) は、どこにあっても同じ語で、Ctrl+K はその語で引ける」。

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf-8'); }

function buttonText(html, id) {
  var m = html.match(new RegExp('<button\\b[^>]*\\bid="' + id + '"[^>]*>([^<]*)</button>'));
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

// app.js の commands() の list をそのまま評価する (run は呼ばないので、中の自由変数は解決しなくてよい)。
function appCommands() {
  var src = read('src/app.js');
  var start = src.indexOf('function commands() {');
  var open = src.indexOf('var list = [', start);
  var close = src.indexOf('\n    ];', open);
  var body = src.slice(open + 'var list = '.length, close + '\n    ]'.length);
  return new Function('return ' + body + ';')();
}

function cmd(id) { return appCommands().filter(function(c) { return c.id === id; })[0]; }

function fileMenuLabel(id) {
  try { delete require.cache[require.resolve('../src/core/file-menu.js')]; } catch (e) {}
  require('../src/core/file-menu.js');
  return window.MA.fileMenu.fileItems({}).filter(function(it) { return it.id === id; })[0].label;
}

describe('書き出しの入口は 1 つの語 (TICKET-owner-20261122-2242-2)', function() {
  test('SVG: Export ▾ の #exp-svg・FILES の右クリック・Ctrl+K の export-svg が同じ語', function() {
    var html = read('plantuml-assist.html');
    var menu = buttonText(html, 'exp-svg');
    expect(menu).toBe('SVG で書き出す');
    expect(fileMenuLabel('export-svg')).toBe(menu);
    expect(cmd('export-svg').title).toBe(menu);
  });

  test('PNG・PNG(透過背景) も Export ▾ と Ctrl+K が同じ語で、「で書き出す」の形', function() {
    var html = read('plantuml-assist.html');
    expect(buttonText(html, 'exp-png')).toBe('PNG で書き出す');
    expect(buttonText(html, 'exp-png-transparent')).toBe('PNG（透過背景）で書き出す');
    expect(cmd('export-png').title).toBe(buttonText(html, 'exp-png'));
    expect(cmd('export-png-t').title).toBe(buttonText(html, 'exp-png-transparent'));
  });

  test('Ctrl+K の書き出しの行は英語を併記しない', function() {
    ['export-svg', 'export-png', 'export-png-t'].forEach(function(id) {
      expect(/Export|Copy|transparent/i.test(cmd(id).title)).toBe(false);
      expect(cmd(id).title.indexOf(' / ')).toBe(-1);
    });
  });

  test('Ctrl+K で「書き出」と打つと SVG・PNG・PNG(透過背景) の 3 行が当たる', function() {
    var CP = window.MA.commandPalette;
    var items = CP.buildItems(appCommands(), '');
    var ids = CP.filter(items, '書き出').map(function(it) { return it.id; });
    ['command:export-svg', 'command:export-png', 'command:export-png-t'].forEach(function(id) {
      expect(ids).toContain(id);
    });
  });

  test('Ctrl+K で「SVG」「PNG」と打っても書き出しの行が当たり、前の語「SVG として保存」でも引ける', function() {
    var CP = window.MA.commandPalette;
    var items = CP.buildItems(appCommands(), '');
    function ids(q) { return CP.filter(items, q).map(function(it) { return it.id; }); }
    expect(ids('SVG')).toContain('command:export-svg');
    expect(ids('PNG')).toContain('command:export-png');
    expect(ids('PNG')).toContain('command:export-png-t');
    expect(ids('SVG として保存')).toContain('command:export-svg');
    // 「保存」の 1 語は今までどおり「ファイルを保存」が 1 位。
    expect(CP.filter(items, '保存')[0].id).toBe('command:save');
  });

  test('ショートカット一覧の Ctrl+Shift+S も同じ語', function() {
    try { delete require.cache[require.resolve('../src/core/export-shortcuts.js')]; } catch (e) {}
    require('../src/core/export-shortcuts.js');
    var row = window.MA.exportShortcuts.shortcutRows().filter(function(r) { return r.id === 'exp-svg'; })[0];
    expect(row.desc).toBe('SVG で書き出す');
  });

  test('製品仕様書と README に古い語 (SVGとして保存 / PNGとして保存 / SVG 書き出し) が無い', function() {
    var OLD = /SVG ?として保存|PNG ?として保存|SVG 書き出し/;
    expect(OLD.test(read('docs/spec/product-spec.md'))).toBe(false);
    expect(OLD.test(read('README.md'))).toBe(false);
    // 照合の式そのものが古い語を拾えること (式が壊れて黙って緑にならない)。
    expect(OLD.test('Export ▾「SVGとして保存」')).toBe(true);
  });
});
