'use strict';
// BLK-owner-20260924-2232-4: 図の編集の窓と「末尾に追加」をキーボードだけで確定・取り消しする (src/ui/modal-keys.js)。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body>' +
  '<div id="seq-modal" style="display:none;"><div id="seq-modal-content"></div></div>' +
  '<div id="st-tx-modal" style="display:none;"><div id="st-tx-modal-content"></div></div>' +
  '<div id="props-content"></div>' +
  '</body></html>');
global.window = dom.window;
global.document = dom.window.document;

// 1 つのプロセスで全ファイルを回すので、この窓に読み直し、終わったら読み込みの控えを外す (後のテストが自分の窓に読めるように)。
var SRC = ['../src/core/html-utils.js', '../src/core/label-colors.js', '../src/ui/modal-keys.js', '../src/ui/rich-label-editor.js'];
function forget() { SRC.forEach(function(r) { delete require.cache[require.resolve(r)]; }); }
forget();
SRC.forEach(function(r) { require(r); });
var RLE = window.MA.richLabelEditor;

function key(el, k, opts) {
  var o = Object.assign({ key: k, bubbles: true, cancelable: true }, opts || {});
  var ev = new window.KeyboardEvent('keydown', o);
  el.dispatchEvent(ev);
  return ev;
}

function openModal(id, inner) {
  var m = document.getElementById(id);
  var c = document.getElementById(id + '-content');
  c.innerHTML = inner;
  m.style.display = 'flex';
  var log = [];
  var ok = c.querySelector('[id$="-confirm"]');
  var ng = c.querySelector('[id$="-cancel"]');
  if (ok) ok.addEventListener('click', function() { log.push('confirm'); m.style.display = 'none'; });
  if (ng) ng.addEventListener('click', function() { log.push('cancel'); m.style.display = 'none'; });
  return { modal: m, content: c, log: log };
}

describe('窓 (図の編集の modal)', function() {
  var docEnter;
  beforeEach(function() {
    docEnter = 0;
  });
  document.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.shiftKey) docEnter++; });

  test('入力欄で Enter → 確定。document の Enter (選択の直後に挿入) へは流さない', function() {
    var w = openModal('seq-modal', '<input id="seq-wrap-label" type="text"><button id="seq-wrap-cancel">キャンセル</button><button id="seq-wrap-confirm">確定</button>');
    var ev = key(document.getElementById('seq-wrap-label'), 'Enter');
    expect(w.log).toEqual(['confirm']);
    expect(ev.defaultPrevented).toBe(true);
    expect(docEnter).toBe(0);
  });

  test('選択欄で Enter も確定、Esc はどこでもキャンセル', function() {
    var w = openModal('seq-modal', '<select id="seq-mod-from"><option>A</option></select><button id="seq-mod-cancel">キャンセル</button><button id="seq-mod-confirm">確定</button>');
    key(document.getElementById('seq-mod-from'), 'Enter');
    expect(w.log).toEqual(['confirm']);
    var w2 = openModal('seq-modal', '<select id="seq-mod-from"><option>A</option></select><button id="seq-mod-cancel">キャンセル</button><button id="seq-mod-confirm">確定</button>');
    key(document.getElementById('seq-mod-from'), 'Escape');
    expect(w2.log).toEqual(['cancel']);
  });

  test('複数行の欄 (textarea) の Enter は確定しない。Ctrl+Enter はどこでも確定', function() {
    var w = openModal('st-tx-modal', '<textarea id="bulk"></textarea><button id="st-tx-cancel">キャンセル</button><button id="st-tx-confirm">確定</button>');
    var ta = document.getElementById('bulk');
    var ev = key(ta, 'Enter');
    expect(w.log).toEqual([]);
    expect(ev.defaultPrevented).toBe(false);
    key(ta, 'Enter', { ctrlKey: true });
    expect(w.log).toEqual(['confirm']);
  });

  test('押せない確定 (disabled) は押さない。先に欄が扱った Enter (preventDefault 済み) も触らない', function() {
    var w = openModal('seq-modal', '<input id="x" type="text"><button id="seq-sc-cancel">キャンセル</button><button id="seq-sc-confirm" disabled>確定</button>');
    key(document.getElementById('x'), 'Enter');
    expect(w.log).toEqual([]);
    var w2 = openModal('seq-modal', '<input id="y" type="text"><button id="seq-mod-cancel">キャンセル</button><button id="seq-mod-confirm">確定</button>');
    var y = document.getElementById('y');
    y.addEventListener('keydown', function(e) { e.preventDefault(); });
    key(y, 'Enter');
    expect(w2.log).toEqual([]);
  });

  test('本文欄 (rich-label-editor) で Enter → 確定、Shift+Enter は改行のまま、Esc → キャンセル', function() {
    var w = openModal('seq-modal', '<div id="seq-mod-label-rle"></div><button id="seq-mod-cancel">キャンセル</button><button id="seq-mod-confirm">確定</button>');
    var rle = RLE.mount(document.getElementById('seq-mod-label-rle'), '');
    var ta = rle.element;
    ta.value = 'request  ';
    var sh = key(ta, 'Enter', { shiftKey: true });
    expect(sh.defaultPrevented).toBe(false);
    expect(w.log).toEqual([]);
    key(ta, 'Enter');
    expect(w.log).toEqual(['confirm']);
    expect(rle.getValue()).toBe('request');
    expect(docEnter).toBe(0);
    var w2 = openModal('seq-modal', '<div id="seq-mod-label-rle"></div><button id="seq-mod-cancel">キャンセル</button><button id="seq-mod-confirm">確定</button>');
    var rle2 = RLE.mount(document.getElementById('seq-mod-label-rle'), '');
    key(rle2.element, 'Escape');
    expect(w2.log).toEqual(['cancel']);
  });

  test('閉じている窓の中のキーは何もしない', function() {
    var w = openModal('seq-modal', '<input id="z" type="text"><button id="seq-mod-cancel">キャンセル</button><button id="seq-mod-confirm">確定</button>');
    w.modal.style.display = 'none';
    key(document.getElementById('z'), 'Enter');
    expect(w.log).toEqual([]);
  });
});

describe('末尾に追加 (右パネルの {図種}-tail-detail)', function() {
  function tailForm(inner) {
    var p = document.getElementById('props-content');
    p.innerHTML = '<div id="cl-tail-detail">' + inner + '<button id="cl-tail-add">+ 追加</button></div>' +
      '<input id="outside" type="text">';
    var log = [];
    document.getElementById('cl-tail-add').addEventListener('click', function() { log.push('add'); });
    return log;
  }

  test('入力欄で Enter → 「+ 追加」を押す。フォームの外の欄では押さない', function() {
    var log = tailForm('<input id="cl-tail-alias" type="text">');
    key(document.getElementById('cl-tail-alias'), 'Enter');
    expect(log).toEqual(['add']);
    key(document.getElementById('outside'), 'Enter');
    expect(log).toEqual(['add']);
  });

  test('本文欄で Enter → 「+ 追加」、Shift+Enter / 修飾付きは押さない', function() {
    var log = tailForm('<div id="cl-tail-rle"></div>');
    var rle = RLE.mount(document.getElementById('cl-tail-rle'), '');
    key(rle.element, 'Enter', { shiftKey: true });
    expect(log).toEqual([]);
    key(rle.element, 'Enter');
    expect(log).toEqual(['add']);
  });

  test('候補の一覧などが先に Enter を扱った (preventDefault) ときは押さない', function() {
    var log = tailForm('<input id="st-tail-trig" type="text">');
    var el = document.getElementById('st-tail-trig');
    el.addEventListener('keydown', function(e) { if (e.key === 'Enter') e.preventDefault(); });
    key(el, 'Enter');
    expect(log).toEqual([]);
  });
});

forget();
global.window = prevWindow;
global.document = prevDocument;
