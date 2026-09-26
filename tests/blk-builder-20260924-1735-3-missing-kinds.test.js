'use strict';
// BLK-builder-20260924-1735-3 (design 10a): 部品フォルダの「＋ 未作成 2 図種（UC・ACT）」。
// 「展開すると、まだ作っていない図種が薄い文字で出て、押すとその場で作れます」。
// 前は行を押すと 🧩 部品ビュー (読むだけの他フォルダの比較枠) が開くだけで、作るには
// ➕ 部品を起こす で部品名を打ち直していた。略号を押せばその図種を、＋ で未作成をまとめて作る。
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
  load(W, '../src/core/file-tree.js');
  return W;
}
function restore() { global.window = prevWindow; global.document = prevDocument; }

describe('未作成の図種の行 (design 10a)', function() {
  test('略号は 6 図種の順に並び、押すと何を作るかを title で言う', function() {
    var W = fresh();
    try {
      var FT = W.MA.fileTree;
      var g = FT.groups([{ name: 'spi_init_sequence', kind: 'sequence' }, { name: 'spi_state', kind: 'state' },
        { name: 'spi_class', kind: 'class' }, { name: 'spi_flow_component', kind: 'component' }])[0];
      var mp = FT.missingParts(g);
      expect(mp.head + mp.kinds.map(function(k) { return k.abbr; }).join('・') + mp.tail).toBe(g.missingLabel);
      expect(mp.kinds.map(function(k) { return k.kind; })).toEqual(['usecase', 'activity']);
      expect(mp.kinds[0].title).toBe('SPI のユースケース図をここに作る');
      expect(mp.allTitle).toBe('未作成の 2 図種 (UC・ACT) をまとめて作る');
    } finally { restore(); }
  });

  test('6 図種が揃っていれば行を出さない', function() {
    var W = fresh();
    try {
      var FT = W.MA.fileTree;
      expect(FT.missingParts({ part: 'spi', missing: [] })).toBe(null);
    } finally { restore(); }
  });

  test('作る図の名前が保存先にあれば _2, _3 を付けて上書きしない (大小・拡張子は区別しない)', function() {
    var W = fresh();
    try {
      var FT = W.MA.fileTree;
      expect(FT.freeName('spi_usecase', ['spi_state'])).toBe('spi_usecase');
      expect(FT.freeName('spi_usecase', ['SPI_Usecase.puml'])).toBe('spi_usecase_2');
      expect(FT.freeName('spi_usecase', ['spi_usecase', 'spi_usecase_2'])).toBe('spi_usecase_3');
      expect(FT.freeName('', [])).toBe('');
    } finally { restore(); }
  });
});

describe('ツリーの行から、その場で作る (design 10a)', function() {
  function boot(calls) {
    var W = fresh();
    W.MA.workspace = { list: function() { return []; }, getActiveId: function() { return null; } };
    W.createPartKinds = function(part, kinds, existing) { calls.push({ part: part, kinds: kinds, existing: existing }); };
    var fp = W.document.getElementById('folder-panel');
    fp.className = 'open';
    fp.innerHTML = '<div class="folder-item" data-file-name="spi_state" data-content-kind="state"></div>'
      + '<div class="folder-item" data-file-name="spi_init_sequence" data-content-kind="sequence"></div>'
      + '<div class="folder-item" data-file-name="spi_class" data-content-kind="class"></div>'
      + '<div class="folder-item" data-file-name="spi_flow_component" data-content-kind="component"></div>';
    load(W, '../src/ui/files-panel.js');
    W.MA.filesPanel.init();
    W.MA.filesPanel.renderParts();
    return W;
  }

  test('行は「＋ 未作成 2 図種（UC・ACT）」で、略号と ＋ が押せる (部品ビューへは渡さない)', function() {
    var calls = [];
    var W = boot(calls);
    try {
      var row = W.document.querySelector('#files-parts .files-part-missing[data-part="spi"]');
      expect(row.textContent).toBe('＋未作成 2 図種（UC・ACT）');
      var kinds = row.querySelectorAll('button.files-part-missing-kind');
      expect(Array.prototype.map.call(kinds, function(b) { return b.getAttribute('data-kind'); })).toEqual(['usecase', 'activity']);
      var boardOpened = 0;
      var link = W.document.createElement('button');
      link.id = 'folder-board-link';
      link.addEventListener('click', function() { boardOpened++; });
      W.document.body.appendChild(link);

      kinds[1].click();
      expect(calls.length).toBe(1);
      expect(calls[0].part).toBe('spi');
      expect(calls[0].kinds).toEqual(['activity']);
      expect(calls[0].existing).toEqual(['spi_state', 'spi_init_sequence', 'spi_class', 'spi_flow_component']);

      row.querySelector('button.files-part-missing-all').click();
      expect(calls[1].kinds).toEqual(['usecase', 'activity']);
      expect(boardOpened).toBe(0);
    } finally { restore(); }
  });
});
