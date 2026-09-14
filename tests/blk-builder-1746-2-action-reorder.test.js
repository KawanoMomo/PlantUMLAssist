'use strict';
// BLK-builder-20260907-1746-2 / design 4b「Activity — 途中に挿入」の Action パネルに
// 並ぶ「↑ ↓」。これは挿入 (↑ 前に / ↓ 後に) ではなく、選んでいるアクションを
// **同じ親の中で**前後の兄弟と入れ替えるボタンである。
//
// ここでは
//   - Action の右ペインに #ac-move-up / #ac-move-down が出ること
//   - 押すと同じ親の中で入れ替わり、選択が動いた先の行に付いて行くこと
//   - 親の先頭 / 末尾では disabled になり、押しても DSL が 1 バイトも変わらないこと
//   - if の中のアクションが else や endif を越えて外へ出ないこと
// を検証する。
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

describe('Action の右ペインの「↑ ↓」(design 4b)', function() {
  test('並び替えのボタンが両方出る', function() {
    var r = renderAction(FLAT, 4);
    expect(r.host.querySelector('#ac-move-up')).not.toBe(null);
    expect(r.host.querySelector('#ac-move-down')).not.toBe(null);
    expect(r.host.textContent).toContain('並び替え');
  });

  test('↓ で次の兄弟と入れ替わる', function() {
    var r = renderAction(FLAT, 4);
    r.host.querySelector('#ac-move-down').click();
    expect(r.text().split('\n')[3]).toBe(':三つ目;');
    expect(r.text().split('\n')[4]).toBe(':二つ目;');
  });

  test('↑ で前の兄弟と入れ替わる', function() {
    var r = renderAction(FLAT, 4);
    r.host.querySelector('#ac-move-up').click();
    expect(r.text().split('\n')[2]).toBe(':二つ目;');
    expect(r.text().split('\n')[3]).toBe(':一つ目;');
  });

  test('入れ替えた後の選択は動いた先の行に付いて行く', function() {
    var r = renderAction(FLAT, 4);
    r.host.querySelector('#ac-move-down').click();
    var sel = dom.window.MA.selection.getSelected();
    expect(sel.length).toBe(1);
    expect(sel[0].line).toBe(5);
  });

  test('親の先頭では ↑ が、末尾では ↓ が押せない', function() {
    var head = renderAction(FLAT, 3);
    expect(head.host.querySelector('#ac-move-up').disabled).toBe(true);
    expect(head.host.querySelector('#ac-move-down').disabled).toBe(false);
    var tail = renderAction(FLAT, 5);
    expect(tail.host.querySelector('#ac-move-down').disabled).toBe(true);
    expect(tail.host.querySelector('#ac-move-up').disabled).toBe(false);
  });

  test('押せない側を押しても DSL は変わらない', function() {
    var head = renderAction(FLAT, 3);
    head.host.querySelector('#ac-move-up').click();
    expect(head.text()).toBe(FLAT);
  });

  test('if の yes 側の中だけで入れ替わる', function() {
    var r = renderAction(NESTED, 4);
    r.host.querySelector('#ac-move-down').click();
    var lines = r.text().split('\n');
    expect(lines[3].trim()).toBe(':通知する;');
    expect(lines[4].trim()).toBe(':保存する;');
    expect(lines[5]).toBe('else (no)');
  });

  test('yes 側の末尾のアクションは else を越えて外へ出ない', function() {
    var r = renderAction(NESTED, 5);
    expect(r.host.querySelector('#ac-move-down').disabled).toBe(true);
    r.host.querySelector('#ac-move-down').click();
    expect(r.text()).toBe(NESTED);
  });

  test('else 側の 1 件だけのアクションはどちらにも動かない', function() {
    var r = renderAction(NESTED, 7);
    expect(r.host.querySelector('#ac-move-up').disabled).toBe(true);
    expect(r.host.querySelector('#ac-move-down').disabled).toBe(true);
  });
});

global.window = prevWindow;
global.document = prevDocument;
