'use strict';
// BLK-reviewer-20260915-0106-wish: 「意図して宣言しない」を note の自由文ではなく
// `'@omit-method Cls.Method 理由` の 1 行で宣言し、突合がその行を読んで指摘から外す。
// ここでは書式・突き合わせ・外した分の残し方・行の足し先を固定する。

if (!global.window) {
  const jsdom = require('jsdom');
  const dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
require('../src/core/dsl-utils.js');
require('../src/core/method-audit.js');
const om = require('../src/core/omit-method.js');
const sg = require('../src/core/save-guard.js');
const MA = global.window.MA;

// 依頼2 の実例。ClockCtrl.EnableClock はどのクラス図にも宣言が無い。
const CLASS_DOC = {
  name: 'driver_common_class',
  dsl: [
    '@startuml',
    'class Spi_Driver {',
    '  +Spi_Init(cfg): Std_ReturnType',
    '}',
    'class ClockCtrl {',
    '  +Reset(): void',
    '}',
    '@enduml',
  ].join('\n'),
};

function seq(extra) {
  return {
    name: 'irq_init_sequence',
    dsl: [
      '@startuml',
      'participant Spi_Driver',
      'participant ClockCtrl',
      'Spi_Driver -> ClockCtrl : EnableClock(id)',
      'Spi_Driver -> Spi_Driver : Spi_Init(cfg)',
    ].concat(extra || [], ['@enduml']).join('\n'),
  };
}

describe('omit-method — 宣言の書式', function() {
  test('対象と理由を読む', function() {
    const got = om.parse([
      '@startuml',
      "'@omit-method ClockCtrl.EnableClock 呼び先は BSW 提供。本設計では宣言しない",
      '@enduml',
    ].join('\n'));
    expect(got.length).toBe(1);
    expect(got[0].cls).toBe('ClockCtrl');
    expect(got[0].method).toBe('EnableClock');
    expect(got[0].reason).toBe('呼び先は BSW 提供。本設計では宣言しない');
  });

  test('CRLF でも、クラス名を省いた形でも読む', function() {
    const got = om.parse("'@omit-method EnableClock 理由あり\r\n");
    expect(got.length).toBe(1);
    expect(got[0].cls).toBe('');
    expect(got[0].method).toBe('EnableClock');
  });

  test('note の自由文コメントは省略宣言として読まない', function() {
    expect(om.parse("' 意図的に割愛しました (omit-method のつもり)")).toEqual([]);
    expect(om.parse('note top of ClockCtrl : 意図的に割愛')).toEqual([]);
  });

  test('指摘 1 件から貼れる 1 行を作る。no-class はメソッド名だけにならず持ち主が付く', function() {
    expect(om.tagLine({ method: 'EnableClock', cls: 'ClockCtrl', owner: '' }, '理由'))
      .toBe("'@omit-method ClockCtrl.EnableClock 理由");
    expect(om.tagLine({ method: 'Adc_Ack', cls: '', owner: 'Adc' }, '理由'))
      .toBe("'@omit-method Adc.Adc_Ack 理由");
  });

  test('行は @enduml の直前に入る (図の外に落とさない)', function() {
    const out = om.apply('@startuml\nA -> B : m()\n@enduml\n', ["'@omit-method B.m 理由"]);
    expect(out.split('\n')).toEqual([
      '@startuml', 'A -> B : m()', "'@omit-method B.m 理由", '@enduml', '',
    ]);
  });

  test('同じ対象の宣言が既にあれば has が拾う (二重に足さない)', function() {
    const dsl = "@startuml\n'@omit-method ClockCtrl.EnableClock 理由\n@enduml";
    expect(om.has(dsl, { method: 'EnableClock', cls: 'ClockCtrl' })).toBe(true);
    expect(om.has(dsl, { method: 'Reset', cls: 'ClockCtrl' })).toBe(false);
  });
});

describe('omit-method — 突合からの除外', function() {
  test('宣言を足すと、その指摘だけが issues から消えて omitted に理由つきで残る', function() {
    const before = MA.methodAudit.audit([CLASS_DOC, seq()]);
    expect(before.issues.map((i) => i.method)).toContain('EnableClock');
    expect(before.omitted).toEqual([]);

    const after = MA.methodAudit.audit([CLASS_DOC, seq([
      "'@omit-method ClockCtrl.EnableClock 呼び先は BSW 提供",
    ])]);
    expect(after.issues.map((i) => i.method)).not.toContain('EnableClock');
    expect(after.clean).toBe(true);
    expect(after.omitted.length).toBe(1);
    expect(after.omitted[0].method).toBe('EnableClock');
    expect(after.omitted[0].reason).toBe('呼び先は BSW 提供');
    expect(after.omitted[0].omitDoc).toBe('irq_init_sequence');
  });

  test('別のメソッドの宣言では外れない', function() {
    const after = MA.methodAudit.audit([CLASS_DOC, seq(["'@omit-method ClockCtrl.Reset 理由"])]);
    expect(after.issues.map((i) => i.method)).toContain('EnableClock');
    expect(after.omitted).toEqual([]);
  });

  test('宣言はどの図に書いてもよい (クラス図側に置いても外れる)', function() {
    const cls2 = {
      name: CLASS_DOC.name,
      dsl: CLASS_DOC.dsl.replace('@enduml', "'@omit-method ClockCtrl.EnableClock 理由\n@enduml"),
    };
    const after = MA.methodAudit.audit([cls2, seq()]);
    expect(after.omitted.length).toBe(1);
  });

  test('外した分は 1 行の日本語で説明できる (puml を開かずに指摘.md に書ける)', function() {
    const after = MA.methodAudit.audit([CLASS_DOC, seq(["'@omit-method ClockCtrl.EnableClock 呼び先は BSW 提供"])]);
    expect(om.describe(after.omitted[0]))
      .toBe('ClockCtrl.EnableClock は意図的に宣言を省略 (呼び先は BSW 提供) — irq_init_sequence の宣言');
    expect(om.summaryLine(after.omitted)).toContain('1 件');
    expect(om.summaryLine([])).toBe('');
  });
});

describe('save-guard — 意図省略を宣言した図は保存前に止めない', function() {
  test('宣言の無いうちは止め、宣言を足した本文では止まらない', function() {
    const gap = seq();
    expect(sg.shouldBlock(sg.check({ doc: gap, folderDocs: [CLASS_DOC] }))).toBe(true);

    const fixed = seq(["'@omit-method ClockCtrl.EnableClock 呼び先は BSW 提供"]);
    const res = sg.check({ doc: fixed, folderDocs: [CLASS_DOC] });
    expect(res.count).toBe(0);
    expect(sg.shouldBlock(res)).toBe(false);
  });
});
