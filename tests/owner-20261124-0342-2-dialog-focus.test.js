'use strict';
// TICKET-owner-20261124-0342-2: 「保存先のフォルダを選ぶ」の窓 (#target-pick) と「この図の履歴」の窓 (#vt-modal) は、
// 開いても手が窓に入らなかった (BODY)。窓の手の置き場は src/ui/modal-keys.js の 1 か所 (focusIntoModal) で当て、
// 窓を開く所はその場と後始末の後 (focusModalSoon) に呼ぶ。実マウスの確かめは tests/scenarios/owner-20261124-0342-2.spec.js。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><head><style>' +
  '#target-pick { position: fixed; display: flex; }' +
  '</style></head><body>' +
  '<button id="behind">FILES の行</button>' +
  '<div id="vt-modal" style="display:none;"><div id="vt-modal-content">' +
  '<select id="vt-file" aria-label="図を選ぶ"><option>a</option></select>' +
  '<label><input type="checkbox" id="vt-only-revisit"> 往復した版だけ</label>' +
  '<button id="vt-forget">この図の履歴を消す</button><button id="vt-close">閉じる</button>' +
  '</div></div>' +
  '</body></html>');
global.window = dom.window;
global.document = dom.window.document;

var SRC = ['../src/ui/modal-keys.js'];
function forget() { SRC.forEach(function(r) { delete require.cache[require.resolve(r)]; }); }
forget();
SRC.forEach(function(r) { require(r); });
var MK = window.MA.modalKeys;

// openChangeTarget が作る窓と同じ並び (display は書かず CSS で出す。押せない「このフォルダを保存先にする」が先に来る)。
function makeTargetPick() {
  var old = document.getElementById('target-pick');
  if (old) old.parentNode.removeChild(old);
  var m = document.createElement('div');
  m.id = 'target-pick';
  m.innerHTML = '<div class="target-pick-box">' +
    '<button id="target-pick-up" disabled>↑ 親へ</button>' +
    '<button id="target-pick-here-ok" disabled>このフォルダを保存先にする</button>' +
    '<div id="target-pick-list"></div>' +
    '<div class="target-pick-row"><input type="text" id="target-pick-path">' +
    '<button id="target-pick-ok">保存先にする</button><button id="target-pick-cancel">やめる</button></div></div>';
  document.body.appendChild(m);
  return m;
}

describe('窓を開いたら手が窓の最初の欄に入る (TICKET-owner-20261124-0342-2)', function() {
  test('「保存先のフォルダを選ぶ」の窓: 背後の行に手があっても、パスの欄に手を置く', function() {
    document.getElementById('behind').focus();
    var m = makeTargetPick();
    expect(MK.isShown(m)).toBe(true);
    expect(MK.focusModalSoon(m)).toBe(true);
    expect(document.activeElement.id).toBe('target-pick-path');
  });

  test('作る窓 (display を書かない) は、外した後・CSS で隠れている間は開いていない', function() {
    var m = makeTargetPick();
    m.parentNode.removeChild(m);
    document.getElementById('behind').focus();
    expect(MK.isShown(m)).toBe(false);
    expect(MK.focusIntoModal(m)).toBe(false);
    expect(document.activeElement.id).toBe('behind');
    var hidden = document.createElement('div');
    hidden.hidden = true;
    hidden.innerHTML = '<input type="text">';
    document.body.appendChild(hidden);
    expect(MK.isShown(hidden)).toBe(false);
    document.body.removeChild(hidden);
  });

  test('「この図の履歴」の窓: 開くと図の選び (最初の操作できる部品) に手を置く。閉じている間は置かない', function() {
    var vt = document.getElementById('vt-modal');
    document.getElementById('behind').focus();
    expect(MK.focusModalSoon(vt)).toBe(false);
    expect(document.activeElement.id).toBe('behind');
    vt.style.display = 'flex';
    expect(MK.focusModalSoon(vt)).toBe(true);
    expect(document.activeElement.id).toBe('vt-file');
    // 窓の中に手があれば動かさない
    document.getElementById('vt-forget').focus();
    expect(MK.focusIntoModal(vt)).toBe(false);
    expect(document.activeElement.id).toBe('vt-forget');
    vt.style.display = 'none';
  });
});

describe('窓を開く所が手を窓に置く (src/app.js)', function() {
  var APP = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  function body(name) {
    var i = APP.indexOf('function ' + name + '(');
    var j = APP.indexOf('\nfunction ', i + 1);
    return APP.slice(i, j);
  }
  test('openChangeTarget は窓を作った後に focusModalSoon で手を置く (押せない「このフォルダを保存先にする」に置かない)', function() {
    var b = body('openChangeTarget');
    expect(b).toContain('focusModalSoon(m)');
    expect(b).not.toContain('hereOk.focus()');
  });
  test('toggleVersionTimeline は開くときに focusModalSoon で手を置く', function() {
    expect(body('toggleVersionTimeline')).toContain('focusModalSoon(modal)');
  });
});

forget();
global.window = prevWindow;
global.document = prevDocument;
