'use strict';
// BLK-builder-20260924-1923-4 (design 10a「一番上のフォルダが保存先で、その下は部品ごとのフォルダ」):
// 保存先のフォルダの行の頭に ▾ / ▸ を置き、その下の部品のフォルダ・直下の図をまとめて畳む / 開く。
// 開閉は次回も覚える。部品のフォルダも図も無ければ印を出さない。
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
function restore() { global.window = prevWindow; global.document = prevDocument; }

function boot(stored, items) {
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body>' + frag + '</body></html>', { url: 'http://localhost/' });
  var W = dom.window;
  if (stored != null) W.localStorage.setItem('pua.files.targetParts', stored);
  W.MA = {};
  load(W, '../src/core/file-tree.js');
  W.MA.workspace = { list: function() { return []; }, getActiveId: function() { return null; } };
  var fp = W.document.getElementById('folder-panel');
  fp.className = 'open';
  fp.innerHTML = (items || []).map(function(it) {
    return '<div class="folder-item" data-file-name="' + it[0] + '" data-content-kind="' + it[1] + '"></div>';
  }).join('');
  load(W, '../src/ui/files-panel.js');
  W.MA.filesPanel.init();
  W.MA.filesPanel.renderParts();
  return W;
}

var SPI = [['spi_state', 'state'], ['spi_init_sequence', 'sequence']];

describe('保存先のフォルダの行の ▾ / ▸ (design 10a)', function() {
  test('印と保存先の名前は同じ行に並び、既定は開いている', function() {
    var W = boot(null, SPI);
    try {
      var caret = W.document.getElementById('files-target-caret');
      var target = W.document.getElementById('top-save-target');
      expect(caret.parentNode).toBe(target.parentNode);
      expect(caret.getAttribute('aria-expanded')).toBe('true');
      expect(caret.textContent).toBe('▾');
      expect(W.document.getElementById('files-parts').hidden).toBe(false);
      expect(caret.parentNode.getAttribute('data-empty')).toBe('0');
    } finally { restore(); }
  });

  test('印を押すと部品のフォルダをまとめて畳み、覚える。もう一度で開く', function() {
    var W = boot(null, SPI);
    try {
      var caret = W.document.getElementById('files-target-caret');
      caret.click();
      expect(W.document.getElementById('files-parts').hidden).toBe(true);
      expect(caret.getAttribute('aria-expanded')).toBe('false');
      expect(caret.textContent).toBe('▸');
      expect(W.localStorage.getItem('pua.files.targetParts')).toBe('0');
      caret.click();
      expect(W.document.getElementById('files-parts').hidden).toBe(false);
      expect(W.localStorage.getItem('pua.files.targetParts')).toBe('1');
    } finally { restore(); }
  });

  test('前回畳んでいれば、起動しても畳んだまま', function() {
    var W = boot('0', SPI);
    try {
      expect(W.document.getElementById('files-parts').hidden).toBe(true);
      expect(W.MA.filesPanel.targetPartsOpen()).toBe(false);
    } finally { restore(); }
  });

  test('絞り込みを打つと、畳んでいても開いて図を隠さない', function() {
    var W = boot('0', SPI);
    try {
      var f = W.document.getElementById('files-filter');
      f.value = 'spi';
      f.dispatchEvent(new W.Event('input'));
      expect(W.MA.filesPanel.targetPartsOpen()).toBe(true);
    } finally { restore(); }
  });

  test('部品のフォルダも図も無ければ、畳む印を出さない', function() {
    var W = boot(null, []);
    try {
      var row = W.document.getElementById('files-target-caret').parentNode;
      expect(row.getAttribute('data-empty')).toBe('1');
    } finally { restore(); }
  });
});
