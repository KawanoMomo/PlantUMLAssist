'use strict';
// BLK-reviewer-20260908-0103 (1903 追記) — /verify-svg の differ 誤判定。
//
// 保存済み SVG と描き直した SVG で、ラベルも図形数も完全一致しているのに
// 生バイト比較 (ヘッダ属性・XML 宣言の書式の違い) で status: 'differ' になり、
// reviewer は毎回 labels/shape を目で見比べて「実は一致」と判定し直していた。
// server は differ-format / differ-content に分けるので、GUI 側は
// 体裁だけの差を「ずれ」と呼ばず、作り直しの対象にもしない。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;

try { delete require.cache[require.resolve('../src/core/svg-freshness.js')]; } catch (e) {}
require('../src/core/svg-freshness.js');
var SF = global.window.MA.svgFreshness;

var NEW = '2026-09-08T00:06:00Z';
var OLD = '2026-09-07T08:10:00Z';

// 印 (svgSource) が無く、確かめた控え (records) だけがある図。
function entry(name, result) {
  return { name: name, mtime: NEW, svgMtime: OLD, hash: 'p1', svgHash: 's1' };
}
function recs(result) {
  return { a: { pumlHash: 'p1', svgHash: 's1', result: result } };
}

describe('svg-freshness — 体裁だけの差を「ずれ」と呼ばない', function() {

  test("differ-format は content: 'format'", function() {
    expect(SF.contentOf(entry('a'), recs('differ-format'))).toBe('format');
  });

  test("differ-content は content: 'differ'", function() {
    expect(SF.contentOf(entry('a'), recs('differ-content'))).toBe('differ');
  });

  test('古い形の differ だけを返す server でも、これまでどおり「ずれ」と読む', function() {
    expect(SF.contentOf(entry('a'), recs('differ'))).toBe('differ');
    expect(SF.contentOf(entry('a'), recs('match'))).toBe('match');
    expect(SF.contentOf(entry('a'), recs('なにか'))).toBe('unverified');
  });

  test('体裁差も「描き直してのバイト比較」で出した答えである', function() {
    expect(SF.contentBasisOf(entry('a'), recs('differ-format'))).toBe('rerender');
  });

  test('一致と体裁差はどちらも「作り直さなくても読める」', function() {
    expect(SF.isSettled('match')).toBe(true);
    expect(SF.isSettled('format')).toBe(true);
    expect(SF.isSettled('differ')).toBe(false);
    expect(SF.isSettled('unverified')).toBe(false);
    expect(SF.isSettled('missing')).toBe(false);
  });

  test('体裁差の図は作り直しの対象にしない (needsRender / needsProof に入らない)', function() {
    var scanned = SF.scan([entry('a')], recs('differ-format'));
    expect(scanned.rows[0].content).toBe('format');
    expect(scanned.needsRender).toEqual([]);
    expect(scanned.needsProof).toEqual([]);
    // 中身を調べ直す対象でもない (食い違っていないので調べることが無い)
    expect(scanned.needsDiff).toEqual([]);
  });

  test('内容ずれの図はこれまでどおり作り直しの対象になる', function() {
    var scanned = SF.scan([entry('a')], recs('differ-content'));
    expect(scanned.needsRender).toEqual(['a']);
    expect(scanned.needsDiff).toEqual(['a']);
  });

  test('体裁差の印は、なぜ作り直さなくてよいかを言う', function() {
    var b = SF.contentBadge('format', 'rerender');
    expect(b.mark).toBe('体裁差のみ');
    expect(b.title).toContain('文字・図形の数');
    expect(b.title).toContain('作り直さなくても読めます');
    expect(b.title).toContain('根拠: 描き直してのバイト比較');
  });

  test('要約は体裁差を「ずれ」に混ぜず、追いついている枚数に数える', function() {
    var scanned = SF.scan([entry('a')], recs('differ-format'));
    expect(SF.contentSummary(scanned)).toBe(
      '内容: 1 枚とも今の puml から作られています（うち 1 枚は体裁だけが違う）');
    expect(SF.summary(scanned)).toContain('追いついています');
  });

  test('ずれが混ざるときは、体裁差を別の数として並べる', function() {
    var entries = [entry('a'), { name: 'b', mtime: NEW, svgMtime: OLD, hash: 'p2', svgHash: 's2' }];
    var records = {
      a: { pumlHash: 'p1', svgHash: 's1', result: 'differ-format' },
      b: { pumlHash: 'p2', svgHash: 's2', result: 'differ-content' },
    };
    var scanned = SF.scan(entries, records);
    expect(scanned.contentCounts.format).toBe(1);
    expect(scanned.contentCounts.differ).toBe(1);
    expect(SF.contentSummary(scanned)).toBe('内容: 体裁差のみ 1 枚 / ずれ 1 枚');
    // 直す対象は「ずれ」の 1 枚だけ
    expect(scanned.needsRender).toEqual(['b']);
  });

  test('体裁差の図は「SVG が古い」の名前にも出さない', function() {
    var groups = SF.shortfall(SF.scan([entry('a')], recs('differ-format')));
    expect(groups).toEqual([]);
  });
});

global.window = prevWindow;
global.document = prevDocument;
