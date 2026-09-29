'use strict';
// BLK-owner-20260930-0311-2: 「末尾に追加」の欄の振る舞いを 6 図種で揃える (src/ui/modal-keys.js の 1 か所)。
//   - 注釈の本文欄 (`{図種}-tail-ntext`) は Enter で確定・Shift+Enter で改行 (状態遷移・クラス・ユースケースは改行が入るだけだった)
//   - 既定の値を持つ欄 (条件分岐の yes / no など) は、入ると値全体が選ばれ、打てば置き換わる (`yesyes` にならない)
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body>' +
  '<div id="props-content"></div>' +
  '</body></html>');
global.window = dom.window;
global.document = dom.window.document;

var SRC = ['../src/ui/modal-keys.js'];
function forget() { SRC.forEach(function(r) { delete require.cache[require.resolve(r)]; }); }
forget();
SRC.forEach(function(r) { require(r); });
var MK = window.MA.modalKeys;

function key(el, k, opts) {
  var o = Object.assign({ key: k, bubbles: true, cancelable: true }, opts || {});
  var ev = new window.KeyboardEvent('keydown', o);
  el.dispatchEvent(ev);
  return ev;
}
// 右パネルの「末尾に追加」を 1 つ描き、押された回数を数える。
function tailForm(prefix, inner) {
  var props = document.getElementById('props-content');
  props.innerHTML = '<div id="' + prefix + '-tail-detail">' + inner + '<button id="' + prefix + '-tail-add">+ 追加</button></div>';
  var log = { adds: 0 };
  document.getElementById(prefix + '-tail-add').addEventListener('click', function() { log.adds++; });
  return log;
}

describe('注釈の本文欄は図種を問わず Enter で確定', function() {
  ['st', 'cl', 'uc', 'ac'].forEach(function(p) {
    test(p + '-tail-ntext: Enter で「+ 追加」を押し、Shift+Enter は改行のまま', function() {
      var log = tailForm(p, '<textarea id="' + p + '-tail-ntext"></textarea>');
      var area = document.getElementById(p + '-tail-ntext');
      var sh = key(area, 'Enter', { shiftKey: true });
      expect(log.adds).toBe(0);
      expect(sh.defaultPrevented).toBe(false);
      var ev = key(area, 'Enter');
      expect(log.adds).toBe(1);
      expect(ev.defaultPrevented).toBe(true);
    });
  });
  test('まとめて入れる欄 (1 行 1 件) は Enter で改行のまま', function() {
    var log = tailForm('st', '<textarea id="st-tail-bulk"></textarea>');
    var ev = key(document.getElementById('st-tail-bulk'), 'Enter');
    expect(log.adds).toBe(0);
    expect(ev.defaultPrevented).toBe(false);
  });
  test('変換中 (IME) の Enter では確定しない', function() {
    var log = tailForm('cl', '<textarea id="cl-tail-ntext"></textarea>');
    key(document.getElementById('cl-tail-ntext'), 'Enter', { isComposing: true });
    expect(log.adds).toBe(0);
  });
  test('末尾に追加の外にある同じ名前の欄は対象にしない', function() {
    document.getElementById('props-content').innerHTML = '<textarea id="st-tail-ntext"></textarea>';
    expect(MK.isTailEnterArea(document.getElementById('st-tail-ntext'))).toBe(false);
  });
});

describe('既定の値を持つ欄は、入ると値全体が選ばれる', function() {
  function focus(el) {
    el.focus();
    el.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
  }
  test('条件分岐の yes / no: 既定のままなら全体が選ばれ、打てば置き換わる', function() {
    tailForm('ac', '<input id="ac-tail-cond" type="text" value="" placeholder="例: 認証成功?">' +
      '<input id="ac-tail-thenlbl" type="text" value="yes"><input id="ac-tail-elselbl" type="text" value="no">');
    var th = document.getElementById('ac-tail-thenlbl');
    focus(th);
    expect([th.selectionStart, th.selectionEnd]).toEqual([0, 3]);
    var el = document.getElementById('ac-tail-elselbl');
    focus(el);
    expect([el.selectionStart, el.selectionEnd]).toEqual([0, 2]);
  });
  test('空の欄・打ちかけの欄はキャレットを動かさない', function() {
    tailForm('ac', '<input id="ac-tail-cond" type="text" value=""><input id="ac-tail-thenlbl" type="text" value="yes">');
    var cond = document.getElementById('ac-tail-cond');
    expect(MK.isDefaultField(cond)).toBe(false);
    var th = document.getElementById('ac-tail-thenlbl');
    th.value = 'yes (正常)';
    expect(MK.isDefaultField(th)).toBe(false);
  });
  test('どの図種の末尾に追加でも同じ (枝の数・既定のラベル)', function() {
    tailForm('st', '<input id="st-tail-bcount" type="text" value="2">');
    expect(MK.isDefaultField(document.getElementById('st-tail-bcount'))).toBe(true);
    tailForm('seq', '<input id="seq-tail-alias" type="text" value="">');
    expect(MK.isDefaultField(document.getElementById('seq-tail-alias'))).toBe(false);
  });
  test('押して入ったときは、ボタンを離した時の選択の解除を 1 回だけ止める', function() {
    tailForm('ac', '<input id="ac-tail-thenlbl" type="text" value="yes">');
    var th = document.getElementById('ac-tail-thenlbl');
    focus(th);
    var up = new window.MouseEvent('mouseup', { bubbles: true, cancelable: true });
    th.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    var up2 = new window.MouseEvent('mouseup', { bubbles: true, cancelable: true });
    th.dispatchEvent(up2);
    expect(up2.defaultPrevented).toBe(false);
  });
});

forget();
global.window = prevWindow;
global.document = prevDocument;
