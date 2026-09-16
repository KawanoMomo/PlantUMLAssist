'use strict';
// BLK-human-20260912-0901: activate / deactivate の帯があるシーケンス図で、
// 途中挿入が帯を壊さないことを機械判定する。
//   - trigger のメッセージと `activate` の間に矢印を割り込ませない
//   - 帯の内側への挿入は `deactivate` より前に入る
//   - 帯の外への挿入は `deactivate` より後に入る
// sequence-insert-picker.test.js と同じ理由で自前の jsdom window を用意する。
var jsdom = require('jsdom');

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var SRC = [
  '../src/core/html-utils.js',
  '../src/core/dsl-utils.js', '../src/core/note-edit.js',
  '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js',
  '../src/core/dsl-updater.js',
  '../src/core/text-updater.js',
  '../src/core/parser-utils.js',
  '../src/ui/properties.js',
  '../src/core/sequence-marks.js',
  '../src/core/sequence-activation-insert.js',
  '../src/core/sequence-participant-zone.js',
  '../src/modules/sequence.js',
];
SRC.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} require(p); });

var AI = window.MA.sequenceActivationInsert;
var seq = window.MA.modules.plantumlSequence;

SRC.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });

//  1 @startuml
//  2 participant A
//  3 participant B
//  4 A -> B : req      ← 帯の trigger
//  5 activate B
//  6 B -> B : work
//  7 deactivate B
//  8 B --> A : res
//  9 @enduml
var BAND = [
  '@startuml',
  'participant A',
  'participant B',
  'A -> B : req',
  'activate B',
  'B -> B : work',
  'deactivate B',
  'B --> A : res',
  '@enduml',
].join('\n');

describe('parseBands', function() {
  test('activate / deactivate の対と trigger のメッセージ行を拾う', function() {
    var bands = AI.parseBands(BAND);
    expect(bands.length).toBe(1);
    expect(bands[0].target).toBe('B');
    expect(bands[0].activateLine).toBe(5);
    expect(bands[0].deactivateLine).toBe(7);
    expect(bands[0].triggerLine).toBe(4);
    expect(bands[0].implicitEnd).toBe(false);
  });

  test('同じ participant の入れ子を内側から閉じる', function() {
    var t = ['@startuml', 'activate B', 'activate B', 'deactivate B', 'deactivate B', '@enduml'].join('\n');
    var bands = AI.parseBands(t);
    expect(bands.length).toBe(2);
    expect(bands[0].activateLine).toBe(2);
    expect(bands[0].deactivateLine).toBe(5);
    expect(bands[1].activateLine).toBe(3);
    expect(bands[1].deactivateLine).toBe(4);
  });

  test('閉じ忘れの帯は @enduml までの帯として扱う', function() {
    var t = ['@startuml', 'A -> B : req', 'activate B', 'B --> A : res', '@enduml'].join('\n');
    var bands = AI.parseBands(t);
    expect(bands.length).toBe(1);
    expect(bands[0].deactivateLine).toBe(5);
    expect(bands[0].implicitEnd).toBe(true);
  });

  test('対応する activate が無い deactivate は帯にしない', function() {
    expect(AI.parseBands(['@startuml', 'deactivate B', '@enduml'].join('\n')).length).toBe(0);
  });
});

describe('resolve — 帯の内側', function() {
  test('trigger メッセージの直後は activate を飛び越して帯の中に入る', function() {
    var r = AI.resolve(BAND, 4, 'after');
    expect(r.target).toBe(6);
    expect(r.zone).toBe('inside');
    expect(r.part).toBe('B');
    expect(r.moved).toBe(true);
  });

  test('帯の中のメッセージの後は deactivate の前に入る', function() {
    var r = AI.resolve(BAND, 6, 'after');
    expect(r.target).toBe(7);
    expect(r.zone).toBe('inside');
  });

  test('deactivate の前を指したときも帯の中に入る', function() {
    var r = AI.resolve(BAND, 7, 'before');
    expect(r.target).toBe(7);
    expect(r.zone).toBe('inside');
  });

  test('activate の直後は帯の中の先頭に入る', function() {
    expect(AI.resolve(BAND, 5, 'after').target).toBe(6);
  });
});

describe('resolve — 帯の外側', function() {
  test('deactivate の後は帯の外に入る', function() {
    var r = AI.resolve(BAND, 7, 'after');
    expect(r.target).toBe(8);
    expect(r.zone).toBe('outside');
  });

  test('activate の前は帯に入らない', function() {
    var r = AI.resolve(BAND, 5, 'before');
    expect(r.target).toBe(5);
    expect(r.zone).toBe('outside');
  });

  test('帯の外から帯の内側の行を指したら deactivate の後ろへ送る', function() {
    // participant 宣言 (3 行目) の直後 = 4 行目。そこは帯の外だが、after の
    // 走査で activate を飛ばすと帯の中に落ちるので、帯を抜けた 8 行目にする。
    var t = ['@startuml', 'participant A', 'participant B', 'activate B', 'B -> B : work', 'deactivate B', '@enduml'].join('\n');
    var r = AI.resolve(t, 3, 'after');
    expect(r.target).toBe(7);
    expect(r.zone).toBe('outside');
  });

  test('帯と無関係な位置は zone: none で行をずらさない', function() {
    var r = AI.resolve(BAND, 2, 'before');
    expect(r.target).toBe(2);
    expect(r.zone).toBe('none');
    expect(r.moved).toBe(false);
  });

  test('行番号が数でなければ null', function() {
    expect(AI.resolve(BAND, 'x', 'after')).toBe(null);
  });
});

describe('zoneLabel', function() {
  test('内側 / 外側と participant を返し、無関係なら空', function() {
    expect(AI.zoneLabel(AI.resolve(BAND, 6, 'after'))).toBe('帯の内側 · B');
    expect(AI.zoneLabel(AI.resolve(BAND, 7, 'after'))).toBe('帯の外側 · B');
    expect(AI.zoneLabel(AI.resolve(BAND, 2, 'before'))).toBe('');
    expect(AI.zoneLabel(null)).toBe('');
  });
});

describe('sequence module の挿入行 (帯あり)', function() {
  test('insertTargetLine は text を渡すと帯を避けた行を返す', function() {
    expect(seq.insertTargetLine(4, 'after', BAND)).toBe(6);
    expect(seq.insertTargetLine(7, 'after', BAND)).toBe(8);
    // text 無しは従来どおりの素朴な前/後
    expect(seq.insertTargetLine(4, 'after')).toBe(5);
  });

  test('describeInsertGuide がガイド線に帯の内外を出す', function() {
    expect(seq.describeInsertGuide(4, 'after', BAND)).toBe('+ DSL 6 行目に挿入（帯の内側 · B）');
    expect(seq.describeInsertGuide(7, 'after', BAND)).toBe('+ DSL 8 行目に挿入（帯の外側 · B）');
    expect(seq.describeInsertGuide(2, 'before', BAND)).toBe('+ DSL 2 行目に挿入');
  });

  test('describeInsertTarget も帯の内外を添える', function() {
    expect(seq.describeInsertTarget(4, 'after', BAND)).toBe('DSL 6 行目に挿入（4 行目の後） · 帯の内側 · B');
  });
});
