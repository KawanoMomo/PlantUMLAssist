'use strict';
// TICKET-owner-20261122-0301-1: 挿入の窓 (「↓ この後に注釈追加」等) が開いても手が背後のボタンに残り、Esc でも閉じなかった。
// 窓の手の置き場と Esc を src/ui/modal-keys.js の 1 か所で扱う:
//   - 窓が開いたら (中身を差し替えたときも) 手が窓の外なら最初の欄 (本文欄 → 文字欄 → 選ぶ欄 → ボタン。キャンセルは除く) に置く
//   - 手が窓の外にあっても Esc は開いている窓のキャンセルを押し、document の Esc (選択を外す) へは流さない
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body>' +
  '<button id="behind">↓ この後に注釈追加</button>' +
  '<div id="seq-modal" style="display:none;"><div id="seq-modal-content"></div></div>' +
  '<div id="act-modal" style="display:none;"><div id="act-modal-content"></div></div>' +
  '</body></html>');
global.window = dom.window;
global.document = dom.window.document;

var SRC = ['../src/core/html-utils.js', '../src/core/label-colors.js', '../src/ui/modal-keys.js', '../src/ui/rich-label-editor.js'];
function forget() { SRC.forEach(function(r) { delete require.cache[require.resolve(r)]; }); }
forget();
SRC.forEach(function(r) { require(r); });
var MK = window.MA.modalKeys;

function openModal(id, inner) {
  var m = document.getElementById(id);
  document.getElementById(id + '-content').innerHTML = inner;
  m.style.display = 'flex';
  var log = [];
  var ng = m.querySelector('[id$="-cancel"]');
  if (ng) ng.addEventListener('click', function() { log.push('cancel'); m.style.display = 'none'; });
  return { modal: m, log: log };
}
function closeAll() {
  ['seq-modal', 'act-modal'].forEach(function(id) { document.getElementById(id).style.display = 'none'; });
}

describe('挿入の窓の手の置き場 (TICKET-owner-20261122-0301-1)', function() {
  test('注釈の窓: 背後のボタンに手があっても、本文欄に手を置く (位置・相手の選ぶ欄より本文)', function() {
    closeAll();
    document.getElementById('behind').focus();
    var w = openModal('seq-modal', '<select id="seq-mod-npos"><option>over</option></select>' +
      '<div id="seq-mod-ntext-rle"></div><button id="seq-mod-cancel">キャンセル</button><button id="seq-mod-confirm">確定</button>');
    window.MA.richLabelEditor.mount(document.getElementById('seq-mod-ntext-rle'), '');
    expect(MK.focusIntoModal(w.modal)).toBe(true);
    expect(document.activeElement.className).toBe('rle-textarea');
    expect(w.modal.contains(document.activeElement)).toBe(true);
  });

  test('文字欄が無ければ選ぶ欄、それも無ければ最初のボタン (キャンセルには置かない)', function() {
    closeAll();
    var w = openModal('seq-modal', '<select id="seq-mod-aact"><option>activate</option></select><button id="seq-mod-cancel">キャンセル</button>');
    MK.focusIntoModal(w.modal);
    expect(document.activeElement.id).toBe('seq-mod-aact');
    closeAll();
    var w2 = openModal('act-modal', '<button id="act-pick-cancel">キャンセル</button><button id="act-pick-note">注釈</button>');
    MK.focusIntoModal(w2.modal);
    expect(document.activeElement.id).toBe('act-pick-note');
  });

  test('開いた側が窓の中に手を置いていれば動かさない', function() {
    closeAll();
    var w = openModal('seq-modal', '<input id="seq-mod-stereotype" type="text"><div id="seq-mod-label-rle"></div><button id="seq-mod-cancel">x</button>');
    window.MA.richLabelEditor.mount(document.getElementById('seq-mod-label-rle'), '');
    document.getElementById('seq-mod-stereotype').focus();
    expect(MK.focusIntoModal(w.modal)).toBe(false);
    expect(document.activeElement.id).toBe('seq-mod-stereotype');
  });

  test('閉じている窓には手を置かない', function() {
    closeAll();
    document.getElementById('behind').focus();
    expect(MK.focusIntoModal(document.getElementById('seq-modal'))).toBe(false);
    expect(document.activeElement.id).toBe('behind');
  });

  test('手が窓の外でも Esc 1 回で開いている窓のキャンセルを押し、document の Esc へは流さない', function() {
    closeAll();
    var docEsc = 0;
    var onDoc = function(e) { if (e.key === 'Escape') docEsc++; };
    document.addEventListener('keydown', onDoc);
    try {
      var w = openModal('seq-modal', '<textarea id="t"></textarea><button id="seq-mod-cancel">キャンセル</button>');
      document.getElementById('behind').focus();
      var ev = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      document.getElementById('behind').dispatchEvent(ev);
      expect(w.log).toEqual(['cancel']);
      expect(w.modal.style.display).toBe('none');
      expect(ev.defaultPrevented).toBe(true);
      expect(docEsc).toBe(0);
      // 窓が無ければ document の Esc はそのまま (選択を外す等)。
      var ev2 = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      document.getElementById('behind').dispatchEvent(ev2);
      expect(ev2.defaultPrevented).toBe(false);
      expect(docEsc).toBe(1);
    } finally { document.removeEventListener('keydown', onDoc); }
  });
});

forget();
global.window = prevWindow;
global.document = prevDocument;
