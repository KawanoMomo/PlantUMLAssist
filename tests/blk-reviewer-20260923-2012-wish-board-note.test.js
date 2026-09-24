'use strict';
// BLK-reviewer-20260923-2012-wish (差し戻し 1 回目): note の自由文で答えてある呼び出しは、
// --board (指摘.md を書く経路) でも「継続」ではなく「自由文で応答あり(タグ化待ち)」に別掲する。

const rb = require('../src/core/review-board');
const board = require('../src/core/audit-board');

function ok(result) { return { status: 'ok', result: result }; }

const FINDINGS = [
  '# primary への指摘',
  '',
  '## 【継続】F-01 `ClockCtrl` に `EnableClock` が無い',
  '`driver_common_class.puml` の `ClockCtrl` に `EnableClock()` の定義が無い。継続 11 tick 目。',
  '',
  '## 【継続】F-02 `SpiRegs` に `WriteConfig` が無い',
  '`driver_common_class.puml` の `SpiRegs` に `WriteConfig()` が無い。継続 11 tick 目。',
].join('\n');

function audits(noteOnFirst) {
  const m1 = { doc: 'driver_common_class', target: 'ClockCtrl', method: 'EnableClock', kind: 'no-method' };
  if (noteOnFirst) m1.noteReply = { doc: 'driver_common_class', line: 42, reason: '意図的に割愛(reviewer依頼2への回答)' };
  const m2 = { doc: 'driver_common_class', target: 'SpiRegs', method: 'WriteConfig', kind: 'no-method' };
  return { consistency: ok({ naming: [], unused: [], methods: [m1, m2], events: [], granularity: [] }) };
}

describe('--board: note の自由文で答えた指摘はタグ化待ちに別掲', function() {
  test('note で答えた組は継続に数えず、回数も進めず、どの note かを添える', function() {
    const b = board.build({ audits: audits(true) });
    const v = rb.build({ board: b, findings: FINDINGS });
    const f1 = v.carried.filter((c) => /F-01/.test(c.finding.title))[0];
    const f2 = v.carried.filter((c) => /F-02/.test(c.finding.title))[0];
    expect(f1.verdict).toBe('noteReplied');
    expect(f1.tick).toBe(11);
    expect(f1.note).toContain('driver_common_class 42 行 の note「意図的に割愛(reviewer依頼2への回答)」');
    expect(f2.verdict).toBe('carried');
    expect(f2.tick).toBe(12);
    expect(v.counts.noteReplied).toBe(1);
    expect(rb.summaryLine(v)).toContain('自由文で応答あり(タグ化待ち) 1 件');
    const md = rb.markdown(v, 'レビュー結果');
    expect(md).toContain('## 前回の指摘 — 自由文で応答あり(タグ化待ち)（1 件）');
  });

  test('note が無ければ今までどおり継続', function() {
    const v = rb.build({ board: board.build({ audits: audits(false) }), findings: FINDINGS });
    expect(v.carried.every((c) => c.verdict === 'carried')).toBe(true);
    expect(v.counts.noteReplied).toBe(0);
  });
});
