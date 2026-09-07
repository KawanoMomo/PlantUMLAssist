'use strict';
// BLK-builder-20260907-1324-3 (design 4b「Activity — 途中に挿入」):
// 図の隙間をクリックすると小さなメニューが開き、そこに置けるものだけが並ぶ。
// よく置くものが 1 段目、repeat / break / detach / kill は「その他」の 2 段目。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/activity-insert.js')]; } catch (e) {}
require('../src/core/activity-insert.js');
var AI = global.window.MA.activityInsert;

var SAMPLE = [
  '@startuml',
  'title Sample Activity',
  'start',
  ':入力を受け取る;',
  'if (有効?) then (yes)',
  ':保存する;',
  'else (no)',
  ':エラーを返す;',
  'endif',
  'stop',
  '@enduml',
].join('\n');

function kindsOf(list) {
  return list.map(function(k) { return k.kind; });
}

describe('BLK-builder-1324 挿入メニューの並び', function() {
  test('フロー本体では 1 段目が仕様 4b の 6 種で、順序も仕様どおり', function() {
    var g = AI.pickerKinds(SAMPLE, 6);   // :保存する; の後
    expect(kindsOf(g.primary)).toEqual(['action', 'if', 'while', 'fork', 'note', 'swimlane']);
  });

  test('残りの repeat / break / detach / kill は 2 段目に畳まれる', function() {
    var g = AI.pickerKinds(SAMPLE, 6);
    expect(kindsOf(g.other)).toEqual(['repeat', 'break', 'detach', 'kill']);
  });

  test('1 段目と 2 段目を合わせると、その位置に置ける要素と過不足なく一致する', function() {
    var g = AI.pickerKinds(SAMPLE, 6);
    var all = kindsOf(g.primary).concat(kindsOf(g.other)).sort();
    var allowed = kindsOf(AI.allowedKinds(SAMPLE, 6)).sort();
    expect(all).toEqual(allowed);
  });

  test('メニューには置けないものが出ない (フローの外ではレーンだけ)', function() {
    // 2 行目 = title。start より前なのでフローの外。start / stop は既にあるので候補から落ちる。
    var g = AI.pickerKinds(SAMPLE, 2);
    expect(kindsOf(g.primary)).toEqual(['swimlane']);
    expect(g.other.length).toBe(0);
  });

  test('start / stop の無い図では、フローの外でも start / stop を置ける', function() {
    var noStart = '@startuml\ntitle T\n:A;\n@enduml';
    var g = AI.pickerKinds(noStart, 2);
    expect(kindsOf(g.primary).indexOf('start')).toBeGreaterThan(-1);
    expect(kindsOf(g.primary).indexOf('stop')).toBeGreaterThan(-1);
  });
});

describe('BLK-builder-1324 メニューの見出し', function() {
  test('どの行のどちら側に入るかを本文つきで示す', function() {
    expect(AI.describePoint(SAMPLE, 6, 'after')).toBe('6 行目「:保存する;」の後');
    expect(AI.describePoint(SAMPLE, 6, 'before')).toBe('6 行目「:保存する;」の前');
  });

  test('空行や範囲外の行でも行番号だけで示す', function() {
    expect(AI.describePoint('@startuml\n\n@enduml', 2, 'after')).toBe('2 行目の後');
    expect(AI.describePoint(SAMPLE, 99, 'after')).toBe('99 行目の後');
  });
});
