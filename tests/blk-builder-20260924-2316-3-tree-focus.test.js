'use strict';
// BLK-builder-20260924-2316-3 (design 10b「↑↓ で移動、→ ← で開閉、Enter で開く、F2 で名前変更」):
// FILES ツリーで図の行を Enter / クリックで開くと、ツリーが描き直されて押した行が DOM から外れ、
// フォーカスが body に落ちていた (続けて ↓ で次の図へ移れない)。描き直した後の同じ行へフォーカスを戻す。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;

var html = fs.readFileSync(path.join(__dirname, '..', 'plantuml-assist.html'), 'utf8');
var start = html.indexOf('<div id="files-panel"');
var end = html.indexOf('<section class="files-sec" data-files-section="git">', start);
var frag = html.slice(start, end) + '</div></div>';

function load(W, f) {
  global.window = W;
  global.document = W.document;
  try { delete require.cache[require.resolve(f)]; } catch (e) {}
  require(f);
}

function fresh() {
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body><input id="outside">' + frag + '</body></html>', { url: 'http://127.0.0.1/' });
  var W = dom.window;
  W.MA = {};
  load(W, '../src/core/file-tree.js');
  load(W, '../src/core/file-menu.js');
  return W;
}
function restore() { global.window = prevWindow; global.document = prevDocument; }

var DOCS = [
  { id: 1, name: 'spi_init_sequence', diagramType: 'plantuml-sequence' },
  { id: 2, name: 'spi_class', diagramType: 'plantuml-class' },
];

function boot() {
  var W = fresh();
  W.MA.workspace = {
    list: function() { return DOCS; },
    getActiveId: function() { return 1; },
    listFolder: function() {
      var data = { entries: [{ name: 'spi_state', kind: 'state' }, { name: 'spi_init_sequence' }] };
      return { then: function(ok) { ok(data); return { 'catch': function() {} }; } };
    },
  };
  var fp = W.document.getElementById('folder-panel');
  ['spi_init_sequence', 'spi_class', 'spi_state'].forEach(function(n) {
    var it = W.document.createElement('div');
    it.className = 'folder-item';
    it.setAttribute('data-file-name', n);
    fp.appendChild(it);
  });
  load(W, '../src/ui/files-panel.js');
  W.MA.filesPanel.init();
  return W;
}

describe('行の目印 (design 10b)', function() {
  test('種類と目印の属性が同じ行だけを同じ行と見る', function() {
    var W = fresh();
    try {
      var FM = W.MA.fileMenu;
      var d = W.document;
      function row(cls, name) {
        var b = d.createElement('button');
        b.className = cls;
        if (name) b.setAttribute('data-file-name', name);
        return b;
      }
      var key = FM.rowKey(row('files-part-file', 'spi_class'));
      expect(key).toEqual({ cls: 'files-part-file', attrs: { 'data-file-name': 'spi_class' } });
      var rows = [row('files-part-file', 'spi_state'), row('files-ro-file', 'spi_class'), row('files-part-file', 'spi_class')];
      expect(FM.findRow(key, rows)).toBe(rows[2]);
      expect(FM.findRow(key, [rows[0], rows[1]])).toBe(null);
      // 行でない要素 (入力欄・窓) は目印を作らない
      expect(FM.rowKey(d.createElement('input'))).toBe(null);
      expect(FM.rowKey(null)).toBe(null);
      // 属性が 1 つ多い行も別の行 (読むだけの図は同じ名前でもフォルダで分ける)
      var ro = row('files-ro-file', 'spi_state');
      ro.setAttribute('data-ro-dir', 'D:/pd/senior');
      var ro2 = row('files-ro-file', 'spi_state');
      ro2.setAttribute('data-ro-dir', 'D:/pd/release');
      expect(FM.findRow(FM.rowKey(ro), [ro2])).toBe(null);
    } finally { restore(); }
  });
});

describe('描き直してもフォーカスを同じ行に戻す (design 10b)', function() {
  test('部品のフォルダの図: 押した行が作り直されても、新しい同じ行にフォーカスがある', function() {
    var W = boot();
    try {
      var d = W.document;
      d.querySelector('#files-parts .files-part-head').click();   // SPI を開く
      var old = d.querySelector('#files-parts .files-part-file[data-file-name="spi_class"]');
      old.focus();
      expect(d.activeElement).toBe(old);
      W.MA.filesPanel.renderParts();
      var now = d.querySelector('#files-parts .files-part-file[data-file-name="spi_class"]');
      expect(now).not.toBe(old);
      expect(d.activeElement).toBe(now);
    } finally { restore(); }
  });

  test('開いている図: 図の行が作り直されても同じ図の行にフォーカスがある', function() {
    var W = boot();
    try {
      var d = W.document;
      var old = d.querySelector('#files-body-open .files-row[data-doc-id="2"]');
      old.focus();
      W.MA.filesPanel.refresh();
      var now = d.querySelector('#files-body-open .files-row[data-doc-id="2"]');
      expect(now).not.toBe(old);
      expect(d.activeElement).toBe(now);
    } finally { restore(); }
  });

  test('読むだけのフォルダの図: 比較中が変わって描き直されても同じ図の行にフォーカスがある', function() {
    var W = boot();
    try {
      var d = W.document;
      var DIRS = [
        { name: 'junior', path: 'D:/pd/junior', files: 3, current: true },
        { name: 'senior', path: 'D:/pd/senior', files: 2, current: false },
      ];
      W.compareReadonlyFolder = function() {};
      W.MA.filesPanel.setSec('readonly', true);   // 読むだけの節は既定で畳んである
      W.MA.filesPanel.renderReadonly(DIRS, '');
      d.querySelector('#files-ro-list .files-ro-folder[data-ro-name="senior"]').click();
      var old = d.querySelector('.files-ro-file[data-file-name="spi_state"]');
      old.focus();
      W.MA.filesPanel.renderReadonly(DIRS, 'D:/pd/senior');
      var now = d.querySelector('.files-ro-file[data-file-name="spi_state"]');
      expect(now).not.toBe(old);
      expect(d.activeElement).toBe(now);
    } finally { restore(); }
  });

  test('フォーカスがツリーの外 (入力欄) にあれば、描き直してもツリーへ奪わない', function() {
    var W = boot();
    try {
      var d = W.document;
      d.querySelector('#files-parts .files-part-head').click();
      var input = d.getElementById('outside');
      input.focus();
      W.MA.filesPanel.refresh();
      expect(d.activeElement).toBe(input);
    } finally { restore(); }
  });

  test('畳んだ部品の中の行には戻さない (見えない行にフォーカスを置かない)', function() {
    var W = boot();
    try {
      var d = W.document;
      var head = d.querySelector('#files-parts .files-part-head');
      head.click();   // 開く
      d.querySelector('#files-parts .files-part-file[data-file-name="spi_state"]').focus();
      head.click();   // 畳む (覚えた開閉で描き直すと畳んだまま)
      W.MA.filesPanel.renderParts();
      expect(d.activeElement.classList.contains('files-part-file')).toBe(false);
    } finally { restore(); }
  });
});
