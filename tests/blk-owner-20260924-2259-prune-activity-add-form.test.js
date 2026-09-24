'use strict';
// BLK-owner-20260924-2259-prune: アクティビティ図の追加ペインのフォームは 1 つ。
// 「末尾に追加」と「＋ この位置に挿入」が縦に 2 つ並び、同じ要素を別の名前で書いていたので、
// 位置は他の図種と同じ「追加する位置」(既定は図の末尾) で選ぶ形に畳んだ。
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
  '../src/modules/activity.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var MA = dom.window.MA;
var ac = MA.modules.plantumlActivity;

var MIN = ['@startuml', 'start', ':Hello world;', 'stop', '@enduml'].join('\n');
var FLOW = ['@startuml', 'start', ':受信;', ':解析;', 'stop', '@enduml'].join('\n');

function place(dsl, label) {
  var list = ac.tailPlaceOptions(dsl);
  for (var i = 0; i < list.length; i++) if (list[i].label.trim() === label) return list[i];
  throw new Error('no place ' + label + ' in ' + list.map(function(p) { return p.label; }).join(' | '));
}

describe('追加する位置の候補', function() {
  test('先頭は「図の末尾」、続けて挿入位置が構造の言葉で並ぶ', function() {
    var labels = ac.tailPlaceOptions(FLOW).map(function(p) { return p.label.trim(); });
    expect(labels[0]).toBe('図の末尾');
    expect(labels).toContain('フローのはじめの前 (L2)');
    expect(labels.join('|')).toContain('アクション「受信」の後');
    expect(labels.join('|')).not.toContain('@startuml');
  });

  test('図の末尾には何でも置ける。フローの外にはアクションは置けず、レーンは置ける', function() {
    var tail = ac.tailPlaceOptions(FLOW)[0];
    expect(ac.tailKindAllowed(FLOW, tail, 'action')).toBe(true);
    var outside = place(FLOW, 'フローのはじめの前 (L2)');
    expect(ac.tailKindAllowed(FLOW, outside, 'action')).toBe(false);
    expect(ac.tailKindAllowed(FLOW, outside, 'swimlane')).toBe(true);
    var inside = ac.tailPlaceOptions(FLOW).filter(function(p) { return /「受信」の後/.test(p.label); })[0];
    expect(ac.tailKindAllowed(FLOW, inside, 'other', 'break')).toBe(true);
  });
});

describe('1 つのフォームで末尾にも途中にも足せる', function() {
  test('図の末尾: アクションは stop の前 (従来の末尾に追加と同じ)', function() {
    var tail = ac.tailPlaceOptions(FLOW)[0];
    var out = ac.addFromTailForm(FLOW, tail, 'action', { text: '応答' }).split('\n');
    expect(out.indexOf(':応答;')).toBe(out.indexOf('stop') - 1);
  });

  test('途中: 「受信」の後を選ぶと、if / else / endif が対でそこに入る', function() {
    var at = ac.tailPlaceOptions(FLOW).filter(function(p) { return /「受信」の後/.test(p.label); })[0];
    var out = ac.addFromTailForm(FLOW, at, 'if', { cond: 'ok?', thenLabel: 'yes', elseLabel: 'no' }).split('\n');
    expect(out[3]).toBe('if (ok?) then (yes)');
    expect(out.indexOf('else (no)')).toBeGreaterThan(3);
    expect(out.indexOf('endif')).toBeLessThan(out.indexOf(':解析;'));
  });

  test('下のフォームにしか無かった要素 (注釈・中断) も同じフォームから足せる', function() {
    var tail = ac.tailPlaceOptions(FLOW)[0];
    var withNote = ac.addFromTailForm(FLOW, tail, 'note', { text: '補足' });
    expect(withNote).toContain('note right : 補足');
    var at = ac.tailPlaceOptions(FLOW).filter(function(p) { return /「受信」の後/.test(p.label); })[0];
    var withBreak = ac.addFromTailForm(FLOW, at, 'other', { sub: 'break' }).split('\n');
    expect(withBreak[3].trim()).toBe('break');
  });

  test('各行を一括追加: 途中の位置でも書いた順に並ぶ', function() {
    var at = ac.tailPlaceOptions(FLOW).filter(function(p) { return /「受信」の後/.test(p.label); })[0];
    var out = ac.addActionsFromTailForm(FLOW, at, 'A\nB\nC').split('\n').map(function(l) { return l.trim(); });
    expect(out.slice(2, 7)).toEqual([':受信;', ':A;', ':B;', ':C;', ':解析;']);
  });
});

describe('追加ペインの形', function() {
  function render(dsl) {
    var host = doc.getElementById('props');
    host.innerHTML = '';
    var ctx = { getMmdText: function() { return dsl; }, setMmdText: function(t) { dsl = t; }, onUpdate: function() {} };
    MA.reuseModal = MA.reuseModal || { buttonHtml: function() { return ''; }, bindButton: function() {} };
    ac.renderProps([], ac.parse(dsl), host, ctx);
    return { host: host, text: function() { return dsl; } };
  }

  test('フォームは 1 つで、「＋ この位置に挿入」の 2 つ目のフォームは無い', function() {
    var r = render(MIN);
    expect(r.host.querySelector('#ac-tail-where')).not.toBe(null);
    expect(r.host.querySelector('#ac-ins-point')).toBe(null);
    expect(r.host.querySelector('#ac-ins-do')).toBe(null);
    expect(r.host.textContent).not.toContain('この位置に挿入');
    expect(r.host.querySelector('#ac-tail-add').textContent).toBe('+ 追加');
  });

  test('欄の見出しは日本語 (条件 / yes のラベル / no のラベル)', function() {
    var r = render(MIN);
    var sel = r.host.querySelector('#ac-tail-kind');
    sel.value = 'if';
    sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    var t = r.host.textContent;
    expect(t).toContain('条件');
    expect(t).toContain('yes のラベル');
    expect(t).toContain('no のラベル');
    expect(t).not.toContain('Condition');
    expect(t).not.toContain('Then label');
  });
});

global.window = prevWindow;
global.document = prevDocument;
