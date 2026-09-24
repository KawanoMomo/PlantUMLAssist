'use strict';
// BLK-reviewer-20260914-1206-wish: 4 種類の情報源 (突合結果 / 前回の指摘文書 /
// 前回控えとの diff / 継続 tick 数) を reviewer が頭の中で束ねていた。
// 束ねる側を機械にして、「解消 / 継続 N tick 目 / 新規」の振り分けを固定する。

const rb = require('../src/core/review-board');
const board = require('../src/core/audit-board');

function ok(result) { return { status: 'ok', result: result }; }

// 実際の 指摘.md と同じ書き方 (見出しの【】印・初出行・継続 tick 数)。
const FINDINGS = [
  '# primary への指摘(reviewer runs/20260914-1206 時点)',
  '',
  '## 【継続・最優先・2回目】timer_state.puml の遷移ラベルにクラスメソッドが無い(5件、未着手)',
  '`driver_common_class.puml` の `Timer_Driver` はまだ `Timer_Init()` しか持たない。',
  '初出: runs/20260914-1106。継続 2 tick 目。',
  '',
  '## 【継続】diagram1.svg が古いまま',
  '`diagram1.svg` は svg 鮮度判定で今回も stale。継続 4 tick 以上。',
  '',
  '## 【解消確認】gpio の sequence 図の junior/primary 不一致',
  '`gpio_init_sequence.puml` に domain-verdict を追記済み。mismatched 0 件。',
  '',
  '## 【新規】uart_state.puml の未使用 participant',
  '`uart_state.puml` に宣言だけの participant がある。',
  '',
  '## 突合サマリ(`tools/audit.js -p primary`, 30枚)',
  '命名 2 / 未使用 0 / メソッド 0。',
].join('\n');

describe('review-board.parseFindings — 前回の指摘文書を読む', function() {
  test('見出しの印から状態を、本文から継続 tick 数・初出・対象の図名を取る', function() {
    const f = rb.parseFindings(FINDINGS);
    // `##` の節だけを数える。`#` のタイトル行は指摘ではない。
    expect(f.length).toBe(5);

    expect(f[0].status).toBe('carried');
    expect(f[0].tick).toBe(2);
    expect(f[0].since).toBe('runs/20260914-1106');
    expect(f[0].docs).toEqual(['timer_state', 'driver_common_class']);

    // 「4 tick 以上」は正確な回数ではないので、その旨を別に持つ。
    expect(f[1].status).toBe('carried');
    expect(f[1].tick).toBe(4);
    expect(f[1].atLeast).toBe(true);
    // .svg と .puml は同じ図として扱う (指摘文はどちらの綴りでも書く)。
    expect(f[1].docs).toEqual(['diagram1']);

    expect(f[2].status).toBe('resolved');
    expect(f[3].status).toBe('fresh');
    // サマリ節は指摘ではない。本文に「継続・未着手」が出てきても振り分けない。
    expect(f[4].status).toBe('other');
  });

  test('図名のほかに、名指しされたクラス名・メソッド名を鍵として持つ', function() {
    const f = rb.parseFindings(FINDINGS);
    expect(f[0].keys).toEqual(['Timer_Driver', 'Timer_Init']);
    expect(f[1].svgIssue).toBe(true);
  });

  test('見出しに印が無くても本文の言い回しで拾う', function() {
    const f = rb.parseFindings('## adc_state.puml のラベル\n前回から継続。');
    expect(f[0].status).toBe('carried');
    expect(f[0].tick).toBe(0);
  });
});

describe('review-board.build — 4 つの情報源を 1 枚に束ねる', function() {
  const b = board.build({
    audits: {
      consistency: ok({
        naming: [], unused: [{ name: 'Watchdog', doc: 'uart_state.puml' }],
        methods: [], granularity: [], methodReplies: [],
        events: [{ event: 'Timer_Start', cls: 'Timer_Driver', docs: ['timer_state.puml'] }],
      }),
      name: ok({ variants: [], undeclared: [{ name: 'Adc', docs: ['adc_state.puml'] }] }),
    },
    svg: { rows: [
      { name: 'diagram1.puml', status: 'stale' },
      { name: 'gpio_init_sequence.puml', status: 'fresh' },
    ] },
  });
  const view = rb.build({
    board: b,
    findings: FINDINGS,
    changedFiles: ['timer_state.puml', 'gpio_init_sequence.puml'],
  });

  test('今回も当たる前回指摘は継続になり、tick 数が 1 つ進む', function() {
    const t = view.carried.find((c) => /timer_state/.test(c.finding.title));
    expect(t.verdict).toBe('carried');
    expect(t.tick).toBe(3);              // 前回 2 tick 目 → 今回 3 tick 目
    expect(t.rows.length).toBe(1);
    expect(t.rows[0].kind).toBe('consistency.events');
    // 前回控えから実際に変わったかを同じ行に出す (未着手との区別)。
    expect(t.touched).toEqual(['timer_state']);

    const d = view.carried.find((c) => /diagram1/.test(c.finding.title));
    expect(d.verdict).toBe('carried');
    expect(d.tick).toBe(5);
    expect(d.touched).toEqual([]);       // 触られていない = 未着手
  });

  test('今回の突合に出ない前回指摘は解消になる', function() {
    const g = view.carried.find((c) => /gpio/.test(c.finding.title));
    expect(g.verdict).toBe('resolved');
    expect(g.rows).toEqual([]);
  });

  test('どの前回指摘にも当たらない行が新規として残る', function() {
    expect(view.fresh.map((r) => r.doc)).toEqual(['adc_state.puml']);
    // regressed は BLK-reviewer-20260914-2206 で足した内数 (継続のうち本当の出戻り)。
    // outOfScope は同 3 件目で足した枠 (--only で回していない監査の指摘)。
    // ここは全部回した回なので常に 0。
    // ledger は BLK-reviewer-20260914-2206 (差し戻し 1 回目) で足した内数
    // (findings.js の台帳で当たった継続)。台帳を渡していないこの回は 0。
    // seen / gone も同 (差し戻し 1 回目) で足した枠 (前回の突合結果と実体 id で
    // 比べた内数)。前回の突合行を渡していないこの回は 0。
    // notAudited は BLK-reviewer-20260916-0629-friction で足した枠 (確認依頼など突合の対象外)。この回は 0。
    // noteReplied は BLK-reviewer-20260923-2012-wish で足した枠 (note の自由文で答えてタグ化待ち)。この回は 0。
    expect(view.counts).toEqual({
      carried: 3, ledger: 0, regressed: 0, resolved: 1, outOfScope: 0, notAudited: 0, noteReplied: 0, sameDoc: 0, unmatched: 0,
      fresh: 1, seen: 0, gone: 0, changed: 2,
    });
  });

  test('名指しの対象は消えたが同じ図に別の指摘が残る場合、解消と言い切らない', function() {
    const v = rb.build({
      board: board.build({
        audits: { consistency: ok({ naming: [], unused: [{ name: 'Watchdog', doc: 'timer_state.puml' }],
          methods: [], granularity: [], events: [], methodReplies: [] }) },
      }),
      findings: FINDINGS,
    });
    const t = v.carried.find((c) => /timer_state/.test(c.finding.title));
    // Timer_Driver / Timer_Init の行は無いので継続ではない。ただし
    // timer_state.puml には別の指摘 (未使用 participant) が残っている。
    expect(t.verdict).toBe('sameDoc');
    expect(t.rows.map((r) => r.kind)).toEqual(['consistency.unused']);
    expect(v.counts.sameDoc).toBe(1);
    // その行は「新規」としては数えない (同じ図の行を 2 か所で数えない)。
    expect(v.fresh).toEqual([]);
  });

  test('図名を書いていない指摘は解消にせず「要読み直し」で残す', function() {
    const v = rb.build({ board: b, findings: '## 【継続】章立てと図の対応が取れていない' });
    expect(v.carried[0].verdict).toBe('unmatched');
    expect(v.counts.resolved).toBe(0);
  });

  test('前回「解消」と書いた指摘に今回また当たったら 1 tick 目からの出戻りにする', function() {
    const v = rb.build({
      board: board.build({ audits: { name: ok({ variants: [], undeclared: [{ name: 'Gpio', docs: ['gpio_init_sequence.puml'] }] }) } }),
      findings: FINDINGS,
    });
    const g = v.carried.find((c) => /gpio/.test(c.finding.title));
    expect(g.verdict).toBe('carried');
    expect(g.tick).toBe(1);
    expect(g.note).toContain('また当たっています');
  });

  test('最長の継続と要約が 1 行で読める', function() {
    expect(rb.longestCarry(view)).toEqual({ tick: 5, title: 'diagram1.svg が古いまま' });
    expect(rb.summaryLine(view)).toBe(
      '継続 3 / 解消 1 / 新規 1 件、前回控えから変わった図 2 枚。最長の継続は「diagram1.svg が古いまま」5 tick 目');
  });
});

describe('review-board.markdown — そのまま次の指摘.md の下敷きになる', function() {
  test('継続・解消・新規・変わった図が 1 枚に並ぶ', function() {
    const view = rb.build({
      board: board.build({
        audits: { consistency: ok({ naming: [], unused: [], methods: [], granularity: [], methodReplies: [],
          events: [{ event: 'Timer_Start', cls: 'Timer_Driver', docs: ['timer_state.puml'] }] }) },
      }),
      findings: FINDINGS,
      changedFiles: ['timer_state.puml'],
    });
    const md = rb.markdown(view, 'レビュー結果');
    expect(md.split('\n')[0]).toBe('# レビュー結果');
    expect(md).toContain('## 前回の指摘 — 継続（1 件）');
    expect(md).toContain('3 tick 目');
    expect(md).toContain('timer_state は前回控えから変わっています');
    expect(md).toContain('初出 runs/20260914-1106');
    expect(md).toContain('## 前回の指摘 — 解消（3 件）');
    expect(md).toContain('## 前回控えから変わった図（1 枚）');
  });

  test('前回の指摘が無い初回でも落ちず、今回の突合だけが出る', function() {
    const view = rb.build({ board: board.build({ audits: {} }) });
    const md = rb.markdown(view);
    expect(md).toContain('継続 0 / 解消 0 / 新規 0 件');
    expect(md).toContain('## 前回控えから変わった図（0 枚）');
  });
});
