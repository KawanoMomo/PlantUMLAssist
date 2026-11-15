'use strict';
// BLK-builder-20260924-1749-3 (design 10a): FILES ツリーの「読むだけ」節に隣の保存フォルダを 1 行ずつ出す。
// 前は節を開いても説明の 1 行だけで、見出しに件数も出なかった。
// TICKET-owner-20261115-2141-prune: 右クリックの比較と、右の枠に出している相手の札は外した。
// 図を押すと、その 1 枚を書かずに右の枠に出す (showReadonlyFile)。
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
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body>' + frag + '</body></html>');
  var W = dom.window;
  W.MA = {};
  load(W, '../src/core/file-tree.js');
  load(W, '../src/core/file-menu.js');
  return W;
}
function restore() { global.window = prevWindow; global.document = prevDocument; }

var DIRS = [
  { name: 'junior', path: 'D:/pd/junior', files: 3, current: true },
  { name: 'senior', path: 'D:/pd/senior', files: 12, current: false },
  { name: 'release_v1.2', path: 'D:\\pd\\release_v1.2\\', files: 6, current: false },
];

describe('読むだけの行と件数 (design 10a)', function() {
  test('自分の保存先は出さず、名前の順に並べる。行に比べる相手の印は持たない', function() {
    var W = fresh();
    try {
      var rows = W.MA.fileTree.readonlyRows(DIRS);
      expect(rows.map(function(r) { return r.name; })).toEqual(['release_v1.2', 'senior']);
      expect(rows[1].files).toBe(12);
      expect(rows.some(function(r) { return 'comparing' in r; })).toBe(false);
    } finally { restore(); }
  });

  test('見出しの件数はフォルダの数だけ。フォルダが無ければ出さない', function() {
    var W = fresh();
    try {
      var FT = W.MA.fileTree;
      expect(FT.readonlyCountLabel(2)).toBe('2');
      expect(FT.readonlyCountLabel(0)).toBe('');
      expect(FT.readonlyCountLabel()).toBe('');
    } finally { restore(); }
  });
});

describe('読むだけの節を描く (design 10a)', function() {
  function boot(listed) {
    var W = fresh();
    W.MA.workspace = {
      list: function() { return []; },
      getActiveId: function() { return null; },
      // 同期で答える thenable (この runner は Promise を待たないので、描いた結果をその場で読む)。
      listFolder: function(p) {
        listed.push(p);
        var data = { entries: [{ name: 'spi_state', kind: 'state' }, { name: 'spi_init_sequence' }] };
        return { then: function(ok) { ok(data); return { 'catch': function() {} }; } };
      },
    };
    load(W, '../src/ui/files-panel.js');
    W.MA.filesPanel.init();
    return W;
  }

  test('フォルダの行が並び、説明の 1 行は隠れ、見出しに件数が出る', function() {
    var W = boot([]);
    try {
      W.MA.filesPanel.renderReadonly(DIRS);
      var rows = W.document.querySelectorAll('#files-ro-list .files-ro-folder');
      expect(Array.prototype.map.call(rows, function(r) { return r.getAttribute('data-ro-name'); }))
        .toEqual(['release_v1.2', 'senior']);
      expect(W.document.querySelector('#files-ro-list .files-ro-tag')).toBe(null);
      expect(W.document.getElementById('files-ro-hint').hidden).toBe(true);
      expect(W.document.getElementById('files-count-readonly').textContent).toBe('2');
    } finally { restore(); }
  });

  test('行を押すと開いてそのフォルダの図が名前の順に並び、図を押すとその 1 枚を右の枠に出す', function() {
    var listed = [];
    var W = boot(listed);
    try {
      var calls = [];
      W.showReadonlyFile = function(dir, name) { calls.push([dir, name]); };
      W.MA.filesPanel.renderReadonly(DIRS);
      var head = W.document.querySelector('#files-ro-list .files-ro-folder[data-ro-name="senior"]');
      head.click();
      expect(head.getAttribute('aria-expanded')).toBe('true');
      expect(listed).toEqual(['D:/pd/senior']);
      var files = W.document.querySelectorAll('.files-ro-body[data-ro-body="D:/pd/senior"] .files-ro-file');
      expect(Array.prototype.map.call(files, function(f) { return f.getAttribute('data-file-name'); }))
        .toEqual(['spi_init_sequence', 'spi_state']);
      expect(files[1].querySelector('.files-row-glyph').getAttribute('data-kind')).toBe('plantuml-state');
      files[1].click();
      expect(calls).toEqual([['D:/pd/senior', 'spi_state']]);
    } finally { restore(); }
  });

  test('同じ行のまま描き直しても作り直さない (開いたフォルダを読み直さない)', function() {
    var listed = [];
    var W = boot(listed);
    try {
      W.MA.filesPanel.renderReadonly(DIRS);
      W.document.querySelector('#files-ro-list .files-ro-folder[data-ro-name="senior"]').click();
      W.MA.filesPanel.renderReadonly(DIRS);
      W.MA.filesPanel.renderReadonly(DIRS);
      expect(listed.length).toBe(1);
    } finally { restore(); }
  });
});
