'use strict';
// BLK-owner-20260926-0550-1: 「末尾に追加」で確定した後も、次の 1 件を欄を押し直さずに打てる。
//   - 確定で右パネルが描き直されたら、Enter を押した欄 (ボタンで確定したときはその種別の最初に打つ欄) へキャレットを戻す
//   - 描き直されなかった確定 (必須が空で止めた・To を選ばせた) ではキャレットを動かさない
//   - アクティビティの「追加する位置」は確定後も足した行の後 (図の末尾に戻さない)
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body><div id="props-content"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// setTimeout を手で進める (run-tests は同期で回すので、描き直しの後の focus を待てない)。
var _queue = [];
var _realSetTimeout = global.setTimeout;
global.setTimeout = function(fn) { _queue.push(fn); return _queue.length; };
function flush() {
  var guard = 0;
  while (_queue.length && guard++ < 200) _queue.shift()();
}

var SRC = ['../src/ui/modal-keys.js'];
SRC.forEach(function(r) { try { delete require.cache[require.resolve(r)]; } catch (e) {} require(r); });
var MK = window.MA.modalKeys;

function key(el, k) {
  var ev = new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
}

// 右パネルの「末尾に追加」。onAdd が true を返したら (確定できたら) 右パネルを描き直す。
function tailForm(prefix, inner, onAdd) {
  var props = document.getElementById('props-content');
  function draw() {
    props.innerHTML = '<div id="' + prefix + '-tail-detail">' + inner
      + '<button id="' + prefix + '-tail-add">+ 追加</button></div>';
    document.getElementById(prefix + '-tail-add').addEventListener('click', function() {
      if (!onAdd || onAdd()) draw();
    });
  }
  draw();
}

describe('確定した後のキャレット', function() {
  test('名前欄で Enter → 描き直された同じ名前欄にキャレットが戻る (続けて打てる)', function() {
    var names = [];
    tailForm('seq', '<select id="seq-tail-ptype"><option>participant</option></select>'
      + '<input id="seq-tail-alias" type="text"><input id="seq-tail-plabel" type="text">', function() {
      names.push(document.getElementById('seq-tail-alias').value);
      return true;
    });
    var alias = document.getElementById('seq-tail-alias');
    alias.focus();
    alias.value = 'Dev';
    key(alias, 'Enter');
    flush();
    var again = document.getElementById('seq-tail-alias');
    expect(names).toEqual(['Dev']);
    expect(again === alias).toBe(false);
    expect(document.activeElement === again).toBe(true);
  });

  test('確定から描き直しまでの間に古い欄へ打った字は、描き直した欄へ持ち越す (打った字を落とさない)', function() {
    tailForm('seq', '<input id="seq-tail-alias" type="text">', function() { return true; });
    var alias = document.getElementById('seq-tail-alias');
    alias.focus();
    alias.value = 'Dev';
    key(alias, 'Enter');
    // 描き直しの後、キャレットが戻る前に古い欄へ「Op」と打った形を作る。
    var again = document.getElementById('seq-tail-alias');
    alias.value = 'DevOp';
    flush();
    expect(document.activeElement === again).toBe(true);
    expect(again.value).toBe('Op');
  });

  test('本文欄 (rich-label-editor) の Enter → 描き直された本文欄に戻る', function() {
    tailForm('seq', '<input id="seq-tail-stereotype" type="text">'
      + '<div id="seq-tail-label-rle"><textarea></textarea></div>', function() { return true; });
    var ta = document.querySelector('#seq-tail-label-rle textarea');
    ta.focus();
    ta.dispatchEvent(new window.CustomEvent('rle-enter', { bubbles: true }));
    flush();
    var again = document.querySelector('#seq-tail-label-rle textarea');
    expect(again === ta).toBe(false);
    expect(document.activeElement === again).toBe(true);
  });

  test('「+ 追加」をマウスで押して確定 → その種別の最初に打つ欄 (本文欄があれば本文)', function() {
    tailForm('st', '<select id="st-tail-from"><option>A</option></select>'
      + '<input type="hidden" id="st-tail-x" value="1">'
      + '<input id="st-tail-name" type="text">', function() { return true; });
    document.getElementById('st-tail-add').click();
    flush();
    expect(document.activeElement === document.getElementById('st-tail-name')).toBe(true);
  });

  test('確定できず描き直されなかったとき (To を選ばせた) はキャレットを動かさない', function() {
    tailForm('cl', '<select id="cl-tail-to"><option value="">（一覧で相手を選ぶ）</option></select>'
      + '<input id="cl-tail-rlabel" type="text">', function() {
      document.getElementById('cl-tail-to').focus();
      return false;
    });
    var lbl = document.getElementById('cl-tail-rlabel');
    lbl.focus();
    key(lbl, 'Enter');
    flush();
    expect(document.activeElement === document.getElementById('cl-tail-to')).toBe(true);
  });

  test('最初に打つ欄: 隠した欄・チェックボックス・伏せた枠の中は飛ばす', function() {
    var props = document.getElementById('props-content');
    props.innerHTML = '<div id="uc-tail-detail">'
      + '<input type="checkbox" id="uc-tail-c">'
      + '<div style="display:none"><input id="uc-tail-hidden" type="text"></div>'
      + '<input id="uc-tail-alias" type="text"></div>';
    var el = MK.firstTypingField(document.getElementById('uc-tail-detail'));
    expect(el && el.id).toBe('uc-tail-alias');
  });
});

describe('アクティビティ: 確定後も「追加する位置」は足した行の後', function() {
  var depPaths = [
    '../src/core/html-utils.js', '../src/core/dsl-utils.js', '../src/core/regex-parts.js',
    '../src/core/line-resolver.js', '../src/core/text-updater.js', '../src/core/dsl-updater.js',
    '../src/core/parser-utils.js', '../src/core/props-renderer.js', '../src/core/overlay-builder.js',
    '../src/core/selection.js', '../src/core/selection-reorder.js', '../src/core/swimlane-move.js',
    '../src/core/activity-insert.js', '../src/core/history.js', '../src/core/tail-kind-chips.js',
    '../src/ui/properties.js', '../src/modules/activity.js',
  ];
  depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} require(p); });
  var ac = window.MA.modules.plantumlActivity;
  var FLOW = ['@startuml', 'start', 'if (設定成功?) then (yes)', ':送信;', 'else (no)', ':再試行;', 'endif', 'stop', '@enduml'].join('\n');

  function placeByLabel(dsl, re) {
    var list = ac.tailPlaceOptions(dsl);
    for (var i = 0; i < list.length; i++) if (re.test(list[i].label)) return list[i];
    throw new Error('no place ' + re + ' in ' + list.map(function(p) { return p.label; }).join(' | '));
  }

  test('分岐の no 側のはじめに 1 つ足すと、次の位置はその行の後 (同じ枝に 2 つ目を続けて足せる)', function() {
    var place = placeByLabel(FLOW, /no/);
    var out = ac.addFromTailForm(FLOW, place, 'action', { text: 'エラー通知' });
    var next = ac.placeAfterAdd(FLOW, out, place);
    expect(next === 'tail').toBe(false);
    var p2 = ac.tailPlaceOptions(out).filter(function(p) { return p.value === next; })[0];
    var out2 = ac.addFromTailForm(out, p2, 'action', { text: '記録' });
    var lines = out2.split('\n');
    expect(lines.indexOf(':記録;')).toBe(lines.indexOf(':エラー通知;') + 1);
    expect(lines.indexOf(':エラー通知;') > lines.indexOf('else (no)')).toBe(true);
    expect(lines.indexOf(':記録;') < lines.indexOf('endif')).toBe(true);
  });

  test('図の末尾で足したら図の末尾のまま', function() {
    var tail = ac.tailPlaceOptions(FLOW)[0];
    var out = ac.addFromTailForm(FLOW, tail, 'action', { text: '終わり' });
    expect(ac.placeAfterAdd(FLOW, out, tail)).toBe('tail');
  });
});

global.setTimeout = _realSetTimeout;
global.window = prevWindow;
global.document = prevDocument;
