'use strict';
// BLK-reviewer-20260908-1403-wish: 突合を「reviewer が手で回すスクリプト」ではなく
// 1 画面の一覧として持つ。各突合の結果を同じ形の行に揃え、カテゴリと図名の
// 2 通りで数え、指摘.md に貼れる markdown を出すところまでを固定する。

const { loadMA } = require('../tools/audit-runtime');
const board = require('../src/core/audit-board');

function ok(result) { return { status: 'ok', result: result }; }

describe('audit-board.build — 突合の出口を 1 本にする', function() {
  test('名前・整合・出力物・手動指摘が同じ形の行になり、カテゴリ順に並ぶ', function() {
    const b = board.build({
      audits: {
        name: ok({
          variants: [{ key: 'irqctrl', suggested: 'IrqCtrl', members: [
            { name: 'IrqCtrl', docs: ['a.puml'], refs: 3 },
            { name: 'IRQ_Ctrl', docs: ['b.puml'], refs: 1 },
          ] }],
          undeclared: [{ name: 'Timer', docs: ['a.puml'] }],
        }),
        consistency: ok({
          naming: [{ name: 'Can_Driver', suffix: 'driver', expected: 'drv', docs: ['b.puml'] }],
          unused: [{ name: 'Watchdog', doc: 'b.puml' }],
          methods: [{ doc: 'b.puml', target: 'Adc', method: 'Ack' }],
          events: [], granularity: [], methodReplies: [], count: 3,
        }),
      },
      svg: { rows: [
        { name: 'a.puml', status: 'fresh', content: 'differ' },
        { name: 'c.puml', status: 'missing', content: 'missing' },
      ] },
      findings: [
        { id: 'f1', doc: 'a.puml', text: '章立てと図の粒度が合っていない', keep: false, label: '要再確認', line: 12 },
      ],
    });

    expect(b.total).toBe(8);
    expect(b.rows.map((r) => r.kind)).toEqual([
      'name.variants', 'name.undeclared',
      'consistency.naming', 'consistency.unused', 'consistency.methods',
      'svg.differ', 'svg.missing', 'manual',
    ]);
    // 行はどれも「どの図の・何が・なぜ」を持つ
    b.rows.forEach((r) => {
      expect(r.doc).not.toBe('');
      expect(r.title).not.toBe('');
      expect(r.detail).not.toBe('');
    });
  });

  test('1 枚に絞れない指摘は図名を (図をまたぐ) にし、図ごとの集計から外す', function() {
    const b = board.build({
      audits: { name: ok({
        variants: [{ key: 'x', suggested: 'X', members: [
          { name: 'X', docs: ['a.puml'], refs: 2 }, { name: 'x_', docs: ['b.puml'], refs: 1 },
        ] }],
        undeclared: [],
      }) },
    });
    expect(b.rows[0].doc).toBe(board.CROSS);
    // 行の図名は (図をまたぐ) だが、またいでいる図のどちらからも引ける
    expect(board.filter(b, { doc: 'b.puml' }).length).toBe(1);
    expect(b.byDoc.map((d) => d.key)).toEqual(['a.puml', 'b.puml']);
    expect(board.summaryLine(b)).toBe('1 件 / 2 枚');
  });

  test('粒度は consistency と family の二重計上をしない', function() {
    const family = ok([{ key: 'gpio', comparable: true, mismatches: [{ key: 'init', label: 'Init', onlyIn: 'gpio-seq.puml' }] }]);
    const both = board.build({
      audits: {
        family: family,
        consistency: ok({
          naming: [], unused: [], methods: [], events: [], methodReplies: [],
          granularity: [{ family: 'gpio', label: 'Init', onlyIn: 'gpio-seq.puml' }], count: 1,
        }),
      },
    });
    expect(both.total).toBe(1);
    expect(both.rows[0].kind).toBe('consistency.granularity');

    // consistency を見ていない run では family がそのまま出る (0 件にしない)
    const onlyFamily = board.build({ audits: { family: family } });
    expect(onlyFamily.rows.map((r) => r.kind)).toEqual(['family.mismatches']);
  });

  test('前回判定を維持してよい手動指摘は数えるが、今日読む件数からは分ける', function() {
    const b = board.build({
      findings: [
        { doc: 'a.puml', text: '直っていない', keep: false, label: '要再確認', line: 3 },
        { doc: 'a.puml', text: '前 run で見た', keep: true, label: '未変更', line: 5 },
      ],
    });
    expect(b.total).toBe(2);
    expect(b.keep).toBe(1);
    expect(board.summaryLine(b)).toBe('2 件 / 1 枚（うち前回判定を維持 1 件）');
  });

  test('見ていない突合は 0 件と区別する', function() {
    const none = board.build({});
    expect(none.seen).toEqual([]);
    expect(board.summaryLine(none)).toBe('まだ何も突き合わせていません');

    const clean = board.build({ audits: { name: ok({ variants: [], undeclared: [] }) }, svg: { rows: [] } });
    expect(clean.seen).toEqual(['名前', '出力物']);
    expect(board.summaryLine(clean)).toBe('名前・出力物 を見て、指摘はありません');
  });

  test('カテゴリと図名の 2 通りで数え、絞り込みが両方で効く', function() {
    const b = board.build({
      audits: { consistency: ok({
        naming: [], methods: [], events: [], granularity: [], methodReplies: [],
        unused: [{ name: 'A', doc: 'x.puml' }, { name: 'B', doc: 'x.puml' }, { name: 'C', doc: 'y.puml' }],
        count: 3,
      }) },
    });
    expect(b.byCategory).toEqual([{ key: 'consistency.unused', label: '整合/未使用', count: 3, keep: 0 }]);
    expect(b.byDoc.map((d) => d.key)).toEqual(['x.puml', 'y.puml']);
    expect(board.filter(b, { doc: 'x.puml' }).length).toBe(2);
    expect(board.filter(b, { kind: 'consistency.unused', doc: 'y.puml' }).length).toBe(1);
  });

  test('markdown はカテゴリ見出しと [図名] 付きの箇条書きになる', function() {
    const b = board.build({
      audits: { consistency: ok({
        naming: [], methods: [], events: [], granularity: [], methodReplies: [],
        unused: [{ name: 'Watchdog', doc: 'b.puml' }], count: 1,
      }) },
    });
    const md = board.markdown(b, 'GPIO 5 周目');
    expect(md).toContain('# GPIO 5 周目');
    expect(md).toContain('## 整合/未使用（1 件）');
    expect(md).toContain('- [b.puml] Watchdog — participant として宣言されていますが、どの矢印にも出てきません');
  });
});

describe('audit-board — 実際の監査結果をそのまま流せる', function() {
  test('CLI と同じ監査一式の出力を受け取って一覧になる', function() {
    const rt = loadMA();
    const MA = rt.MA;
    const docs = [
      { id: 1, name: 'gpio-seq.puml', diagramType: 'sequence',
        dsl: '@startuml\nparticipant Gpio_Driver\nparticipant Unused\nGpio_Driver -> Gpio_Driver : Gpio_Init()\n@enduml\n' },
      { id: 2, name: 'gpio-class.puml', diagramType: 'class',
        dsl: '@startuml\nclass GpioDrv {\n  +Gpio_Init()\n}\n@enduml\n' },
    ];
    const b = board.build({
      audits: {
        name: { status: 'ok', result: MA.nameAudit.audit(docs) },
        consistency: { status: 'ok', result: MA.consistency.check(docs) },
      },
      svg: MA.svgFreshness.scan([
        { name: 'gpio-seq.puml', mtime: '2026-09-08T10:00:00Z', svgMtime: '2026-09-08T09:00:00Z' },
      ], {}),
    });
    expect(b.total).toBeGreaterThan(0);
    // 使われていない participant と、SVG が古い図がどちらも同じ一覧に並ぶ
    expect(b.rows.some((r) => r.kind === 'consistency.unused' && r.title === 'Unused')).toBe(true);
    expect(b.rows.some((r) => r.kind === 'svg.stale' && r.doc === 'gpio-seq.puml')).toBe(true);
    expect(b.byDoc.some((d) => d.key === 'gpio-seq.puml')).toBe(true);
  });
});
