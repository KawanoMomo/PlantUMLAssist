'use strict';
// BLK-builder-20260907-2237-2 / design 1a (リデザイン案 / Quiet Rail)。
//
// 1a の上部バーはファイル名・検索・状態表示・Export だけで、レンダリングモードを
// 選ぶ select は無い。モードを選ぶ場所は設定モーダルの「レンダリング」タブ。
// select 自体は描画・保存の唯一の窓口なので DOM からは消さず、上部バーの外
// (#toolbar-actions) へ退避する。
var fs = require('fs');
var path = require('path');

function src(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8'); }

var HTML = src('plantuml-assist.html');
var APP = src('src/app.js');

// #toolbar の開きから、次の兄弟 div (#toolbar-actions) の直前までを切り出す。
function toolbarHtml() {
  var start = HTML.indexOf('<div id="toolbar">');
  var end = HTML.indexOf('<div id="toolbar-actions"');
  return HTML.slice(start, end);
}

function toolbarActionsHtml() {
  var start = HTML.indexOf('<div id="toolbar-actions"');
  var end = HTML.indexOf('<!-- online モード時の外部送信警告バナー', start);
  return HTML.slice(start, end);
}

describe('design 1a: 上部バーに残すもの', function() {
  test('レンダリングモードの select は上部バーに出さない', function() {
    expect(toolbarHtml()).not.toContain('id="render-mode"');
  });

  test('select は消さず #toolbar-actions に退避する (描画・保存の窓口は 1 つのまま)', function() {
    expect(toolbarActionsHtml()).toContain('id="render-mode"');
    expect(HTML).toContain('<option value="local">');
    expect(HTML).toContain('<option value="online">');
  });

  test('上部バーにはファイル名・検索・状態表示・Export が残る', function() {
    var tb = toolbarHtml();
    expect(tb).toContain('id="top-file-name"');
    expect(tb).toContain('id="btn-command-palette"');
    expect(tb).toContain('id="top-render-status"');
    expect(tb).toContain('id="btn-export"');
  });

  test('状態表示は押せる (設定のレンダリングタブへの入口)', function() {
    var tb = toolbarHtml();
    expect(/<button id="top-render-status"[\s\S]{0,40}type="button"/.test(tb)).toBe(true);
    expect(APP).toContain("window.MA.openSettingsTab('render')");
  });

  test('設定モーダルはタブを指定して開ける', function() {
    expect(APP).toContain('window.MA.openSettingsTab = function(tabId)');
  });

  test('モード切替はコマンドパレットからも残る', function() {
    expect(APP).toContain("selectValue('render-mode', 'local')");
    expect(APP).toContain("selectValue('render-mode', 'online')");
  });
});
