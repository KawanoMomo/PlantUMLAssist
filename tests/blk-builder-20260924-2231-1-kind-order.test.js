'use strict';
// BLK-builder-20260924-2231-1 (design 10a): FILES ツリーの部品フォルダの中の図は、左レールと同じ
// 図種の順 (SEQ・UC・CMP・CLS・ACT・ST)、同じ図種の中は名前の順に並ぶ。10a の SPI は
// spi_init_sequence・spi_transfer_sequence・spi_class・spi_state。名前の順 (spi_class が先頭) だと
// 行頭の線画がばらばらの順で並ぶ。「＋ 未作成 N 図種（…）」の略号もレールの順。
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

function names(g) { return g.files.map(function(f) { return f.name; }); }

describe('部品フォルダの中は左レールの図種の順 (design 10a)', function() {
  test('design の SPI: シーケンス 2 枚 → クラス → 状態遷移 (同じ図種の中は名前の順)', function() {
    var W = fresh();
    try {
      var FT = W.MA.fileTree;
      var g = FT.groups([
        { name: 'spi_class', kind: 'class' },
        { name: 'spi_state', kind: 'state' },
        { name: 'spi_transfer_sequence', kind: 'sequence' },
        { name: 'spi_init_sequence', kind: 'sequence' },
      ])[0];
      expect(names(g)).toEqual(['spi_init_sequence', 'spi_transfer_sequence', 'spi_class', 'spi_state']);
      expect(g.missingLabel).toBe('未作成 3 図種（UC・CMP・ACT）');
    } finally { restore(); }
  });

  test('6 図種はレールと同じ SEQ・UC・CMP・CLS・ACT・ST の順', function() {
    var W = fresh();
    try {
      var FT = W.MA.fileTree;
      var all = FT.KINDS.slice().reverse().map(function(k) { return { name: 'can_' + k, kind: k }; });
      var g = FT.groups(all)[0];
      expect(g.files.map(function(f) { return FT.KIND_ABBR[f.kind]; }))
        .toEqual(['SEQ', 'UC', 'CMP', 'CLS', 'ACT', 'ST']);
      expect(FT.RAIL_ORDER.length).toBe(FT.KINDS.length);
      FT.KINDS.forEach(function(k) { expect(FT.RAIL_ORDER.indexOf(k) >= 0).toBe(true); });
    } finally { restore(); }
  });

  test('未作成の略号もレールの順 (シーケンスだけの部品は UC・CMP・CLS・ACT・ST)', function() {
    var W = fresh();
    try {
      var FT = W.MA.fileTree;
      var g = FT.groups([{ name: 'adc_init_sequence', kind: 'sequence' }])[0];
      expect(g.missing).toEqual(['usecase', 'component', 'class', 'activity', 'state']);
      expect(g.missingLabel).toBe('未作成 5 図種（UC・CMP・CLS・ACT・ST）');
      var mp = FT.missingParts(g);
      expect(mp.kinds.map(function(k) { return k.abbr; })).toEqual(['UC', 'CMP', 'CLS', 'ACT', 'ST']);
    } finally { restore(); }
  });

  test('並べ替えは渡した一覧を書き換えない。図種の分からない行は最後', function() {
    var W = fresh();
    try {
      var FT = W.MA.fileTree;
      var src = [{ name: 'b', kind: '' }, { name: 'x_state', kind: 'state' }, { name: 'A_seq', kind: 'sequence' },
        { name: 'a_seq', kind: 'sequence' }];
      var out = FT.sortByKind(src);
      expect(out.map(function(f) { return f.name; })).toEqual(['A_seq', 'a_seq', 'x_state', 'b']);
      expect(src[0].name).toBe('b');
      expect(FT.kindRank('sequence')).toBe(0);
      expect(FT.kindRank('state')).toBe(5);
      expect(FT.kindRank('')).toBe(6);
    } finally { restore(); }
  });
});

describe('ツリーに描いた行もその順 (design 10a)', function() {
  test('保存先の並び (名前順) と違っても、部品フォルダの中は図種の順で描く', function() {
    var W = fresh();
    try {
      W.MA.workspace = { list: function() { return []; }, getActiveId: function() { return null; } };
      var fp = W.document.getElementById('folder-panel');
      fp.className = 'open';
      fp.innerHTML = '<div class="folder-item" data-file-name="spi_class" data-content-kind="class"></div>'
        + '<div class="folder-item" data-file-name="spi_flow_component" data-content-kind="component"></div>'
        + '<div class="folder-item" data-file-name="spi_init_sequence" data-content-kind="sequence"></div>'
        + '<div class="folder-item" data-file-name="spi_state" data-content-kind="state"></div>';
      load(W, '../src/ui/files-panel.js');
      W.MA.filesPanel.init();
      W.MA.filesPanel.renderParts();
      var rows = W.document.querySelectorAll('#files-parts .files-part-file[data-file-name]');
      expect(Array.prototype.map.call(rows, function(r) { return r.getAttribute('data-file-name'); }))
        .toEqual(['spi_init_sequence', 'spi_flow_component', 'spi_class', 'spi_state']);
      var kinds = W.document.querySelectorAll('#files-parts .files-part-missing[data-part="spi"] button.files-part-missing-kind');
      expect(Array.prototype.map.call(kinds, function(b) { return b.getAttribute('data-kind'); }))
        .toEqual(['usecase', 'activity']);
    } finally { restore(); }
  });
});
