'use strict';
// BLK-builder-20260924-2255-2 (design 10a「一時控えは「控え」」、下端「12 図 未反映 1 控え 1」):
// 保存先の一覧は一時控えを既定で畳むが、畳んでいる間も控えの行を見えない入れ物 (.folder-draft-body) に置く。
// FILES ツリーはその行も読み、控えの図を消さずに「控え」の札で残し、部品の枚数・未作成の略号・下端の数に入れる。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;

var html = fs.readFileSync(path.join(__dirname, '..', 'plantuml-assist.html'), 'utf8');
var start = html.indexOf('<div id="files-panel"');
var end = html.indexOf('<section class="files-sec" data-files-section="git">', start);
// 下端の 1 行 (#files-summary) は GIT 節の後ろにあるので、それも持ってくる。
var sumAt = html.indexOf('<div class="files-summary" id="files-summary"', end);
var frag = html.slice(start, end) + html.slice(sumAt, html.indexOf('</div>', sumAt) + 6) + '</div>';

function load(W, f) {
  global.window = W;
  global.document = W.document;
  try { delete require.cache[require.resolve(f)]; } catch (e) {}
  require(f);
}
function restore() { global.window = prevWindow; global.document = prevDocument; }

function item(name, kind) {
  return '<div class="folder-row"><button class="folder-item" data-file-name="' + name
    + '" data-content-kind="' + kind + '"></button></div>';
}
function draft(name, kind) {
  return '<div class="folder-row folder-row-draft"><button class="folder-item" data-file-name="' + name
    + '" data-content-kind="' + kind + '"></button></div>';
}

// 一覧の中身を app.js の appendDraftSection と同じ形 (畳んだ控えは見えない入れ物の中) で置く。
function boot(inner) {
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body>' + frag + '</body></html>', { url: 'http://localhost/' });
  var W = dom.window;
  W.localStorage.setItem('pua.files.part.spi', '1');
  W.MA = {};
  load(W, '../src/core/file-tree.js');
  W.MA.workspace = { list: function() { return []; }, getActiveId: function() { return null; } };
  var fp = W.document.getElementById('folder-panel');
  fp.className = 'open';
  fp.innerHTML = inner;
  load(W, '../src/ui/files-panel.js');
  W.MA.filesPanel.init();
  W.MA.filesPanel.renderParts();
  return W;
}

var COLLAPSED = item('spi_init_sequence', 'sequence') + item('spi_state', 'state')
  + '<div class="folder-draft-head"><button class="folder-draft-toggle">一時控え 1 件を出す</button></div>'
  + '<div class="folder-draft-body" hidden style="display:none">' + draft('spi_class', 'class') + '</div>';

describe('一時控えの図は FILES ツリーに「控え」の札で残る (design 10a)', function() {
  test('畳んだ控えも部品の中に行があり、札は「控え」', function() {
    var W = boot(COLLAPSED);
    try {
      var row = W.document.querySelector('#files-parts .files-part-file[data-file-name="spi_class"]');
      expect(row).not.toBeNull();
      expect(row.getAttribute('data-marks')).toBe('控え');
      var plain = W.document.querySelector('#files-parts .files-part-file[data-file-name="spi_state"]');
      expect(plain.getAttribute('data-marks')).toBeNull();
    } finally { restore(); }
  });

  test('部品の枚数と未作成の略号は控えも数える (CLS を未作成にしない)', function() {
    var W = boot(COLLAPSED);
    try {
      var head = W.document.querySelector('#files-parts .files-part-head[data-part="spi"]');
      expect(head.textContent).toContain('3 / 6');
      var miss = W.document.querySelector('#files-parts .files-part-missing[data-part="spi"]');
      var kinds = Array.prototype.map.call(miss.querySelectorAll('.files-part-missing-kind'),
        function(b) { return b.getAttribute('data-kind'); });
      expect(kinds).not.toContain('class');
      expect(kinds.length).toBe(3);
    } finally { restore(); }
  });

  test('保存先の件数と下端の 1 行は控えを含めて数え、「控え 1」を出す', function() {
    var W = boot(COLLAPSED);
    try {
      expect(W.document.getElementById('files-count-target').textContent).toBe('3');
      expect(W.document.getElementById('files-summary').textContent).toBe('3 図 · 控え 1');
    } finally { restore(); }
  });

  test('ツリーの控えの行を押すと、一覧の (見えない) 行へ渡して開く', function() {
    var W = boot(COLLAPSED);
    try {
      var opened = [];
      W.document.querySelector('#folder-panel .folder-item[data-file-name="spi_class"]')
        .addEventListener('click', function() { opened.push('spi_class'); });
      W.document.querySelector('#files-parts .files-part-file[data-file-name="spi_class"]').click();
      expect(opened).toEqual(['spi_class']);
    } finally { restore(); }
  });

  test('控えが無ければ下端に「控え」を出さない', function() {
    var W = boot(item('spi_init_sequence', 'sequence') + item('spi_class', 'class'));
    try {
      expect(W.document.getElementById('files-summary').textContent).toBe('2 図');
    } finally { restore(); }
  });
});
