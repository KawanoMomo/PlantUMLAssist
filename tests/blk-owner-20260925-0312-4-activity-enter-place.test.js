'use strict';
// BLK-owner-20260925-0312-4: アクティビティ図の追加フォーム。
// - 処理欄だけ Enter が改行で確定しなかった (他の図種は「+ 追加 (Enter)」)。Enter で確定、Shift+Enter で改行にする。
// - 「フローのはじめの前 (L2)」と「フローのはじめ (L2)」が同じ行を指し、後者 (start の直後) を選ぶと
//   「フローの外に置けるのは…」と合わない理由で止めていた。start の直後はフローの先頭として置ける。
// - 開始・停止・終了はどこに書いても PlantUML が描くので止めず、流れの外や 2 つ目になるときは橙で知らせる。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body><div id="props"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;
var doc = dom.window.document;

var depPaths = [
  '../src/core/html-utils.js',
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/core/selection.js',
  '../src/core/selection-reorder.js',
  '../src/core/swimlane-move.js',
  '../src/core/activity-insert.js',
  '../src/core/history.js',
  '../src/core/tail-kind-chips.js',
  '../src/ui/properties.js',
  '../src/ui/modal-keys.js',
  '../src/modules/activity.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var MA = dom.window.MA;
var ac = MA.modules.plantumlActivity;
var AI = MA.activityInsert;

var FLOW = ['@startuml', 'start', ':受信;', 'stop', '@enduml'].join('\n');

function place(dsl, re) {
  var list = ac.tailPlaceOptions(dsl);
  for (var i = 0; i < list.length; i++) if (re.test(list[i].label.trim())) return list[i];
  throw new Error('no place ' + re + ' in ' + list.map(function(p) { return p.label; }).join(' | '));
}

function render(dsl) {
  var host = doc.getElementById('props');
  host.innerHTML = '';
  var state = { dsl: dsl };
  var ctx = {
    getMmdText: function() { return state.dsl; },
    setMmdText: function(t) { state.dsl = t; },
    onUpdate: function() { ac.renderProps([], ac.parse(state.dsl), host, ctx); },
  };
  MA.reuseModal = MA.reuseModal || { buttonHtml: function() { return ''; }, bindButton: function() {} };
  ac.renderProps([], ac.parse(dsl), host, ctx);
  return { host: host, text: function() { return state.dsl; } };
}

function key(el, opts) {
  var ev = new dom.window.KeyboardEvent('keydown', Object.assign({ key: 'Enter', bubbles: true, cancelable: true }, opts || {}));
  el.dispatchEvent(ev);
  return ev;
}

describe('追加する位置: start の前と直後を呼び分け、直後はフローの先頭として置ける', function() {
  test('同じ L2 の 2 つは「start の前」「start の直後」', function() {
    var labels = ac.tailPlaceOptions(FLOW).map(function(p) { return p.label.trim(); });
    expect(labels).toContain('start の前 (フローの外) (L2)');
    expect(labels).toContain('start の直後 (L2)');
    expect(labels.join('|')).not.toContain('フローのはじめ');
    expect(labels).toContain('stop の後 (フローの外) (L4)');
  });

  test('start の直後にはアクションも分岐も置け、start の直後の行に入る', function() {
    var after = place(FLOW, /^start の直後/);
    expect(ac.tailKindAllowed(FLOW, after, 'action')).toBe(true);
    expect(ac.tailKindAllowed(FLOW, after, 'if')).toBe(true);
    var out = ac.addFromTailForm(FLOW, after, 'action', { text: 'クロック有効化' }).split('\n');
    expect(out.slice(1, 4)).toEqual(['start', ':クロック有効化;', ':受信;']);
  });

  test('start の前はフローの外。理由はその位置の名前で言う', function() {
    var before = place(FLOW, /^start の前/);
    expect(ac.tailKindAllowed(FLOW, before, 'action')).toBe(false);
    var why = ac.tailPlaceReason(before);
    expect(why).toContain('「start の前」はフローの外です');
    expect(why).toContain('開始・停止・終了');
  });
});

describe('開始・停止・終了は止めず、流れの外や 2 つ目になるときは知らせる', function() {
  test('図の末尾に start: 止めない。stop の後に入ることを知らせる', function() {
    var tail = ac.tailPlaceOptions(FLOW)[0];
    expect(ac.tailKindAllowed(FLOW, tail, 'start')).toBe(true);
    var w = ac.tailKindWarning(FLOW, tail, 'start');
    expect(w).toContain('start はもう 2 行目にあります');
  });

  test('start の無い図で stop の後に start を置くと、stop の後だと知らせる', function() {
    var src = ['@startuml', ':A;', 'stop', '@enduml'].join('\n');
    var out = src.replace('stop\n', 'stop\nstart\n');
    expect(AI.placementWarning(src, out, 'start')).toContain('stop (3 行目) の後に入ります');
  });

  test('start の無い図で頭に start を置くのは知らせない', function() {
    var src = ['@startuml', 'title T', ':A;', 'stop', '@enduml'].join('\n');
    var out = src.replace('title T\n', 'title T\nstart\n');
    expect(AI.placementWarning(src, out, 'start')).toBe('');
  });

  test('stop は分岐の中なら知らせない。末尾で 2 つ目の終わりになるときは知らせる', function() {
    var src = ['@startuml', 'start', 'if (ok?) then (yes)', ':A;', 'else (no)', ':B;', 'endif', 'stop', '@enduml'].join('\n');
    var inBranch = src.replace(':B;\n', ':B;\nstop\n');
    expect(AI.placementWarning(src, inBranch, 'stop')).toBe('');
    var tail = ac.tailPlaceOptions(src)[0];
    expect(ac.tailKindAllowed(src, tail, 'stop')).toBe(true);
    expect(ac.tailKindWarning(src, tail, 'stop')).toContain('stop (8 行目) の後に入ります');
    expect(ac.tailKindWarning(src, tail, 'end')).toContain('stop (8 行目) の後に入ります');
  });

  test('start の前に stop を置くと知らせる (止めない)', function() {
    var before = place(FLOW, /^start の前/);
    expect(ac.tailKindAllowed(FLOW, before, 'stop')).toBe(true);
    expect(ac.tailKindWarning(FLOW, before, 'stop')).toContain('start (2 行目) より前に入ります');
  });

  test('フォーム: 図の末尾で開始を選ぶと橙の知らせが出て、押せるまま', function() {
    var r = render(FLOW);
    var sel = r.host.querySelector('#ac-tail-kind');
    sel.value = 'start';
    sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    var warn = r.host.querySelector('#ac-tail-where-warn');
    expect(warn.style.display).toBe('block');
    expect(warn.textContent).toContain('2 つ目の開始');
    expect(r.host.querySelector('#ac-tail-add').disabled).toBe(false);
  });
});

describe('処理欄は Enter で確定、Shift+Enter で改行', function() {
  test('処理欄は data-enter="submit" の欄で、見出しがキーを言う', function() {
    var r = render(FLOW);
    var ta = r.host.querySelector('#ac-tail-text');
    expect(ta.getAttribute('data-enter')).toBe('submit');
    expect(r.host.textContent).toContain('Enter で追加 / Shift+Enter で改行');
  });

  test('Enter で 1 行入る (stop の前)', function() {
    var r = render(FLOW);
    var ta = r.host.querySelector('#ac-tail-text');
    ta.value = 'Spi_Init';
    var ev = key(ta);
    expect(ev.defaultPrevented).toBe(true);
    var lines = r.text().split('\n');
    expect(lines.indexOf(':Spi_Init;')).toBe(lines.indexOf('stop') - 1);
  });

  test('Shift+Enter と変換中の Enter は確定しない', function() {
    var r = render(FLOW);
    var ta = r.host.querySelector('#ac-tail-text');
    ta.value = 'A';
    key(ta, { shiftKey: true });
    key(ta, { isComposing: true });
    expect(r.text()).toBe(FLOW);
  });

  test('種別を替えて戻っても、打ちかけの処理は消えない', function() {
    var r = render(FLOW);
    r.host.querySelector('#ac-tail-text').value = 'クロック有効化';
    var sel = r.host.querySelector('#ac-tail-kind');
    sel.value = 'if';
    sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    sel.value = 'action';
    sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    expect(r.host.querySelector('#ac-tail-text').value).toBe('クロック有効化');
  });
});

global.window = prevWindow;
global.document = prevDocument;
