'use strict';
// BLK-owner-20260923-2312-prune: 過去の版を見る画面 (⟲ 変遷 / 保存先一覧の [履歴 N]) を
// 「この図の履歴」1 つに寄せる。保存した版の一覧でも、⟲ 変遷が持っていた「往復」
// (前の版と同じ中身に戻った版) の印を落とさないことを見る。中身の一致は server が
// 版ごとに添える hash で判定する (fetch と描画は app.js)。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/version-history.js')]; } catch (e) {}
require('../src/core/version-history.js');
var vh = global.window.MA.versionHistory;

function row(stamp, hash) { return { stamp: stamp, label: 'L' + stamp, hash: hash }; }

describe('versionHistory.rows は版ごとの hash を持つ', () => {
  test('server の hash をそのまま運ぶ (無ければ空)', () => {
    var rs = vh.rows({ versions: [{ stamp: '20260924-081900', lines: 4, head: 'state IDLE', hash: 'abc' }, { stamp: '20260924-081800' }] });
    expect(rs[0].hash).toBe('abc');
    expect(rs[1].hash).toBe('');
  });
});

describe('versionHistory.markRevisits', () => {
  test('間に別の中身を挟んで前の版と同じ中身に戻った版に印を付け、戻った先の版を名指しする', () => {
    // 新しい順: C(=A) ← B ← A
    var out = vh.markRevisits([row('3', 'A'), row('2', 'B'), row('1', 'A')]);
    expect(out[0].revisit).toBe(true);
    expect(out[0].revisitOf).toBe('L1');
    expect(out[1].revisit).toBe(false);
    expect(out[2].revisit).toBe(false);
  });

  test('すぐ前と同じ中身 (中身の変わらない保存) は往復と呼ばない', () => {
    var out = vh.markRevisits([row('2', 'A'), row('1', 'A')]);
    expect(out[0].revisit).toBe(false);
    expect(out[1].revisit).toBe(false);
  });

  test('hash の無い版は判定しない (古い server の応答でも一覧は出る)', () => {
    var out = vh.markRevisits([row('3', ''), row('2', 'B'), row('1', '')]);
    expect(out.map(function(r) { return r.revisit; })).toEqual([false, false, false]);
  });

  test('元の行は書き換えず、印の数を revisitCount で数えられる', () => {
    var src = [row('4', 'A'), row('3', 'B'), row('2', 'A'), row('1', 'B')];
    var out = vh.markRevisits(src);
    expect(src[0].revisit).toBe(undefined);
    expect(out[0].revisit).toBe(true);
    expect(out[1].revisit).toBe(true);
    expect(vh.revisitCount(src)).toBe(2);
    expect(vh.markRevisits(null)).toEqual([]);
  });
});
