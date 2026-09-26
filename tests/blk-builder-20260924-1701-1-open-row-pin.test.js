'use strict';
// BLK-builder-20260924-1701-1 (design 10a): FILES「開いている図」の行はクリックで開き、ダブルクリックでタブとして固定する。
// 以前は FILES だけの覚え書きに 📌 を付けるだけで、タブは仮 (斜体) のまま残っていた。仮のタブの図は行も斜体の印 (data-preview) を持つ。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;

var html = fs.readFileSync(path.join(__dirname, '..', 'plantuml-assist.html'), 'utf8');
var start = html.indexOf('<div id="files-panel"');
var end = html.indexOf('<section class="files-sec" data-files-section="git">', start);
var frag = html.slice(start, end) + '</div>';

describe('開いている図の行のダブルクリックはタブを固定する (design 10a)', function() {
  var W, docs, pinnedIds, tabsDrawn;
  function boot() {
    var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body>' + frag + '</body></html>');
    W = dom.window;
    global.window = W;
    global.document = W.document;
    docs = [{ id: 1, name: 'spi_init_sequence', preview: false }, { id: 2, name: 'spi_state', preview: true }];
    pinnedIds = [];
    tabsDrawn = 0;
    W.MA = { workspace: {
      list: function() { return docs.map(function(d) { return Object.assign({}, d); }); },
      getActiveId: function() { return 2; },
      pin: function(id) { pinnedIds.push(id); docs.forEach(function(d) { if (d.id === id) d.preview = false; }); },
    } };
    W.renderTabs = function() { tabsDrawn++; W.MA.filesPanel.refresh(); };
    var f = '../src/ui/files-panel.js';
    try { delete require.cache[require.resolve(f)]; } catch (e) {}
    require(f);
    W.MA.filesPanel.init();
    W.MA.filesPanel.refresh();
  }
  function restore() { global.window = prevWindow; global.document = prevDocument; }
  function row(id) { return W.document.querySelector('#files-body-open .files-row[data-doc-id="' + id + '"]'); }

  test('仮のタブの図の行だけが data-preview を持つ', function() {
    try {
      boot();
      expect(row(2).getAttribute('data-preview')).toBe('1');
      expect(row(1).getAttribute('data-preview')).toBe(null);
    } finally { restore(); }
  });

  test('ダブルクリックで workspace.pin を呼び、タブ列を描き直し、は出さない', function() {
    try {
      boot();
      row(2).dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true }));
      expect(pinnedIds).toEqual([2]);
      expect(tabsDrawn).toBe(1);
      expect(row(2).getAttribute('data-preview')).toBe(null);
      expect(W.document.getElementById('files-body-open').textContent.indexOf('📌')).toBe(-1);
      expect(row(2).getAttribute('data-pinned')).toBe(null);
    } finally { restore(); }
  });
});
