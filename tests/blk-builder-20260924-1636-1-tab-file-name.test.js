'use strict';
// BLK-builder-20260924-1636-1 (design 7a / 7b / 10a): タブと FILES「開いている図」の行は、上部バーと同じ
// 保存されるファイル名 ({name}.puml) で出す。以前は「diagram1」と拡張子なしで、上部バーの「diagram1.puml」と
// 同じ図が 2 通りの名前で並んでいた。data 属性・名前変更は拡張子なしの図名のまま。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;

var html = fs.readFileSync(path.join(__dirname, '..', 'plantuml-assist.html'), 'utf8');
var start = html.indexOf('<div id="files-panel"');
var end = html.indexOf('<section class="files-sec" data-files-section="git">', start);
var frag = html.slice(start, end) + '</div>';

describe('開いている図・タブはファイル名 {name}.puml で出す (design 7a / 10a)', function() {
  var W;
  function boot(docs) {
    var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body>' + frag + '</body></html>');
    W = dom.window;
    global.window = W;
    global.document = W.document;
    W.MA = { workspace: { list: function() { return docs; }, getActiveId: function() { return docs[0] && docs[0].id; } } };
    var ts = '../src/core/top-status.js';
    try { delete require.cache[require.resolve(ts)]; } catch (e) {}
    require(ts);
    var f = '../src/ui/files-panel.js';
    try { delete require.cache[require.resolve(f)]; } catch (e) {}
    require(f);
    W.MA.filesPanel.init();
    W.MA.filesPanel.refresh();
  }
  function restore() { global.window = prevWindow; global.document = prevDocument; }

  test('開いている図の行は .puml 付きで、data-file-name は図名のまま', function() {
    try {
      boot([{ id: 1, name: 'spi_init_sequence' }, { id: 2, name: 'driver_common_class' }]);
      var rows = W.document.querySelectorAll('#files-body-open .files-row');
      expect(rows.length).toBe(2);
      expect(rows[0].querySelector('.files-row-name').textContent).toBe('spi_init_sequence.puml');
      expect(rows[1].querySelector('.files-row-name').textContent).toBe('driver_common_class.puml');
      expect(rows[0].getAttribute('data-file-name')).toBe('spi_init_sequence');
    } finally { restore(); }
  });

  test('既に .puml で終わる名前に二重に付けない', function() {
    try {
      boot([{ id: 1, name: 'legacy.puml' }]);
      var row = W.document.querySelector('#files-body-open .files-row .files-row-name');
      expect(row.textContent).toBe('legacy.puml');
    } finally { restore(); }
  });

  test('タブの札は上部バーと同じ topStatus.fileName で作る (data-doc-name は図名のまま)', function() {
    var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
    var i = src.indexOf("label.className = 'tab-label';");
    expect(i).toBeGreaterThan(0);
    var block = src.slice(i, i + 600);
    expect(/topStatus\.fileName\(doc\.name\)/.test(block)).toBe(true);
    expect(/el\.setAttribute\('data-doc-name', doc\.name\)/.test(src)).toBe(true);
  });
});
