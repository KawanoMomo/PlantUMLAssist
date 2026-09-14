'use strict';
// BLK-reviewer-20260915-0307-wish: 同じ「宣言の無い呼び出し」でも、図の側に
// 「意図して省略する」と書いてあるものと、まだ何も答えていないものがある。
// 監査はどちらも同じカテゴリで出すので、reviewer は puml の note を人力で
// 読み直して 対応済み / 未対応 の表を指摘.md に手書きしていた。
//
// ここでは (1) note の自由文から意図を読む範囲、(2) 指摘 1 件ずつに付く印、
// (3) 台帳の行・要約・表にその区別が出ること、を固定する。

if (!global.window) {
  const jsdom = require('jsdom');
  const dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
const om = require('../src/core/omit-method.js');
const tracker = require('../src/core/finding-tracker.js');
const findings = require('../tools/findings.js');

// primary が実際に書いた note (driver_common_class.puml)。`\n` は puml の改行。
const NOTE_DOC = {
  name: 'driver_common_class.puml',
  dsl: [
    '@startuml',
    'class Spi_Driver {',
    '  +Spi_Init(cfg): Std_ReturnType',
    '}',
    'note top of ClockCtrl : ClockCtrl.EnableClock() / NVIC.EnableVector() / NVIC.SetPriority()\\n'
      + 'は呼び先の詳細を意図的に割愛(reviewer依頼2への回答)',
    '@enduml',
  ].join('\n'),
};

describe('omit-method — note の自由文から意図を読む', function() {
  test('意図的な割愛を述べる note の中で名指しされた組を拾う', function() {
    const got = om.parseNotes(NOTE_DOC.dsl);
    expect(got.length).toBe(3);
    expect(got.map((o) => o.cls + '.' + o.method)).toEqual(
      ['ClockCtrl.EnableClock', 'NVIC.EnableVector', 'NVIC.SetPriority']);
    expect(got[0].source).toBe('note');
    expect(got[0].reason).toContain('意図的に割愛');
  });

  test('意図を述べていない note は拾わない', function() {
    expect(om.parseNotes('@startuml\nnote over Can_Driver : shares Driver_Common base\n@enduml'))
      .toEqual([]);
  });

  test('end note までの塊も読む。名指しが無ければ宛先クラスの Foo() を対象にする', function() {
    const got = om.parseNotes([
      '@startuml',
      'note top of ClockCtrl',
      '  EnableClock() は意図して省略しています',
      'end note',
      '@enduml',
    ].join('\n'));
    expect(got.length).toBe(1);
    expect(got[0].cls).toBe('ClockCtrl');
    expect(got[0].method).toBe('EnableClock');
  });

  test('collect は既定ではタグだけ。note は --notes を立てたときだけ混ざる', function() {
    expect(om.collect([NOTE_DOC])).toEqual([]);
    const both = om.collect([NOTE_DOC], { notes: true });
    expect(both.length).toBe(3);
    expect(both[0].doc).toBe('driver_common_class.puml');
    expect(both[0].source).toBe('note');
  });
});

describe('omit-method — 指摘の仕分け', function() {
  const issues = [
    { kind: 'no-method', method: 'EnableClock', cls: 'ClockCtrl', owner: 'Spi', docs: ['spi.puml'] },
    { kind: 'no-method', method: 'WriteConfig', cls: 'SpiRegs', owner: 'Spi', docs: ['spi.puml'] },
  ];

  test('annotate は指摘を消さず、印だけ足す (件数も継続 tick 数も切らない)', function() {
    const got = om.annotate(issues, om.collect([NOTE_DOC], { notes: true }));
    expect(got.length).toBe(2);
    expect(got[0].intent).toBe('note');
    expect(got[0].intentDoc).toBe('driver_common_class.puml');
    expect(got[1].intent).toBe('');
    // 元の配列は変えない
    expect(issues[0].intent).toBe(undefined);
  });

  test('タグと note の両方があればタグを採る (機械が読める方が強い)', function() {
    const oms = [
      { cls: 'ClockCtrl', method: 'EnableClock', reason: 'note 由来', doc: 'a', source: 'note' },
      { cls: 'ClockCtrl', method: 'EnableClock', reason: 'タグ由来', doc: 'b', source: 'tag' },
    ];
    expect(om.findIntent(issues[0], oms).source).toBe('tag');
    expect(om.annotate(issues, oms)[0].intentReason).toBe('タグ由来');
  });

  test('整合/メソッドの指摘は持ち主を target に持つので、そこでも当たる', function() {
    const oms = [{ cls: 'DmaCtrl', method: 'Spi_TransmitDma', reason: 'r', doc: 'd', source: 'tag' }];
    expect(om.matches(oms[0], { method: 'Spi_TransmitDma', target: 'DmaCtrl' })).toBe(true);
  });

  test('annotateAudits はメソッド系の箱だけに印を付ける', function() {
    const audits = {
      method: { status: 'ok', result: { issues: [issues[0]] } },
      consistency: { status: 'ok', result: { methods: [issues[1]] } },
    };
    const got = om.annotateAudits(audits, om.collect([NOTE_DOC], { notes: true }));
    expect(got.method.result.issues[0].intent).toBe('note');
    expect(got.consistency.result.methods[0].intent).toBe('');
  });
});

describe('finding-tracker — 意図明記済みと未対応を分けて読む', function() {
  function state() {
    return tracker.update(tracker.emptyState(), {
      label: 't1',
      items: [
        { entity: 'no-method:ClockCtrl.EnableClock', title: 'ClockCtrl.EnableClock',
          cats: ['メソッド'], docs: ['spi.puml'], excluded: false,
          intent: 'note', intentReason: '意図的に割愛', intentDoc: 'driver_common_class.puml' },
        { entity: 'no-method:SpiRegs.WriteConfig', title: 'SpiRegs.WriteConfig',
          cats: ['メソッド'], docs: ['spi.puml'], excluded: false, intent: '' },
      ],
    });
  }

  test('行が意図の印を持ち、declared で引ける', function() {
    const rows = tracker.rows(state());
    expect(rows[0].intent).toBe('note');
    expect(rows[0].intentLabel).toBe('意図明記済み(note)');
    expect(rows[0].declared).toBe(true);
    expect(rows[1].declared).toBe(false);
    expect(rows[1].intentLabel).toBe('未対応');
  });

  test('要約が未解消の内訳を言う', function() {
    expect(tracker.intentSummaryText(tracker.rows(state())))
      .toBe('未解消の内訳: 意図明記済み 1 件 / 未対応 1 件');
  });

  test('行の文言に印が出る。未対応の行では何も足さない', function() {
    const rows = tracker.rows(state());
    expect(tracker.rowText(rows[0])).toContain('意図明記済み(note) — driver_common_class.puml');
    expect(tracker.rowText(rows[1])).not.toContain('未対応');
  });

  test('note を消せば次の tick で未対応に戻る (判断の貼り付けとは別物)', function() {
    const next = tracker.update(state(), {
      label: 't2',
      items: [
        { entity: 'no-method:ClockCtrl.EnableClock', title: 'ClockCtrl.EnableClock',
          cats: ['メソッド'], docs: ['spi.puml'], excluded: false, intent: '' },
      ],
    });
    expect(tracker.rows(next)[0].declared).toBe(false);
  });

  test('指摘.md の表に 意図 の列と理由が出る', function() {
    const md = tracker.markdown(state(), '指摘トラッカー');
    expect(md).toContain('| id | 状態 | 意図 | 初出 | 対象 | 分類 | 備考 |');
    expect(md).toContain('意図明記済み(note)');
    expect(md).toContain('| 未対応 |');
    expect(md).toContain('意図明記済みの理由（図に書かれている文言）');
    expect(md).toContain('意図的に割愛');
  });
});

describe('tools/findings.js — 仕分けで絞る', function() {
  const rows = [
    { id: 'F-01', open: true, declared: true },
    { id: 'F-04', open: true, declared: false },
    { id: 'F-09', open: false, declared: false },
  ];

  test('--undeclared / --declared を読む', function() {
    expect(findings.parseArgs(['x', '--undeclared']).intent).toBe('undeclared');
    expect(findings.parseArgs(['x', '--declared']).intent).toBe('declared');
    expect(findings.parseArgs(['x']).intent).toBe(null);
  });

  test('未対応だけ / 意図明記済みだけに絞れる', function() {
    expect(findings.filterIntent(rows, 'undeclared').map((r) => r.id)).toEqual(['F-04', 'F-09']);
    expect(findings.filterIntent(rows, 'declared').map((r) => r.id)).toEqual(['F-01']);
    expect(findings.filterIntent(rows, null).length).toBe(3);
  });

  test('図が読めない (監査JSON だけの) 回は印を付けずに素通りする', function() {
    const audits = { method: { status: 'ok', result: { issues: [{ method: 'm' }] } } };
    expect(findings.markIntent(audits, [], null)).toBe(audits);
  });
});
