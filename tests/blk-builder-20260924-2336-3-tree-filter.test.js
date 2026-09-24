'use strict';
// BLK-builder-20260924-2336-3 (design 10a「⌕ ファイル名・部品名で絞り込む」): 絞り込み欄に図の名前を打つと、
// 当たった図が畳んだ部品のフォルダの中に隠れ、見出しだけが残っていた。絞り込み中は当たった部品のフォルダを開いて描く。
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
  ['spi_init_sequence', 'spi_class', 'spi_state', 'timer_state'].forEach(function(n) {
    var it = W.document.createElement('div');
    it.className = 'folder-item';
    it.setAttribute('data-file-name', n);
    fp.appendChild(it);
  });
  load(W, '../src/ui/files-panel.js');
  W.MA.filesPanel.init();
  return W;
}

function filterBy(W, q) {
  var f = W.document.getElementById('files-filter');
  f.value = q;
  f.dispatchEvent(new W.Event('input', { bubbles: true }));
}
function partBody(W, part) { return W.document.querySelector('#files-parts .files-part-body[data-part-body="' + part + '"]'); }
function partHead(W, part) { return W.document.querySelector('#files-parts .files-part-head[data-part="' + part + '"]'); }

describe('絞り込み中の部品のフォルダ (design 10a)', function() {
  test('打っている間は開く。空 (空白だけ) なら覚えた開閉のまま', function() {
    var W = fresh();
    try {
      var FT = W.MA.fileTree;
      expect(FT.partOpen(false, 'timer')).toBe(true);
      expect(FT.partOpen(true, 'timer')).toBe(true);
      expect(FT.partOpen(false, '')).toBe(false);
      expect(FT.partOpen(false, '  ')).toBe(false);
      expect(FT.partOpen(true, '')).toBe(true);
      expect(FT.partOpen(false, null)).toBe(false);
    } finally { restore(); }
  });

  test('図の名前で絞ると、畳んでいた部品のフォルダが開いて当たった図の行が見える', function() {
    var W = boot();
    try {
      expect(partBody(W, 'timer').hidden).toBe(true);   // 既定は畳んである
      filterBy(W, 'timer');
      expect(partHead(W, 'spi')).toBe(null);             // 当たらない部品は出ない
      expect(partHead(W, 'timer').getAttribute('aria-expanded')).toBe('true');
      expect(partBody(W, 'timer').hidden).toBe(false);
      expect(partBody(W, 'timer').querySelector('.files-part-file[data-file-name="timer_state"]')).not.toBe(null);
      filterBy(W, 'spi_st');
      expect(partBody(W, 'spi').hidden).toBe(false);
      var names = Array.prototype.map.call(partBody(W, 'spi').querySelectorAll('.files-part-file'),
        function(b) { return b.getAttribute('data-file-name'); });
      expect(names).toEqual(['spi_state']);
    } finally { restore(); }
  });

  test('絞り込みを消すと覚えた開閉に戻り、絞り込み中の開閉は覚えない', function() {
    var W = boot();
    try {
      filterBy(W, 'timer');
      partHead(W, 'timer').click();                      // 絞り込み中に畳む
      expect(partBody(W, 'timer').hidden).toBe(true);
      filterBy(W, '');
      expect(partBody(W, 'timer').hidden).toBe(true);    // 元の既定 (畳む) のまま
      expect(W.localStorage.getItem('pua.files.part.timer')).toBe(null);
      partHead(W, 'spi').click();                        // 絞り込んでいない時の開閉は今までどおり覚える
      expect(W.localStorage.getItem('pua.files.part.spi')).toBe('1');
      filterBy(W, 'timer');
      filterBy(W, '');
      expect(partBody(W, 'spi').hidden).toBe(false);
      expect(partBody(W, 'timer').hidden).toBe(true);
    } finally { restore(); }
  });
});
