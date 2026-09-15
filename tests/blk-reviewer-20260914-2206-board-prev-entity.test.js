'use strict';
// BLK-reviewer-20260914-2206 (差し戻し 1 回目): --board の「新規」は、前回の
// 指摘.md に書かれているかどうかで決まっていた。reviewer が書き落とした指摘は、
// 前回も今回も同じように突合に出ているのに毎 run 「今回の新規」に落ち、
// そのたびに手で裏取りする羽目になっていた (実データでは整合/イベント 24 件)。
//
// 新規かどうかは、前回の突合結果と「実体 id」— findings.js が継続を数えるのと
// 同じ id — だけで決める。ここはその線を押さえる。

const rb = require('../src/core/review-board');
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

describe('review-board.build — 新規は前回の突合結果と実体 id で決める', function() {
  test('前回の突合にも出ていた行は、指摘.md に書かれていなくても新規ではない', function() {
    const prev = consistency(EVENTS);
    const now = consistency(EVENTS);
    const view = rb.build({ board: now, findings: FINDINGS, prevRows: prev.rows });

    expect(view.counts.fresh).toBe(0);
    expect(view.counts.seen).toBe(2);
    expect(view.seen.map((r) => r.title).sort()).toEqual(['Timer_Init', 'Timer_Stop']);
  });

  test('前回の突合行を渡さない回は今までどおり全部が新規 (振る舞いを変えない)', function() {
    const now = consistency(EVENTS);
    const view = rb.build({ board: now, findings: FINDINGS });
    expect(view.counts.fresh).toBe(2);
    expect(view.counts.seen).toBe(0);
    expect(view.hasPrevRows).toBe(false);
  });

  test('前回に無かった実体だけが新規に残る', function() {
    const prev = consistency([EVENTS[0]]);
    const now = consistency(EVENTS);
    const view = rb.build({ board: now, findings: FINDINGS, prevRows: prev.rows });
    expect(view.fresh.map((r) => r.title)).toEqual(['Timer_Stop']);
    expect(view.counts.seen).toBe(1);
  });

  test('同じ欠陥が別の図に広がっただけの行を新規と呼ばない', function() {
    const prev = consistency([{ event: 'Timer_Init', cls: 'Timer', docs: ['timer_state.puml'] }]);
    const now = consistency([{ event: 'Timer_Init', cls: 'Timer', docs: ['adc_state.puml'] }]);
    const view = rb.build({ board: now, findings: FINDINGS, prevRows: prev.rows });
    expect(view.counts.fresh).toBe(0);
    expect(view.counts.seen).toBe(1);
  });

  test('前回にあって今回は出ていない実体は「前回の突合から消えた」に出る', function() {
    const prev = consistency(EVENTS);
    const now = consistency([EVENTS[0]]);
    const view = rb.build({ board: now, findings: FINDINGS, prevRows: prev.rows });
    expect(view.gone.map((r) => r.title)).toEqual(['Timer_Stop']);
    expect(view.counts.gone).toBe(1);
  });

  test('--only で絞った回は、回していない監査の行を「消えた」と言わない', function() {
    const prev = consistency(EVENTS);
    // svg だけを回した回。整合の行はそもそも来ない。
    const now = board.build({ audits: {}, svg: { rows: [] } });
    const view = rb.build({ board: now, findings: FINDINGS, prevRows: prev.rows, scope: ['svg'] });
    expect(view.counts.gone).toBe(0);
  });

  test('画面には「新規ではない」と名指しで出す', function() {
    const prev = consistency(EVENTS);
    const now = consistency(EVENTS);
    const view = rb.build({ board: now, findings: FINDINGS, prevRows: prev.rows });
    const md = rb.markdown(view, 'レビュー結果');
    expect(md).toContain('前回の突合にもあった');
    expect(md).toContain('新規ではありません');
    expect(md).toContain('Timer_Init');
    expect(rb.summaryLine(view)).toContain('新規 0 件');
    expect(rb.summaryLine(view)).toContain('前回の突合にもあり 2 件');
  });
});
