'use strict';
// BLK-junior-20260909-0203: 新規タブの雛形に一括追加すると、足したアクションが
// stop の後ろに落ちて別フローになり、Hello world と stop を別々に消して End を
// 足し直す手数が要った。末尾追加は流れの終端の手前に置き、雛形の Hello world は
// 最初のアクションを足した時点で落とす。
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

var TEMPLATE = actMod.template();

describe('新規タブの雛形への一括追加', function() {
  test('Hello world は消え、4 アクションが start と stop の間に並ぶ', function() {
    var out = actMod.addActions(TEMPLATE, 'クロック設定\nピン設定\nボーレート設定\n割り込み許可');
    expect(out.split('\n')).toEqual([
      '@startuml',
      'start',
      ':クロック設定;',
      ':ピン設定;',
      ':ボーレート設定;',
      ':割り込み許可;',
      'stop',
      '@enduml',
    ]);
  });
  test('単発の Action 追加でも雛形の Hello world は残らない', function() {
    var out = actMod.addAction(TEMPLATE, '初期化');
    expect(out.split('\n')).toEqual(['@startuml', 'start', ':初期化;', 'stop', '@enduml']);
  });
  test('空入力なら雛形はそのまま', function() {
    expect(actMod.addActions(TEMPLATE, '  \n\n')).toBe(TEMPLATE);
  });
});

describe('終端の手前に置く', function() {
  var WITH_STOP = ['@startuml', 'start', ':first;', 'stop', '@enduml'].join('\n');
  test('既存のアクションの後ろ・stop の前に入る', function() {
    expect(actMod.addActions(WITH_STOP, 'second\nthird').split('\n')).toEqual([
      '@startuml', 'start', ':first;', ':second;', ':third;', 'stop', '@enduml',
    ]);
  });
  test('終端が end でも同じ', function() {
    var t = ['@startuml', 'start', ':first;', 'end', '@enduml'].join('\n');
    expect(actMod.addAction(t, 'x')).toContain(':first;\n:x;\nend');
  });
  test('if / while / fork も終端の手前に対で入る', function() {
    expect(actMod.addIf(WITH_STOP, '認証成功?', 'yes', 'no').split('\n')).toEqual([
      '@startuml', 'start', ':first;',
      'if (認証成功?) then (yes)', 'else (no)', 'endif',
      'stop', '@enduml',
    ]);
    expect(actMod.addWhile(WITH_STOP, '未完?', 'yes')).toContain('while (未完?) is (yes)\nendwhile\nstop');
    expect(actMod.addFork(WITH_STOP, 2)).toContain('fork\nfork again\nend fork\nstop');
  });
  test('end fork は終端として扱わない', function() {
    var t = ['@startuml', 'start', 'fork', 'fork again', 'end fork', '@enduml'].join('\n');
    expect(actMod.addAction(t, 'x')).toContain('end fork\n:x;\n@enduml');
  });
  test('終端が無ければ従来どおり @enduml の直前', function() {
    var t = ['@startuml', 'start', '@enduml'].join('\n');
    expect(actMod.addAction(t, 'x').split('\n')).toEqual(['@startuml', 'start', ':x;', '@enduml']);
  });
  test('雛形に似ていても手を入れた図の行は落とさない', function() {
    var t = ['@startuml', 'start', ':Hello world;', ':既存;', 'stop', '@enduml'].join('\n');
    expect(actMod.addAction(t, 'x')).toContain(':Hello world;\n:既存;\n:x;\nstop');
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
