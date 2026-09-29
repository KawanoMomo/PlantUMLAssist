'use strict';
// BLK-builder-20260924-1743-1 (design 10a): FILES ツリーの保存先の図の行は「クリックで開き、ダブルクリックでタブとして固定」。
// 以前はツリーの行が click しか持たず、ダブルクリックしても仮のタブ (斜体) のままだった。
// 固定の道は保存先の一覧の行 (#folder-panel .folder-item) のダブルクリックと同じ 1 本にする。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;

var html = fs.readFileSync(path.join(__dirname, '..', 'plantuml-assist.html'), 'utf8');
var start = html.indexOf('<div id="files-panel"');
var end = html.indexOf('<section class="files-sec" data-files-section="git">', start);
var frag = html.slice(start, end) + '</div>';

function load(W, f) {
  global.window = W;
  global.document = W.document;
  try { delete require.cache[require.resolve(f)]; } catch (e) {}
  require(f);
}

describe('FILES ツリーの保存先の行のダブルクリックはタブを固定する (design 10a)', function() {
  var W, clicks, dbl;
  function boot() {
    var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body>' + frag + '</body></html>');
    W = dom.window;
    W.MA = {};
    load(W, '../src/core/file-tree.js');
    W.MA.workspace = { list: function() { return []; }, getActiveId: function() { return null; } };
    var fp = W.document.getElementById('folder-panel');
    fp.className = 'open';
    fp.innerHTML = '<div class="folder-row"><button class="folder-item" data-file-name="spi_state" data-content-kind="state"></button></div>'
      + '<div class="folder-row"><button class="folder-item" data-file-name="diagram2"></button></div>';
    clicks = [];
    dbl = [];
    Array.prototype.forEach.call(fp.querySelectorAll('.folder-item'), function(it) {
      var n = it.getAttribute('data-file-name');
      it.addEventListener('click', function() { clicks.push(n); });
      it.addEventListener('dblclick', function() { dbl.push(n); });
    });
    load(W, '../src/ui/files-panel.js');
    W.MA.filesPanel.init();
    W.MA.filesPanel.renderParts();
  }
  function restore() { global.window = prevWindow; global.document = prevDocument; }
  function treeRow(n) { return W.document.querySelector('#files-parts .files-part-file[data-file-name="' + n + '"]'); }

  test('1 回押しは一覧の行の 1 回押し (仮のタブで開く) だけを渡す', function() {
    try {
      boot();
      treeRow('spi_state').dispatchEvent(new W.MouseEvent('click', { bubbles: true }));
      expect(clicks).toEqual(['spi_state']);
      expect(dbl).toEqual([]);
    } finally { restore(); }
  });

  test('部品のフォルダの中の行のダブルクリックは、一覧の行のダブルクリック (固定) を渡す', function() {
    try {
      boot();
      treeRow('spi_state').dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true }));
      expect(dbl).toEqual(['spi_state']);
    } finally { restore(); }
  });

  test('図種の読めない直下の行でも同じ', function() {
    try {
      boot();
      var row = treeRow('diagram2');
      expect(row.classList.contains('files-loose-file')).toBe(true);
      row.dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true }));
      expect(dbl).toEqual(['diagram2']);
    } finally { restore(); }
  });
});
