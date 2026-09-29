'use strict';
// BLK-builder-20260924-1350-3 (design 10a / 9a): FILES ツリーの節見出しは「名前 + 右端の件数」を 1 回だけ出す
// (「開いている図（1）  1」と 2 回出していた)。「読むだけ」の見出しの入口は 👀 の絵文字ではなく
// レールと同じ 1px 線画 (目) にし、読み上げ名は「他フォルダを覗く」。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;

var html = fs.readFileSync(path.join(__dirname, '..', 'plantuml-assist.html'), 'utf8');
var start = html.indexOf('<div id="files-panel"');
var end = html.indexOf('<section class="files-sec" data-files-section="git">', start);
var frag = html.slice(start, end) + '</div>';
var EMOJI = /[-]/u;

describe('FILES の節見出し (design 10a / 9a)', function() {
  var dom, W;
  function boot(docs) {
    dom = new jsdom.JSDOM('<!DOCTYPE html><html><body>' + frag + '</body></html>');
    W = dom.window;
    global.window = W;
    global.document = W.document;
    W.MA = { workspace: { list: function() { return docs; }, getActiveId: function() { return docs[0] && docs[0].id; } } };
    var f = '../src/ui/files-panel.js';
    try { delete require.cache[require.resolve(f)]; } catch (e) {}
    require(f);
    W.MA.filesPanel.init();
    W.MA.filesPanel.refresh();
  }
  function restore() { global.window = prevWindow; global.document = prevDocument; }

  test('開いている図の件数は右端に 1 回だけ (名前に括弧で足さない)', function() {
    try {
      boot([{ id: 1, name: 'spi_init_sequence' }, { id: 2, name: 'driver_common_class' }]);
      var head = W.document.getElementById('files-sec-open');
      expect(head.querySelector('.files-sec-label').textContent).toBe('開いている図');
      expect(W.document.getElementById('files-count-open').textContent).toBe('2');
      expect((head.textContent.match(/2/g) || []).length).toBe(1);
    } finally { restore(); }
  });

  test('「読むだけ」の入口は線画で、絵文字を使わない', function() {
    try {
      boot([]);
      var peek = W.document.getElementById('btn-tab-peek');
      // BLK-owner-20260924-1836-prune: 入口は何をするかで呼ぶ (「覗く」ではなく「図を調べる」)。
      expect(peek.getAttribute('aria-label')).toBe('読むだけのフォルダの図を調べる');
      expect(peek.querySelector('svg')).not.toBeNull();
      expect(EMOJI.test(peek.textContent + peek.getAttribute('aria-label'))).toBe(false);
      var ro = W.document.getElementById('files-body-readonly');
      expect(EMOJI.test(ro.textContent)).toBe(false);
    } finally { restore(); }
  });
});
