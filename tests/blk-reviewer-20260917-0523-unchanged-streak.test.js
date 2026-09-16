'use strict';

// BLK-reviewer-20260917-0523-wish: 対象フォルダが「いつから変わっていないか」を
// 控えに持ち、無変化の tick 数を数え直さずに読めるようにする。
const streak = require('../src/core/unchanged-streak');
const auditState = require('../src/core/audit-state');

function entries(pairs) {
  return pairs.map(function(p) { return { name: p[0], hash: p[1] }; });
}

describe('BLK-reviewer-20260917-0523 無変化 tick の追跡', function() {
  test('指紋は並び順では変わらない', function() {
    const a = streak.folderFingerprint(entries([['a.puml', 'h1'], ['b.puml', 'h2']]));
    const b = streak.folderFingerprint(entries([['b.puml', 'h2'], ['a.puml', 'h1']]));
    expect(a).toBe(b);
  });

  test('中身が 1 枚でも変われば指紋が変わる', function() {
    const a = streak.folderFingerprint(entries([['a.puml', 'h1'], ['b.puml', 'h2']]));
    const b = streak.folderFingerprint(entries([['a.puml', 'h1'], ['b.puml', 'h3']]));
    expect(a).not.toBe(b);
  });

  test('改名だけでも指紋が変わる', function() {
    const a = streak.folderFingerprint(entries([['a.puml', 'h1']]));
    const b = streak.folderFingerprint(entries([['a2.puml', 'h1']]));
    expect(a).not.toBe(b);
  });

  test('初回は連続 0 で、最終変更が今になる', function() {
    const m = streak.advance(null, 'fp1', '2026-09-17T05:00:00Z');
    expect(m.streak).toBe(0);
    expect(m.changedAt).toBe('2026-09-17T05:00:00Z');
    expect(streak.isUnchanged(m)).toBe(false);
  });

  test('無変化が続くと tick 数だけが増え、最終変更は動かない', function() {
    let m = streak.advance(null, 'fp1', '2026-09-16T06:26:00Z', 't0');
    for (let i = 1; i <= 9; i++) m = streak.advance(m, 'fp1', '2026-09-17T0' + (i % 10) + ':00:00Z', 't' + i);
    expect(m.streak).toBe(9);
    expect(m.changedAt).toBe('2026-09-16T06:26:00Z');
    expect(streak.isUnchanged(m)).toBe(true);
    expect(streak.describe(m).indexOf('9 tick 連続')).toBeGreaterThan(-1);
    expect(streak.describe(m).indexOf('2026-09-16T06:26:00Z')).toBeGreaterThan(-1);
  });

  test('同じ tick で何度打っても数字は 1 つしか進まない', function() {
    let m = streak.advance(null, 'fp1', '2026-09-16T06:26:00Z', 't0');
    m = streak.advance(m, 'fp1', '2026-09-17T05:00:00Z', 't1');
    expect(m.streak).toBe(1);
    // 同じ tick で --names / --cohort / --board と 3 回打ち直す。
    m = streak.advance(m, 'fp1', '2026-09-17T05:02:00Z', 't1');
    m = streak.advance(m, 'fp1', '2026-09-17T05:04:00Z', 't1');
    expect(m.streak).toBe(1);
    // 確認時刻だけは新しくなる (いつ見たかは残す)。
    expect(m.checkedAt).toBe('2026-09-17T05:04:00Z');
    // 次の tick で 1 つ進む。
    m = streak.advance(m, 'fp1', '2026-09-17T05:26:00Z', 't2');
    expect(m.streak).toBe(2);
  });

  test('tick を名乗らない run は「回連続」と数え方のまま言う', function() {
    let m = streak.advance(null, 'fp1', '2026-09-17T05:00:00Z');
    m = streak.advance(m, 'fp1', '2026-09-17T05:26:00Z');
    expect(streak.describe(m).indexOf('1 回連続')).toBeGreaterThan(-1);
    expect(streak.describe(m).indexOf('tick')).toBe(-1);
  });

  test('同じ tick でも中身が変われば 0 に戻る', function() {
    let m = streak.advance(null, 'fp1', '2026-09-16T06:26:00Z', 't0');
    m = streak.advance(m, 'fp1', '2026-09-17T05:00:00Z', 't1');
    m = streak.advance(m, 'fp2', '2026-09-17T05:04:00Z', 't1');
    expect(m.streak).toBe(0);
    expect(m.changedAt).toBe('2026-09-17T05:04:00Z');
  });

  test('中身が変わった回は 0 に戻り、最終変更がその時刻になる', function() {
    let m = streak.advance(null, 'fp1', '2026-09-16T06:26:00Z');
    m = streak.advance(m, 'fp1', '2026-09-17T00:26:00Z');
    m = streak.advance(m, 'fp2', '2026-09-17T05:26:00Z');
    expect(m.streak).toBe(0);
    expect(m.changedAt).toBe('2026-09-17T05:26:00Z');
    expect(streak.describe(m).indexOf('変化あり')).toBe(0);
  });

  test('控えが無い回の文言は「最初の控え」と言う', function() {
    expect(streak.describe(null).indexOf('最初の控え')).toBeGreaterThan(-1);
  });

  test('初回は「変化あり」と言わない (まだ比べていないだけ)', function() {
    const m = streak.advance(null, 'fp1', '2026-09-17T05:00:00Z');
    expect(m.first).toBe(true);
    expect(streak.describe(m).indexOf('最初の控え')).toBeGreaterThan(-1);
    expect(streak.describe(m).indexOf('変化あり')).toBe(-1);
  });

  test('2 回目に中身が変われば、そこは「変化あり」になる', function() {
    const m1 = streak.advance(null, 'fp1', '2026-09-17T05:00:00Z');
    const m2 = streak.advance(m1, 'fp2', '2026-09-17T05:26:00Z');
    expect(m2.first).toBe(undefined);
    expect(streak.describe(m2).indexOf('変化あり')).toBe(0);
  });

  test('指摘文書の継続件数を勘定の行から読む', function() {
    const md = '# レビュー結果\n\n継続 4 / 解消 0 / 新規 2 件（同じ図に別の指摘 1 件）\n';
    const t = streak.tallyFromDoc(md);
    expect(t.carried).toBe(4);
    expect(t.resolved).toBe(0);
    expect(t.fresh).toBe(2);
  });

  test('勘定の行が無い指摘文書では null を返す (0 件と偽らない)', function() {
    expect(streak.tallyFromDoc('# レビュー結果\n\n本文だけ\n')).toBe(null);
    expect(streak.tallyFromDoc('')).toBe(null);
  });

  test('印は対象ごとに分かれ、別対象の印とは混ざらない', function() {
    let store = { scopes: {} };
    const m1 = streak.advance(null, 'fp1', '2026-09-17T05:00:00Z');
    store = auditState.putMark(store, ['C:/p/primary'], m1);
    expect(auditState.pickMark(store, ['C:/p/primary']).fingerprint).toBe('fp1');
    expect(auditState.pickMark(store, ['C:/p/junior'])).toBe(null);
  });

  test('控えの本文を差し替えても印は消えない', function() {
    const rep = { audits: {}, generatedAt: '2026-09-17T05:00:00Z' };
    let store = { scopes: {} };
    const m = streak.advance(null, 'fp1', '2026-09-17T05:00:00Z');
    store = auditState.put(store, ['C:/p/primary'], rep, rep.generatedAt, null, m);
    // 印を名指ししない差し替え (別経路の保存) でも、前の印が残る。
    store = auditState.put(store, ['C:/p/primary'], rep, '2026-09-17T05:26:00Z');
    expect(auditState.pickMark(store, ['C:/p/primary']).fingerprint).toBe('fp1');
  });

  test('印を載せた控えは読み書きしても形を保つ', function() {
    let store = { scopes: {} };
    const m = streak.advance(null, 'fp1', '2026-09-17T05:00:00Z');
    store = auditState.putMark(store, ['C:/p/primary'], m);
    const back = auditState.readStore(auditState.serialize(store));
    expect(auditState.pickMark(back, ['C:/p/primary']).fingerprint).toBe('fp1');
  });
});
