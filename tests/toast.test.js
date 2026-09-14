'use strict';
// FEAT-015: 削除の confirm() を廃し、「元に戻す」付きトーストに置き換える。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
// 🔴 global.window を無条件に差し替えると、後続の usecase-*.test.js が require キャッシュ済み
// モジュールを現在の window に再登録できず巻き添えで落ちる。既存の DOM があればそれを使う。
if (!(global.window && global.window.document && global.window.document.body)) {
  global.window = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>').window;
}
global.document = global.window.document;
// 他 test が先に require 済みだと別 window に対するキャッシュが返るため明示的に外す。
delete require.cache[require.resolve('../src/core/html-utils.js')];
require('../src/core/html-utils.js');
var toast = window.MA.toast;
var SEQ_SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'sequence.js'), 'utf-8');

// run-tests.js の sandbox は confirm: () => true を与えるため runtime では確認ダイアログの
// 有無を検出できない。よってハンドラ本文をソーステキストから切り出して判定する。
function handlerBody(marker) {
  var i = SEQ_SRC.indexOf(marker);
  if (i < 0) throw new Error('marker not found in sequence.js: ' + marker);
  var open = SEQ_SRC.indexOf('{', i);
  var depth = 0;
  for (var j = open; j < SEQ_SRC.length; j++) {
    if (SEQ_SRC[j] === '{') depth++;
    else if (SEQ_SRC[j] === '}') {
      depth--;
      if (depth === 0) return SEQ_SRC.slice(open, j + 1);
    }
  }
  throw new Error('unbalanced braces after ' + marker);
}

describe('FEAT-015 delete paths have no confirm() guard', function() {
  var MARKERS = ["'seq-delete-line'", "'seq-edit-group-delete'", "'seq-bulk-delete'"];
  MARKERS.forEach(function(marker) {
    test(marker + ' handler contains no confirm(', function() {
      expect(handlerBody(marker).indexOf('confirm(')).toBe(-1);
    });
    test(marker + ' handler still calls pushHistory before mutating', function() {
      expect(handlerBody(marker)).toContain('window.MA.history.pushHistory()');
    });
    test(marker + ' handler shows the undo toast', function() {
      expect(handlerBody(marker)).toContain('_toastUndo(');
    });
  });
  test('participant 一括削除 (FEAT-015 対象外) の confirm は残っている', function() {
    // I3「ついでに直さない」— FEAT-015 が名指ししない経路は変更しない。
    expect(SEQ_SRC).toContain('activate/deactivate/create/destroy');
    expect(SEQ_SRC.indexOf('if (!confirm(lpp.label')).toBeGreaterThan(0);
  });
});

describe('MA.toast', function() {
  beforeEach(function() {
    toast.dismiss();
  });
  test('show renders a toast element into document.body', function() {
    toast.show('1 件削除しました');
    var el = document.getElementById('ma-toast');
    expect(el === null).toBe(false);
    expect(el.textContent).toContain('1 件削除しました');
  });
  test('no undo button when onUndo is omitted', function() {
    toast.show('保存しました');
    expect(document.querySelector('.ma-toast-undo')).toBe(null);
  });
  test('undo button is rendered and invokes the callback', function() {
    var called = 0;
    toast.show('2 件削除しました', '元に戻す', function() { called++; });
    var btn = document.querySelector('.ma-toast-undo');
    expect(btn === null).toBe(false);
    expect(btn.textContent).toBe('元に戻す');
    btn.click();
    expect(called).toBe(1);
  });
  test('clicking undo dismisses the toast', function() {
    toast.show('2 件削除しました', '元に戻す', function() {});
    document.querySelector('.ma-toast-undo').click();
    expect(document.getElementById('ma-toast')).toBe(null);
  });
  test('showing twice keeps only one toast in the DOM', function() {
    toast.show('a', '元に戻す', function() {});
    toast.show('b', '元に戻す', function() {});
    expect(document.querySelectorAll('#ma-toast').length).toBe(1);
    expect(document.getElementById('ma-toast').textContent).toContain('b');
  });
  test('dismiss removes the toast', function() {
    toast.show('a');
    toast.dismiss();
    expect(document.getElementById('ma-toast')).toBe(null);
  });
});
