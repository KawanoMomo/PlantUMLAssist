'use strict';
// BLK-reviewer-20260908-0103 (1403 追記): 「内容: 一致 N 枚」が何を見た答えなのかが
// 画面に無く、同じ判定を自分でやろうとすると /render の応答 (印が付かない) と
// 保存中の svg をバイト比較して全件ずれに見える。判定の根拠を持ち回り、画面で言う。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var window = global.window;
try { delete require.cache[require.resolve('../src/core/svg-freshness.js')]; } catch (e) {}
require('../src/core/svg-freshness.js');
var SF = window.MA.svgFreshness;

var OLD = '2026-09-07T08:10:00Z';
var NEW = '2026-09-08T00:06:00Z';
var H1 = 'a'.repeat(40);
var H2 = 'b'.repeat(40);

// 印 (svgSource) を持つ図。
function stamped(name, stamp) {
  return { name: name, mtime: NEW, svgMtime: OLD, hash: H1, svgSource: stamp, svgHash: 'sv1' };
}
// 印を持たない図。描き直して比べた控え (records) でしか言えない。
function unstamped(name) {
  return { name: name, mtime: NEW, svgMtime: OLD, hash: H1, svgHash: 'sv1' };
}

describe('svgFreshness.contentBasisOf — 内容判定の根拠', function() {
  test('印があれば印の突合', function() {
    expect(SF.contentBasisOf(stamped('a', H1))).toBe('stamp');
    expect(SF.contentBasisOf(stamped('a', H2))).toBe('stamp');
  });
  test('印が無く、控えが今の指紋と合っていれば描き直しての比較', function() {
    var rec = { b: { pumlHash: H1, svgHash: 'sv1', result: 'match' } };
    expect(SF.contentBasisOf(unstamped('b'), rec)).toBe('rerender');
  });
  test('控えが古ければ根拠なし (未確認に戻る)', function() {
    var rec = { b: { pumlHash: H2, svgHash: 'sv1', result: 'match' } };
    expect(SF.contentBasisOf(unstamped('b'), rec)).toBe('');
    expect(SF.contentOf(unstamped('b'), rec)).toBe('unverified');
  });
  test('svg が無ければ根拠なし', function() {
    expect(SF.contentBasisOf({ name: 'c', mtime: NEW, hash: H1 })).toBe('');
  });
});

describe('svgFreshness — 根拠を行と要約で言う', function() {
  test('scan は行ごとに根拠を持ち、根拠ごとに数える', function() {
    var rec = { b: { pumlHash: H1, svgHash: 'sv1', result: 'match' } };
    var s = SF.scan([stamped('a', H1), unstamped('b'), unstamped('c')], rec);
    expect(s.rows[0].basis).toBe('stamp');
    expect(s.rows[1].basis).toBe('rerender');
    expect(s.rows[2].basis).toBe('');
    expect(s.basisCounts.stamp).toBe(1);
    expect(s.basisCounts.rerender).toBe(1);
  });

  test('基準の 1 行が枚数と、印はバイト比較できないことを言う', function() {
    var rec = { b: { pumlHash: H1, svgHash: 'sv1', result: 'match' } };
    var note = SF.basisNote(SF.scan([stamped('a', H1), unstamped('b')], rec));
    expect(note).toContain('印 (@pua-source-sha1) の突合 1 枚');
    expect(note).toContain('描き直してのバイト比較 1 枚');
    // reviewer が server.py を読みに行った理由そのものを、その場に書く
    expect(note).toContain('/render の応答とそのままバイト比較すると必ず食い違います');
  });

  test('印だけで判定した図が無ければ、バイト比較の注意は出さない', function() {
    var rec = { b: { pumlHash: H1, svgHash: 'sv1', result: 'match' } };
    var note = SF.basisNote(SF.scan([unstamped('b')], rec));
    expect(note).toContain('描き直してのバイト比較 1 枚');
    expect(note).not.toContain('@pua-source-sha1');
    expect(note).toContain('保存中の SVG は上書きしていません');
  });

  test('1 枚も内容で判定していなければ、そう言う', function() {
    expect(SF.basisNote(SF.scan([unstamped('b')]))).toContain('まだ 1 枚も内容で判定していません');
  });

  test('図が無ければ根拠の行も出さない', function() {
    expect(SF.basisNote(SF.scan([]))).toBe('');
  });

  test('印には根拠が添えられる (どちらで出た答えか)', function() {
    expect(SF.contentBadge('differ', 'stamp').title).toContain('根拠: 印 (@pua-source-sha1) の突合');
    expect(SF.contentBadge('match', 'rerender').title).toContain('根拠: 描き直してのバイト比較');
    // 根拠が無いときはこれまでどおりの文言のまま
    expect(SF.contentBadge('differ').title).not.toContain('根拠');
  });

  test('図名 → 根拠の対応が引ける', function() {
    var m = SF.basisMap(SF.scan([stamped('a', H1), unstamped('b')]));
    expect(m.a).toBe('stamp');
    expect(m.b).toBe('');
  });
});
