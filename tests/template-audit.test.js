'use strict';
// template-audit — ⧉ テンプレート複製の「この内容で作る」前の突合。
// BLK-primary-20260907-1203-wish の再現: adc_state.puml を接頭辞だけ Adc → Timer に
// 替えて複製すると、Timer_Driver に無い conv 系の名前がそのまま残る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['html-utils', 'method-audit', 'template-audit'].forEach(function(n) {
  try { delete require.cache[require.resolve('../src/core/' + n + '.js')]; } catch (e) {}
  require('../src/core/' + n + '.js');
});

const TA = global.window.MA.templateAudit;

const CLASS_DOC = {
  name: 'driver_class',
  diagramType: 'plantuml-class',
  dsl: [
    '@startuml',
    'class Adc_Driver {',
    '  +Adc_Init()',
    '  +Adc_StartConv()',
    '  +Adc_ConvDone()',
    '}',
    'class Timer_Driver {',
    '  +Timer_Init()',
    '  +Timer_Start()',
    '}',
    '@enduml',
  ].join('\n'),
};

// adc_state.puml をそのまま Adc → Timer に置換した結果。
const TIMER_STATE_FROM_ADC = [
  '@startuml',
  '[*] --> Idle',
  'Idle --> Configured : Timer_Init',
  'Configured --> Sampling : Timer_StartConv',
  'Sampling --> Idle : Timer_ConvDone',
  '@enduml',
].join('\n');

describe('template-audit — 作る前にクラスの宣言と突き合わせる', () => {
  test('接頭辞を替えただけで意味の合わない名前を、作る前に挙げる', () => {
    const r = TA.auditResult(TIMER_STATE_FROM_ADC, 'timer_state', [CLASS_DOC], 'adc_state');
    expect(r.clean).toBe(false);
    const names = r.issues.map((i) => i.method).sort();
    expect(names).toEqual(['Timer_ConvDone', 'Timer_StartConv']);
    // Timer_Driver は在るので「クラスが無い」ではなく「宣言が無い」と言う
    r.issues.forEach((i) => {
      expect(i.kind).toBe('no-method');
      expect(i.cls).toBe('Timer_Driver');
      expect(i.via).toBe('state');
    });
  });

  test('宣言のある名前だけなら問題なしになる', () => {
    const ok = [
      '@startuml',
      '[*] --> Idle',
      'Idle --> Running : Timer_Init',
      'Running --> Idle : Timer_Start',
      '@enduml',
    ].join('\n');
    const r = TA.auditResult(ok, 'timer_state', [CLASS_DOC], 'adc_state');
    expect(r.clean).toBe(true);
    expect(r.issues).toEqual([]);
  });

  test('CRLF で保存された図でも同じ結果になる', () => {
    const crlf = TIMER_STATE_FROM_ADC.replace(/\n/g, '\r\n');
    const cls = { name: CLASS_DOC.name, diagramType: CLASS_DOC.diagramType,
                  dsl: CLASS_DOC.dsl.replace(/\n/g, '\r\n') };
    const r = TA.auditResult(crlf, 'timer_state', [cls], 'adc_state');
    expect(r.clean).toBe(false);
    expect(r.issues.map((i) => i.method).sort()).toEqual(['Timer_ConvDone', 'Timer_StartConv']);
  });

  test('テンプレート元は突合の相手から外す (複製元は正しさの根拠ではない)', () => {
    const adcState = {
      name: 'adc_state',
      diagramType: 'plantuml-state',
      dsl: TIMER_STATE_FROM_ADC.replace(/Timer_/g, 'Adc_'),
    };
    const r = TA.auditResult(TIMER_STATE_FROM_ADC, 'timer_state', [CLASS_DOC, adcState], 'adc_state');
    // 相手側 (adc_state) の話は混ぜない。挙がるのは新しい図の名前だけ。
    r.issues.forEach((i) => {
      expect(i.docs).toContain('timer_state');
      expect(i.method.indexOf('Timer_')).toBe(0);
    });
  });

  test('相手の図が元から抱えている食い違いは挙げない', () => {
    const brokenOther = {
      name: 'other_state',
      diagramType: 'plantuml-state',
      dsl: '@startuml\n[*] --> A\nA --> B : Adc_Nope\n@enduml',
    };
    const ok = '@startuml\n[*] --> Idle\nIdle --> Running : Timer_Init\n@enduml';
    const r = TA.auditResult(ok, 'timer_state', [CLASS_DOC, brokenOther], '');
    expect(r.clean).toBe(true);
  });

  test('空の DSL では何も言わない', () => {
    expect(TA.auditResult('', 'x', [CLASS_DOC], '').clean).toBe(true);
    expect(TA.auditResult(null, 'x', [CLASS_DOC], '').issues).toEqual([]);
  });

  test('hasClassDocs: 「問題なし」と「見ていない」を分ける', () => {
    expect(TA.hasClassDocs([CLASS_DOC], '')).toBe(true);
    expect(TA.hasClassDocs([], '')).toBe(false);
    expect(TA.hasClassDocs([{ name: 's', dsl: '@startuml\n[*] --> A\n@enduml' }], '')).toBe(false);
    // テンプレート元しかクラスを持っていないなら、見ていないのと同じ
    expect(TA.hasClassDocs([CLASS_DOC], 'driver_class')).toBe(false);
  });

  test('summaryText: 突合していないことを「問題なし」と言わない', () => {
    expect(TA.summaryText(null, false)).toContain('突合はしていません');
    expect(TA.summaryText({ clean: true, issues: [] }, true)).toContain('噛み合っています');
    const ng = TA.auditResult(TIMER_STATE_FROM_ADC, 'timer_state', [CLASS_DOC], 'adc_state');
    expect(TA.summaryText(ng, true)).toContain('2 件');
  });

  test('buildIssuesHtml: 「名前突合」と同じ文言で 1 件 1 行に出す', () => {
    const r = TA.auditResult(TIMER_STATE_FROM_ADC, 'timer_state', [CLASS_DOC], 'adc_state');
    const html = TA.buildIssuesHtml(r);
    expect((html.match(/tpl-audit-row/g) || []).length).toBe(2);
    expect(html).toContain('Timer_StartConv (state の遷移) の宣言が Timer_Driver に無い');
    expect(TA.buildIssuesHtml({ clean: true, issues: [] })).toBe('');
  });
});

describe('method-audit — CRLF で保存された図でも突合が効く (BLK-reviewer-20260907-1203)', () => {
  const M = global.window.MA.methodAudit;

  test('parseStateEvent: 行末の \\r で遷移ラベルを取り逃さない', () => {
    expect(M.parseStateEvent('Configured --> Sampling : Timer_StartConv\r'))
      .toEqual({ event: 'Timer_StartConv' });
  });

  test('parseCall: 行末の \\r で呼び出しを取り逃さない', () => {
    expect(M.parseCall('A -> B : Timer_Init()\r'))
      .toEqual({ method: 'Timer_Init', args: 0, receiver: 'B' });
  });

  test('stateEvents: CRLF の図から LF と同じ件数・同じ行番号で拾う', () => {
    const lf = '@startuml\n[*] --> Idle\nIdle --> Busy : Timer_StartConv\n@enduml';
    const a = M.stateEvents([{ name: 't', dsl: lf }]);
    const b = M.stateEvents([{ name: 't', dsl: lf.replace(/\n/g, '\r\n') }]);
    expect(b).toEqual(a);
    expect(a.length).toBe(1);
    expect(a[0].line).toBe(3);
  });
});
