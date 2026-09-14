'use strict';
// BLK-reviewer-20260908-0723-wish: 1 図の中身が保存のたびにどう変わったかを積み、
// A → B → A の「往復」を単発 diff ではなく履歴の上で名指しできることを見る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/version-timeline.js')]; } catch (e) {}
require('../src/core/version-timeline.js');
var VT = global.window.MA.versionTimeline;

var A = '@startuml\nAlice -> Bob : hi\n@enduml';
var B = '@startuml\nAlice -> Bob : hi\nBob -> Carol : dma\n@enduml';
var C = '@startuml\nAlice -> Bob : hello\n@enduml';

describe('version-timeline — 図ごとの版の積み上げ', () => {
  beforeEach(() => { VT.reset(); });

  test('保存のたびに版が積まれる', () => {
    expect(VT.push('d1.puml', A).added).toBe(true);
    expect(VT.push('d1.puml', B).added).toBe(true);
    expect(VT.historyOf('d1.puml').length).toBe(2);
  });

  test('中身が直前の版と同じなら積まない (保存回数の記録にしない)', () => {
    VT.push('d1.puml', A);
    var r = VT.push('d1.puml', A);
    expect(r.added).toBe(false);
    expect(VT.historyOf('d1.puml').length).toBe(1);
  });

  test('改行コードと行末の空白だけの違いは同じ版とみなす', () => {
    VT.push('d1.puml', A);
    expect(VT.push('d1.puml', A.replace(/\n/g, '\r\n') + '  \n\n').added).toBe(false);
  });

  test('名前が無ければ積まない', () => {
    expect(VT.push('', A).added).toBe(false);
    expect(VT.names().length).toBe(0);
  });

  test('上限を超えたら古い版から捨てる', () => {
    for (var i = 0; i < VT.MAX_PER_FILE + 5; i++) {
      VT.push('d1.puml', '@startuml\nA -> B : m' + i + '\n@enduml');
    }
    expect(VT.historyOf('d1.puml').length).toBe(VT.MAX_PER_FILE);
  });

  test('履歴を持つ図を版数の多い順に返す', () => {
    VT.push('few.puml', A);
    VT.push('many.puml', A);
    VT.push('many.puml', B);
    VT.push('many.puml', C);
    expect(VT.names()).toEqual(['many.puml', 'few.puml']);
  });

  test('forget でその図の履歴だけ消える', () => {
    VT.push('d1.puml', A);
    VT.push('d2.puml', A);
    expect(VT.forget('d1.puml')).toBe(true);
    expect(VT.names()).toEqual(['d2.puml']);
    expect(VT.forget('d1.puml')).toBe(false);
  });
});

describe('version-timeline — 変遷の読み方', () => {
  beforeEach(() => { VT.reset(); });

  test('新しい版が先頭に並び、版番号は古い方が 1', () => {
    VT.push('d1.puml', A, '2026-09-08T01:00:00Z');
    VT.push('d1.puml', B, '2026-09-08T02:00:00Z');
    var rows = VT.rows('d1.puml');
    expect(rows.length).toBe(2);
    expect(rows[0].rev).toBe(2);
    expect(rows[0].at).toBe('2026-09-08T02:00:00Z');
    expect(rows[1].rev).toBe(1);
    expect(rows[1].first).toBe(true);
  });

  test('1 つ前の版からの増減が出る', () => {
    VT.push('d1.puml', A);
    VT.push('d1.puml', B);   // 1 行増える
    var rows = VT.rows('d1.puml');
    expect(rows[0].added).toBe(1);
    expect(rows[0].removed).toBe(0);
    expect(rows[0].lines).toBe(4);
  });

  test('A → B → A の往復を、戻り先の版番号つきで名指しする', () => {
    VT.push('d1.puml', A);
    VT.push('d1.puml', B);
    VT.push('d1.puml', A);
    var rows = VT.rows('d1.puml');
    expect(rows[0].rev).toBe(3);
    expect(rows[0].revisit).toBe(true);
    expect(rows[0].revisitOf).toBe(1);
    expect(VT.revisitCount('d1.puml')).toBe(1);
  });

  test('直前の版に戻ることはない (同じなら積まれない) ので、隣同士は往復にしない', () => {
    VT.push('d1.puml', A);
    VT.push('d1.puml', B);
    var rows = VT.rows('d1.puml');
    expect(rows[0].revisit).toBe(false);
    expect(VT.revisitCount('d1.puml')).toBe(0);
  });

  test('往復が複数回でも全部数える (A→B→A→B→A)', () => {
    [A, B, A, B, A].forEach(function(d) { VT.push('d1.puml', d); });
    expect(VT.historyOf('d1.puml').length).toBe(5);
    expect(VT.revisitCount('d1.puml')).toBe(3);
  });

  test('summaryLine は往復があればそれを先に言う', () => {
    VT.push('d1.puml', A);
    VT.push('d1.puml', B);
    expect(VT.summaryLine('d1.puml')).toBe('2 版 · 往復なし');
    VT.push('d1.puml', A);
    expect(VT.summaryLine('d1.puml')).toBe('3 版 · 往復 1 回 — 前に戻った版があります');
  });

  test('履歴が無い図は、そう言う', () => {
    expect(VT.summaryLine('無い.puml')).toBe('この図の履歴はまだありません');
    expect(VT.rows('無い.puml')).toEqual([]);
  });

  test('diffLines は 2 つの版の間で増えた行と減った行を返す', () => {
    VT.push('d1.puml', A);
    VT.push('d1.puml', B);
    var d = VT.diffLines('d1.puml', 1, 2);
    expect(d.added).toEqual(['Bob -> Carol : dma']);
    expect(d.removed).toEqual([]);
    var back = VT.diffLines('d1.puml', 2, 1);
    expect(back.removed).toEqual(['Bob -> Carol : dma']);
    expect(back.added).toEqual([]);
  });

  test('diffLines は無い版を渡されても壊れない', () => {
    VT.push('d1.puml', A);
    expect(VT.diffLines('d1.puml', 1, 9)).toEqual({ added: [], removed: [] });
  });
});
