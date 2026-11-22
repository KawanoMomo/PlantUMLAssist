'use strict';
// TICKET-owner-20261122-1240-1: 保存先のフォルダを選ぶ 1 つの窓を開く 4 つの入口 (FILES の右クリック・Import ▾・
// Ctrl+K・⚙ 設定) を、窓の見出しと同じ語「保存先のフォルダを選ぶ…」で出す。⚙ 設定の自動保存には保存先のパスを
// 打つ欄を置かず (打つ所は窓の中の 1 か所)、今の保存先の表示と窓を開くボタンだけにする。
// 実マウスの確かめは tests/scenarios/owner-20261122-1240-1.spec.js。
var fs = require('fs');
var path = require('path');

var W = (typeof window !== 'undefined' && window) || global.window;
var FM = W.MA.fileMenu;
var ROOT = path.join(__dirname, '..');
var HTML = fs.readFileSync(path.join(ROOT, 'plantuml-assist.html'), 'utf8');
var APP = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');

// 窓の見出し (openChangeTarget が置く文字)。
var TITLE = (APP.match(/h\.className = 'target-pick-title';\s*h\.textContent = '([^']+)';/) || [])[1];
var WORD = TITLE + '…';

function pane(id) {
  var s = HTML.indexOf('<div id="' + id + '"');
  var e = HTML.indexOf('</div><!-- /#' + id + ' -->', s);
  return HTML.slice(s, e);
}

describe('4 つの入口は窓の見出しと同じ語', function() {
  test('窓の見出しは「保存先のフォルダを選ぶ」', function() {
    expect(TITLE).toBe('保存先のフォルダを選ぶ');
  });
  test('FILES の右クリック', function() {
    var it = FM.folderItems({ kind: 'target' }).filter(function(x) { return x.id === 'change-target'; })[0];
    expect(it.label).toBe(WORD);
  });
  test('Import ▾', function() {
    expect(HTML).toContain('<button id="imp-target">' + WORD + '</button>');
  });
  test('⚙ 設定のボタン', function() {
    var m = HTML.match(/<button[^>]*id="cfg-file-dir-pick"[^>]*>([^<]*)<\/button>/);
    expect(!!m).toBe(true);
    expect(m[1]).toBe(WORD);
  });
  test('Ctrl+K は英語の併記なしで同じ語。前の語と英語は検索語に残る', function() {
    var line = APP.split('\n').filter(function(l) { return /id: 'change-target'/.test(l); })[0] || '';
    expect(line).toContain("title: '" + WORD + "'");
    expect(line).toContain("'別のフォルダを保存先にする'");
    expect(line).toContain("'保存先を変える'");
    expect(line).toContain("'change save folder'");
  });
});

describe('⚙ 設定の自動保存に保存先のパスを打つ欄は無い', function() {
  var p = pane('cfg-pane-autosave');
  test('自動保存のペインを切り出せる', function() {
    expect(p.length > 200).toBe(true);
    expect(p).toContain('cfg-backend-cards');
  });
  test('文字を打つ input が 0 (前の #cfg-file-dir も無い)', function() {
    expect((p.match(/<input\b[^>]*type="text"/g) || []).length).toBe(0);
    expect(p).not.toContain('id="cfg-file-dir"');
    expect(HTML).not.toContain('id="cfg-file-dir"');
  });
  test('今の保存先の表示と窓を開くボタンがある。見出しに英語の併記は無い', function() {
    expect(p).toContain('id="cfg-file-dir-cur"');
    expect(p).toContain('id="cfg-file-dir-pick"');
    expect(p).not.toContain('保存先 / Backend');
  });
  test('保存先のカードの見出しにも英語の併記は無い', function() {
    try { delete require.cache[require.resolve('../src/core/autosave-options.js')]; } catch (e) {}
    require('../src/core/autosave-options.js');
    var AO = global.window.MA.autosaveOptions;
    AO.backendCards('file').forEach(function(c) { expect(c.title.indexOf(' / ')).toBe(-1); });
  });
  test('「設定を保存」は打った値ではなく今の保存先を使う (窓で決めた保存先を前の値で戻さない)', function() {
    var s = APP.indexOf("getElementById('cfg-ok').addEventListener");
    var body = APP.slice(s, APP.indexOf("getElementById('cfg-clear-all')", s));
    expect(body).toContain('_cfgCurrentFileDir()');
    expect(body).not.toContain("getElementById('cfg-file-dir')");
  });
  test('窓で保存先を決めると ⚙ の表示も替わる (changeSaveTarget が showCfgFileDir を呼ぶ)', function() {
    var s = APP.indexOf('function changeSaveTarget(');
    var body = APP.slice(s, APP.indexOf('\n}\n', s));
    expect(body).toContain('showCfgFileDir()');
  });
});
