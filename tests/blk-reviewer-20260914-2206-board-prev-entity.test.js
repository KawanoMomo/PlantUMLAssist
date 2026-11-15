'use strict';
// BLK-reviewer-20260914-2206 (差し戻し 1 回目): --board の「新規」は、前回の
// 指摘.md に書かれているかどうかで決まっていた。reviewer が書き落とした指摘は、
// 前回も今回も同じように突合に出ているのに毎 run 「今回の新規」に落ち、
// そのたびに手で裏取りする羽目になっていた (実データでは整合/イベント 24 件)。
//
// 新規かどうかは、前回の突合結果と「実体 id」— findings.js が継続を数えるのと
// 同じ id — だけで決める。ここはその線を押さえる。

const board = require('../src/core/audit-board');
const timeline = require('../src/core/audit-timeline');

function ok(result) { return { status: 'ok', result: result }; }

function consistency(events, extra) {
  const c = Object.assign({ naming: [], unused: [], methods: [], granularity: [],
    events: events, methodReplies: [] }, extra || {});
  return board.build({ audits: { consistency: ok(c) } });
}

const EVENTS = [
  { event: 'Timer_Init', cls: 'Timer', docs: ['timer_state.puml'] },
  { event: 'Timer_Stop', cls: 'Timer', docs: ['timer_state.puml'] },
];

// 指摘.md にはこの 2 件のことが 1 行も書かれていない。
const FINDINGS = [
  '# primary への指摘',
  '',
  '## 【継続】表記統一の共有登録簿',
  '登録簿は 4 組すべて登録済み。',
].join('\n');

describe('audit-board — 行に実体 id を貼る', function() {
  test('audit-timeline.entityId と同じ id が行に付く', function() {
    const b = consistency(EVENTS);
    expect(b.rows.length).toBe(2);
    expect(b.rows[0].entity).toBe(timeline.entityId('consistency.events', EVENTS[0]));
    expect(b.rows[0].entity).toBe('timer/timerinit');
  });

  test('同じ欠陥が別の図に出ても実体 id は変わらない', function() {
    const here = consistency([{ event: 'Timer_Init', cls: 'Timer', docs: ['timer_state.puml'] }]);
    const there = consistency([{ event: 'Timer_Init', cls: 'Timer', docs: ['timer_init_sequence.puml'] }]);
    expect(there.rows[0].entity).toBe(here.rows[0].entity);
    expect(there.rows[0].doc).not.toBe(here.rows[0].doc);
  });
});
