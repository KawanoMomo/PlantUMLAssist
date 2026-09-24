'use strict';
// BLK-builder-20260924-1715-1 (design 10a / 9a): 上部バー左は「{保存先} / {部品} / {ファイル名}」のパンくず。
// 以前は保存先の図を開いても上部バーはファイル名だけで、どのフォルダの図か読めなかった。
// フォルダの段を押すと FILES ツリーでそのフォルダを見せる (保存先を変えるのはツリーの保存先の行)。
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

function fresh() {
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body>' + frag + '</body></html>');
  var W = dom.window;
  W.MA = {};
  load(W, '../src/core/top-status.js');
  load(W, '../src/core/file-tree.js');
  return W;
}

describe('上部バーのパンくず (design 10a)', function() {
  test('保存先があれば 保存先 → 部品 の段を返し、部品の無い図は保存先だけ', function() {
    var W = fresh();
    try {
      var TS = W.MA.topStatus;
      var two = TS.crumbs('junior', { part: 'spi', label: 'SPI' });
      expect(two.map(function(c) { return c.kind + ':' + c.label; })).toEqual(['target:junior', 'part:SPI']);
      expect(two[1].part).toBe('spi');
      expect(TS.crumbs('junior', null).map(function(c) { return c.label; })).toEqual(['junior']);
    } finally { global.window = prevWindow; global.document = prevDocument; }
  });

  test('保存先が無い (ダウンロード) 新規の図はフォルダの段を出さない', function() {
    var W = fresh();
    try {
      expect(W.MA.topStatus.crumbs('', { part: 'spi', label: 'SPI' })).toEqual([]);
      expect(W.MA.topStatus.crumbs(null, null)).toEqual([]);
    } finally { global.window = prevWindow; global.document = prevDocument; }
  });

  test('部品の段はツリーと同じ束ね方で決まる (一覧に無い図・図種の読めない図は null)', function() {
    var W = fresh();
    try {
      var FT = W.MA.fileTree;
      var entries = [
        { name: 'spi_state', kind: 'state' },
        { name: 'spi_init_sequence', kind: '' },
        { name: 'diagram2', kind: '' },
        { name: 'diagram1', kind: 'sequence' },
      ];
      expect(FT.partFor('spi_state', entries)).toEqual({ part: 'spi', label: 'SPI' });
      expect(FT.partFor('spi_init_sequence.puml', entries)).toEqual({ part: 'spi', label: 'SPI' });
      expect(FT.partFor('diagram1', entries)).toEqual({ part: 'diagram1', label: 'DIAGRAM1' });
      expect(FT.partFor('diagram2', entries)).toBe(null);
      expect(FT.partFor('can_state', entries)).toBe(null);
      expect(FT.partFor('', entries)).toBe(null);
    } finally { global.window = prevWindow; global.document = prevDocument; }
  });

  test('上部バーのパンくずの置き場は #top-file-name の左にあり、絵文字を持たない', function() {
    var tb = html.slice(html.indexOf('<div id="toolbar">'), html.indexOf('<div id="toolbar-actions"'));
    var a = tb.indexOf('id="top-crumbs"');
    var b = tb.indexOf('id="top-file-name"');
    expect(a).toBeGreaterThan(-1);
    expect(a).toBeLessThan(b);
    expect(tb).not.toContain('id="top-crumb-sep"');
  });
});

describe('パンくずから FILES ツリーのフォルダを見せる (design 10a)', function() {
  function boot() {
    var W = fresh();
    W.MA.workspace = { list: function() { return []; }, getActiveId: function() { return null; } };
    var fp = W.document.getElementById('folder-panel');
    fp.className = 'open';
    fp.innerHTML = '<div class="folder-item" data-file-name="spi_state" data-content-kind="state"></div>'
      + '<div class="folder-item" data-file-name="spi_init_sequence" data-content-kind="sequence"></div>';
    load(W, '../src/ui/files-panel.js');
    W.MA.filesPanel.init();
    W.MA.filesPanel.setOpen(false);
    W.MA.filesPanel.renderParts();
    return W;
  }
  function restore() { global.window = prevWindow; global.document = prevDocument; }

  test('部品の段: 畳んだパネルを開き、部品のフォルダを開いて、その見出しへ移る', function() {
    var W = boot();
    try {
      var head = W.document.querySelector('#files-parts .files-part-head[data-part="spi"]');
      expect(head.getAttribute('aria-expanded')).toBe('false');
      expect(W.MA.filesPanel.isOpen()).toBe(false);
      expect(W.MA.filesPanel.reveal('part', 'spi')).toBe(true);
      head = W.document.querySelector('#files-parts .files-part-head[data-part="spi"]');
      expect(W.MA.filesPanel.isOpen()).toBe(true);
      expect(head.getAttribute('aria-expanded')).toBe('true');
      expect(W.document.activeElement).toBe(head);
      expect(head.classList.contains('files-revealed')).toBe(true);
    } finally { restore(); }
  });

  test('保存先の段: ツリーの保存先の行へ移る (保存先を変える画面は開かない)', function() {
    var W = boot();
    try {
      var clicked = 0;
      W.document.getElementById('top-save-target').addEventListener('click', function() { clicked++; });
      W.MA.filesPanel.reveal('target', '');
      expect(W.document.activeElement.id).toBe('top-save-target');
      expect(clicked).toBe(0);
    } finally { restore(); }
  });

  test('一覧が読み直るたびに上部バーのパンくずを追わせる', function() {
    var W = boot();
    try {
      var n = 0;
      W.MA.refreshTopCrumbs = function() { n++; };
      W.MA.filesPanel.renderParts();
      expect(n).toBe(1);
      expect(W.MA.filesPanel.folderEntries().map(function(e) { return e.name; }))
        .toEqual(['spi_state', 'spi_init_sequence']);
    } finally { restore(); }
  });
});
