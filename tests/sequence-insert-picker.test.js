'use strict';
// BLK-primary-20260907-0356 (design 5c): プレビュー上の挿入ガイドから開くメニューが
// 「メッセージ / note / alt / loop / activate / その他」を提示し、DSL の何行目に
// 入るかを示す。純粋部分 (種別一覧・行番号計算・実挿入) を機械判定する。
// sequence-insert-anchor.test.js と同じ理由で自前の jsdom window を用意する。
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
  '../src/core/sequence-marks.js',
  '../src/modules/sequence.js',
];
SRC.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} require(p); });

var seq = window.MA.modules.plantumlSequence;

SRC.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });

var SAMPLE = [
  '@startuml',
  'actor User',
  'participant System',
  '',
  'User -> System : Request',
  'System --> User : Response',
  '@enduml',
].join('\n');

describe('insertKindOptions (BLK-primary-20260907-0356)', function() {
  // BLK-builder-20260907-1250-2: 6 つ目は 5c どおり「その他（区切り線 / 遅延 / 参照）」の
  // 見出しになり、block はその下位メニュー otherInsertKinds() へ移った。
  test('5c が挙げる 6 種別をこの順で提示する', function() {
    var vals = seq.insertKindOptions().map(function(o) { return o.value; });
    expect(vals).toEqual(['message', 'note', 'alt', 'loop', 'activation', 'other']);
  });

  test('「その他」の下位メニューは 区切り線 / 遅延 / 参照 とブロックを並べる', function() {
    var vals = seq.otherInsertKinds().map(function(o) { return o.value; });
    expect(vals).toEqual(['separator', 'delay', 'ref', 'block']);
  });

  test('各種別に日本語ラベルと DSL の例が付く', function() {
    seq.insertKindOptions().forEach(function(o) {
      expect(typeof o.label).toBe('string');
      expect(o.label.length > 0).toBe(true);
      expect(o.hint.length > 0).toBe(true);
    });
  });
});

describe('insertTargetLine / describeInsertTarget', function() {
  test('after は アンカー行の次の行に入る', function() {
    expect(seq.insertTargetLine(5, 'after')).toBe(6);
  });

  test('before は アンカー行そのものに入る', function() {
    expect(seq.insertTargetLine(5, 'before')).toBe(5);
  });

  test('行番号が解決できないときは null', function() {
    expect(seq.insertTargetLine(null, 'after')).toBeNull();
  });

  test('説明文が挿入先の行番号を含む', function() {
    expect(seq.describeInsertTarget(5, 'after')).toContain('6 行目');
    expect(seq.describeInsertTarget(5, 'before')).toContain('5 行目');
  });
});

describe('挿入位置への構造ブロック / activate の書き込み', function() {
  test('alt を L5 の後に入れると opener と end が 6 行目以降に入る', function() {
    var out = seq.insertAfter(SAMPLE, 5, 'block', { kind: 'alt', label: '成功時' });
    var lines = out.split('\n');
    expect(lines[5]).toBe('alt 成功時');
    expect(lines[7]).toBe('end');
    // アンカー行は動かない
    expect(lines[4]).toBe('User -> System : Request');
  });

  test('loop も同じ経路で入る', function() {
    var out = seq.insertAfter(SAMPLE, 5, 'block', { kind: 'loop', label: '3 回' });
    expect(out.split('\n')[5]).toBe('loop 3 回');
  });

  test('activate を L5 の後に入れる', function() {
    var out = seq.insertAfter(SAMPLE, 5, 'activation', { action: 'activate', target: 'System' });
    expect(out.split('\n')[5]).toBe('activate System');
  });

  test('before は アンカー行の直前に入る', function() {
    var out = seq.insertBefore(SAMPLE, 5, 'activation', { action: 'activate', target: 'System' });
    var lines = out.split('\n');
    expect(lines[4]).toBe('activate System');
    expect(lines[5]).toBe('User -> System : Request');
  });

  test('必須 props が欠けた挿入は 1 文字も変えない', function() {
    expect(seq.insertAfter(SAMPLE, 5, 'activation', { action: 'activate' })).toBe(SAMPLE);
    expect(seq.insertAfter(SAMPLE, 5, 'block', {})).toBe(SAMPLE);
  });
});
