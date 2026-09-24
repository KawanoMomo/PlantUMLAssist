'use strict';
// BLK-builder-20260924-1252-3 / design 4b「Activity — 途中に挿入」の Action パネル。
// 上から 見出し (Action · N 行目 / 名前) → ラベル → スイムレーン → 位置 → この位置に挿入 →
// ノートを添える → ↑ ↓ → 削除 / Delete の順に並び、見出しと欄の名前は日本語 (英語併記) にそろう。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
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
  '../src/ui/properties.js',
  '../src/modules/activity.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var acMod = dom.window.MA.modules.plantumlActivity;

var FLAT = [
  '@startuml',            // 1
  'start',                // 2
  ':一つ目;',             // 3
  ':二つ目;',             // 4
  ':三つ目;',             // 5
  'stop',                 // 6
  '@enduml',              // 7
].join('\n');

var NESTED = [
  '@startuml',            // 1
  'start',                // 2
  'if (有効?) then (yes)', // 3
  '  :保存する;',          // 4
  '  :通知する;',          // 5
  'else (no)',            // 6
  '  :エラーを返す;',      // 7
  'endif',                // 8
  'stop',                 // 9
  '@enduml',              // 10
].join('\n');

// Action を 1 つ選んで右ペインを実際に描く。返り値から DSL と選択の行を読める。
function renderAction(text, line) {
  var parsed = acMod.parse(text);
  var node = null;
  (function walk(nodes) {
    if (!nodes) return;
    nodes.forEach(function(n) {
      if (n.line === line) node = n;
      if (n.branches) n.branches.forEach(function(b) { walk(b.body); });
      if (n.body) walk(n.body);
    });
  })(parsed.nodes);
  if (!node) throw new Error(line + ' 行目のアクションが見つかりません');
  // 同じ id が複数残ると querySelector('#id') が別の host のものを掴む。
  doc.body.innerHTML = '';
  var host = doc.createElement('div');
  doc.body.appendChild(host);
  var current = text;
  acMod.renderProps(
    [{ type: 'action', id: node.id, line: node.line }],
    parsed, host,
    {
      getMmdText: function() { return current; },
      setMmdText: function(t) { current = t; },
      onUpdate: function() {},
    });
  return { host: host, text: function() { return current; } };
}


var NOTED = [
  '@startuml',            // 1
  'start',                // 2
  ':入力を受け取る;',      // 3
  'if (有効?) then (yes)', // 4
  '  :保存する;',          // 5
  '  note right: 上書き',  // 6
  'else (no)',            // 7
  '  :エラーを返す;',      // 8
  'endif',                // 9
  'stop',                 // 10
  '@enduml',              // 11
].join('\n');

function pos(host, sel) {
  var el = host.querySelector(sel);
  if (!el) throw new Error(sel + ' が右パネルに無い');
  var all = Array.prototype.slice.call(host.querySelectorAll('*'));
  return all.indexOf(el);
}

describe('Action の右パネルの並びと名前 (design 4b)', function() {
  test('見出しは「Action · N 行目」と選んだアクションの名前', function() {
    var r = renderAction(NESTED, 4);
    expect(r.host.querySelector('#ac-action-head').textContent).toContain('Action · 4 行目');
    expect(r.host.querySelector('#ac-action-name').textContent).toBe('保存する');
    expect(r.host.textContent).not.toContain('Action (L4)');
  });

  test('本文の欄は「ラベル / Label」で、Text とは名乗らない', function() {
    var r = renderAction(NESTED, 4);
    expect(r.host.querySelector('#ac-action-label').textContent).toContain('ラベル / Label');
    expect(r.host.querySelector('#ac-action-text').value).toBe('保存する');
  });

  test('上から ラベル → スイムレーン → 位置 → この位置に挿入 → ノートを添える → ↑ ↓ → 削除', function() {
    var r = renderAction(NESTED, 4);
    var order = ['#ac-action-head', '#ac-action-text', '#ac-swimlane', '#ac-action-place',
      '#ac-insert-before', '#ac-add-note-btn', '#ac-move-up', '#ac-action-delete'];
    var at = order.map(function(s) { return pos(r.host, s); });
    for (var i = 1; i < at.length; i++) expect(at[i]).toBeGreaterThan(at[i - 1]);
  });

  test('ノートの入口は「ノートを添える」、削除は「削除 / Delete」', function() {
    var r = renderAction(NESTED, 4);
    expect(r.host.querySelector('#ac-add-note-btn').textContent).toBe('ノートを添える');
    expect(r.host.querySelector('#ac-action-delete').textContent).toBe('削除 / Delete');
    expect(r.host.textContent).not.toContain('Note 追加');
    expect(r.host.textContent).not.toContain('Notes');
  });

  test('添えてあるノートは 編集 / 削除 で直せる', function() {
    var r = renderAction(NOTED, 5);
    var row = r.host.querySelector('.ac-note-row');
    expect(row).not.toBe(null);
    expect(row.textContent).toContain('上書き');
    expect(r.host.querySelector('#ac-note-edit-0').textContent).toBe('編集');
    expect(r.host.querySelector('#ac-note-del-0').textContent).toBe('削除');
    r.host.querySelector('#ac-note-del-0').click();
    expect(r.text()).not.toContain('上書き');
  });

  test('「ノートを添える」で右か左を選んで本文を書くと、そのアクションの後ろに note が入る', function() {
    var r = renderAction(NESTED, 4);
    r.host.querySelector('#ac-add-note-btn').click();
    expect(r.host.querySelector('#ac-add-note-form').textContent).toContain('置く側');
    r.host.querySelector('#ac-new-ntext').value = '上書きする';
    r.host.querySelector('#ac-new-nadd').click();
    var lines = r.text().split('\n');
    expect(lines[4]).toContain('上書きする');
    expect(lines[4]).toContain('note right');
  });

  test('見出しの名前は複数行のラベルを 1 行に畳む', function() {
    expect(acMod.actionPanelHeading({ line: 6, text: '受信して\n保存する' }))
      .toEqual({ kind: 'Action · 6 行目', name: '受信して 保存する' });
  });
});

global.window = prevWindow;
global.document = prevDocument;
