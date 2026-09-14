'use strict';
// design 5d: Activity の分岐ラベルを右ペインのフォームで直す (prompt を使わない)。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/modules/activity.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var actMod = global.window.MA.modules.plantumlActivity;

var TEXT = [
  '@startuml',
  'start',
  'if (認証成功?) then (yes)',
  '  :続行;',
  'elseif (再試行可?) then (maybe)',
  '  :再試行;',
  'else (no)',
  '  :中断;',
  'endif',
  'stop',
  '@enduml',
].join('\n');

describe('updateBranch', function() {
  test('if 行は条件とラベルを同時に書き換えられる', function() {
    var out = actMod.updateBranch(TEXT, 3, { condition: '認証OK?', label: 'ok' });
    expect(out.split('\n')[2]).toBe('if (認証OK?) then (ok)');
  });

  test('渡さなかった側は今の値を残す', function() {
    var onlyLabel = actMod.updateBranch(TEXT, 3, { label: 'ok' });
    expect(onlyLabel.split('\n')[2]).toBe('if (認証成功?) then (ok)');
    var onlyCond = actMod.updateBranch(TEXT, 3, { condition: '認証OK?' });
    expect(onlyCond.split('\n')[2]).toBe('if (認証OK?) then (yes)');
  });

  test('elseif 行も条件とラベルを書き換えられる', function() {
    var out = actMod.updateBranch(TEXT, 5, { condition: '残り回数あり?', label: 'retry' });
    expect(out.split('\n')[4]).toBe('elseif (残り回数あり?) then (retry)');
  });

  test('else 行はラベルだけ。condition を渡しても無視する', function() {
    var out = actMod.updateBranch(TEXT, 7, { condition: '無視', label: 'それ以外' });
    expect(out.split('\n')[6]).toBe('else (それ以外)');
  });

  test('インデントを保つ', function() {
    var t = '@startuml\nstart\n  if (a?) then (yes)\n  endif\nstop\n@enduml';
    var out = actMod.updateBranch(t, 3, { label: 'ある' });
    expect(out.split('\n')[2]).toBe('  if (a?) then (ある)');
  });

  test('分岐でない行・範囲外の行では元のまま返す', function() {
    expect(actMod.updateBranch(TEXT, 4, { label: 'x' })).toBe(TEXT);
    expect(actMod.updateBranch(TEXT, 999, { label: 'x' })).toBe(TEXT);
  });

  test('パーサの branches の line をそのまま渡せる', function() {
    var parsed = actMod.parse(TEXT);
    var ifNode = parsed.nodes.filter(function(n) { return n.kind === 'if'; })[0];
    var labels = ifNode.branches.map(function(b) { return b.kind + ':' + b.label; });
    expect(labels).toEqual(['then:yes', 'elseif:maybe', 'else:no']);
    var out = TEXT;
    ifNode.branches.forEach(function(b) {
      out = actMod.updateBranch(out, b.line, { label: b.kind.toUpperCase() });
    });
    var reparsed = actMod.parse(out);
    var ifNode2 = reparsed.nodes.filter(function(n) { return n.kind === 'if'; })[0];
    expect(ifNode2.branches.map(function(b) { return b.label; }))
      .toEqual(['THEN', 'ELSEIF', 'ELSE']);
    expect(ifNode2.condition).toBe('認証成功?');
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
