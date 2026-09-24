'use strict';
// BLK-builder-20260924-1741-2 (design 9a / 10a): 未保存の印を 1 つの判定で出す。
// タブにだけ ● が出て、FILES ツリーの行 (開いている図・保存先) には ● が出なかった
// (ツリーは誰も立てない doc.dirty を読んでいた)。ツリーは app.js の docSaveStatus
// (タブの ●/○ と同じ save-diff の判定) を読み、打つたびに syncMarks で印だけを付け直す。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;

var html = fs.readFileSync(path.join(__dirname, '..', 'plantuml-assist.html'), 'utf8');
var start = html.indexOf('<div id="files-panel"');
var end = html.indexOf('<section class="files-sec" data-files-section="git">', start);
var frag = html.slice(start, end) + '</div>';

function restore() { global.window = prevWindow; global.document = prevDocument; }

function load(W, f) {
  global.window = W;
  global.document = W.document;
  try { delete require.cache[require.resolve(f)]; } catch (e) {}
  require(f);
}

describe('FILES ツリーの未保存の印はタブと同じ判定を読む (design 9a / 10a)', function() {
  var status;   // id → 'same' | 'changed' | 'new'
  var docs;
  function boot() {
    var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body>' + frag + '</body></html>');
    var W = dom.window;
    W.MA = {};
    load(W, '../src/core/file-tree.js');
    docs = [{ id: 1, name: 'spi_state', diagramType: 'plantuml-state' },
            { id: 2, name: 'diagram1', diagramType: 'plantuml-sequence' }];
    status = { 1: 'same', 2: 'new' };
    W.MA.workspace = { list: function() { return docs; }, getActiveId: function() { return 1; } };
    W.MA.docSaveStatus = function(id) { return status[id] || 'same'; };
    W.MA.docSaveStatusByName = function(name) {
      for (var i = 0; i < docs.length; i++) if (docs[i].name === name) return status[docs[i].id] || 'same';
      return 'same';
    };
    var fp = W.document.getElementById('folder-panel');
    fp.className = 'open';
    fp.innerHTML = ['spi_state', 'spi_class'].map(function(n) {
      return '<div class="folder-row"><button class="folder-item" data-file-name="' + n + '" data-content-kind="'
        + (n === 'spi_state' ? 'state' : 'class') + '"></button></div>';
    }).join('');
    load(W, '../src/ui/files-panel.js');
    W.MA.filesPanel.init();
    W.MA.filesPanel.refresh();
    return W;
  }
  function openMark(W, id) {
    var m = W.document.querySelector('.files-row[data-doc-id="' + id + '"] .files-row-mark');
    return m ? m.textContent : '';
  }
  function partMark(W, name) {
    var m = W.document.querySelector('#files-parts .files-part-file[data-file-name="' + name + '"] .files-row-mark');
    return m ? m.textContent : '';
  }

  test('前回保存と同じ図には印を出さず、まだ保存していない図はタブと同じ ○', function() {
    var W = boot();
    try {
      expect(openMark(W, 1)).toBe('');
      expect(openMark(W, 2)).toBe('○');
      expect(partMark(W, 'spi_state')).toBe('');
    } finally { restore(); }
  });

  test('本文を直すと、行を組み直さずに開いている図と保存先の行へ ● が付き、保存すると消える', function() {
    var W = boot();
    try {
      var row = W.document.querySelector('.files-row[data-doc-id="1"]');
      var part = W.document.querySelector('#files-parts .files-part-file[data-file-name="spi_state"]');
      status[1] = 'changed';
      W.MA.filesPanel.syncMarks();
      expect(openMark(W, 1)).toBe('●');
      expect(partMark(W, 'spi_state')).toBe('●');
      expect(part.getAttribute('data-marks')).toBe('●');
      // 同じ要素のまま (開閉・フォーカスを揺らさない)
      expect(W.document.querySelector('.files-row[data-doc-id="1"]')).toBe(row);
      expect(W.document.querySelector('#files-parts .files-part-file[data-file-name="spi_state"]')).toBe(part);
      // 印は名前の直後
      expect(row.querySelector('.files-row-name').nextSibling.className).toBe('files-row-mark');
      // 開いていない図には付かない
      expect(partMark(W, 'spi_class')).toBe('');
      status[1] = 'same';
      W.MA.filesPanel.syncMarks();
      expect(openMark(W, 1)).toBe('');
      expect(partMark(W, 'spi_state')).toBe('');
      expect(part.hasAttribute('data-marks')).toBe(false);
    } finally { restore(); }
  });

  test('doc.dirty は読まない (判定の出どころを 2 つにしない)', function() {
    var W = boot();
    try {
      docs[0].dirty = true;
      W.MA.filesPanel.refresh();
      expect(openMark(W, 1)).toBe('');
      expect(partMark(W, 'spi_state')).toBe('');
    } finally { restore(); }
  });
});

describe('上部バーの保存ボタンはタブと同じ判定・同じ機会で描き直す', function() {
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  function body(name) {
    var i = src.indexOf('function ' + name + '(');
    var j = src.indexOf('\n}\n', i);
    return src.slice(i, j);
  }
  test('updateTopSaveButton は docSaveStatus を読み、live-diff の行比べで別に判定しない', function() {
    var b = body('updateTopSaveButton');
    expect(b).toContain('docSaveStatus(');
    expect(b).not.toContain('LD.verdict');
  });
  test('renderDiffBadge (打つたび・保存のたびに走る) が保存ボタンとツリーの印も合わせ直す', function() {
    var b = body('renderDiffBadge');
    expect(b).toContain('syncTabDirtyMarks(docs)');
    expect(b).toContain('updateTopSaveButton()');
    expect(b).toContain('filesPanel.syncMarks()');
  });
});
