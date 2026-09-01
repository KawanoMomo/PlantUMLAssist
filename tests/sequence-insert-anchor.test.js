'use strict';
// FEAT-001: 挿入 modal の From を、アンカー行 (挿入位置が指すメッセージ) の from で初期選択する。
// 受入条件 [AC-1] / [AC-2] (issues/FEAT-001.md 2026-09-01T10:34 追記) を機械判定する。
// 先行する selection.test.js / rich-label.test.js が global.window を自前の jsdom に
// 差し替えたまま復元しないため、run-tests.js の sandbox.window.MA はこの時点で参照できない。
// sequence-overlay.test.js と同じパターンで自前の window を用意し、必要な source を再登録する。
var jsdom = require('jsdom');


var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var SRC = [
  '../src/core/html-utils.js',
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js',
  '../src/core/dsl-updater.js',
  '../src/core/text-updater.js',
  '../src/core/parser-utils.js',
  '../src/ui/properties.js',
  '../src/modules/sequence.js',
];
// 後続テスト (sequence-overlay.test.js 等) が自前の window へ再登録できるよう、
// require キャッシュを前後で落とす。
SRC.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} require(p); });

var seq = window.MA.modules.plantumlSequence;
var props = window.MA.properties;
// global.window は復元しない。source の IIFE 内クロージャが呼出時に global.window を
// 参照するため、復元すると依存 (parserUtils / htmlUtils) を見失う。
// 後続テストは sequence-overlay.test.js 同様、自前の window を張り直す。
SRC.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });

var SAMPLE = [
  '@startuml',
  'title Sample Sequence',
  'actor User',
  'participant System',
  'database DB',
  '',
  'User -> System : Request',
  'System -> DB : Query',
  'DB --> System : Result',
  '@enduml',
].join('\n');

describe('resolveAnchor (FEAT-001)', function() {
  test('L8 の System -> DB : Query をアンカーとして解決する', function() {
    var parsed = seq.parseSequence(SAMPLE);
    var anchor = seq.resolveAnchor(parsed, 8);
    expect(anchor.from).toBe('System');
    expect(anchor.to).toBe('DB');
  });

  test('message が無い行 (participant 宣言行) では null を返す', function() {
    var parsed = seq.parseSequence(SAMPLE);
    expect(seq.resolveAnchor(parsed, 3)).toBeNull();
  });

  test('[AC-2] 範囲外の行番号でも例外を投げず null を返す', function() {
    var parsed = seq.parseSequence(SAMPLE);
    expect(function() { seq.resolveAnchor(parsed, 999); }).not.toThrow();
    expect(seq.resolveAnchor(parsed, 999)).toBeNull();
  });

  test('[AC-2] parsed が空でも例外を投げず null を返す', function() {
    expect(seq.resolveAnchor(seq.parseSequence(''), 1)).toBeNull();
    expect(seq.resolveAnchor(null, 1)).toBeNull();
  });
});

describe('withSelected (FEAT-001)', function() {
  var OPTS = [
    { value: 'User', label: 'User' },
    { value: 'System', label: 'System' },
    { value: 'DB', label: 'DB' },
    { value: '__new__', label: '+ 新規追加…' },
  ];

  test('[AC-1] 一致する option だけが selected: true になる', function() {
    var r = seq.withSelected(OPTS, 'System');
    expect(r[0].selected).toBe(false);
    expect(r[1].selected).toBe(true);
    expect(r[2].selected).toBe(false);
    expect(r[3].selected).toBe(false);
  });

  test('[AC-2] アンカー不在 (null) では selected が 1件も立たない', function() {
    var r = seq.withSelected(OPTS, null);
    var n = 0;
    for (var i = 0; i < r.length; i++) if (r[i].selected) n++;
    expect(n).toBe(0);
  });

  test('value / label を保存し、元配列を破壊しない', function() {
    var r = seq.withSelected(OPTS, 'DB');
    expect(r[3].value).toBe('__new__');
    expect(r[3].label).toBe('+ 新規追加…');
    expect(OPTS[2].selected).toBe(undefined);
  });

  test('selectFieldHtml が selected 付き option を出力する', function() {
    var html = props.selectFieldHtml('From', 'seq-mod-from', seq.withSelected(OPTS, 'System'));
    expect(html).toContain('<option value="System" selected>');
    expect(html).toContain('<option value="User">');
  });
});
