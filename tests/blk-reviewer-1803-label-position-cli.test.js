'use strict';
// BLK-reviewer-20260908-1803: ラベル位置の慣習ズレを CLI (audit.js) から回す。
// label-position.js は純関数だが、入力が trace-coverage.audit() の結果で、
// それを組み立てているのが app.js だけだったため node からは回せなかった
// (直接 require しても、兄弟モジュールが window.MA に居ないので黙って空が返る)。
// ここで固定するのは、(1) 配線が効いて GUI と同じ判定が出ること、
// (2) 名指しまで要約に出ること、(3) 合計の数え方が画面 (整合) と割れないこと。

const { loadMA } = require('../tools/audit-runtime');
const report = require('../tools/audit-report');

// 系統 1 つぶん。状態遷移図のラベルが、シーケンスの何番目のメッセージを指すかを作り分ける。
function stateDoc(family, label) {
  return {
    name: family + '_state.puml',
    dsl: [
      '@startuml', '[*] --> Idle',
      'Idle --> Busy : ' + label,
      'Busy --> Idle : ' + family + '_Reset',
      '@enduml', '',
    ].join('\n'),
  };
}
function seqDoc(family, messages) {
  return {
    name: family + '_init_sequence.puml',
    dsl: ['@startuml', 'participant App', 'participant ' + family + 'Drv']
      .concat(messages.map((m) => 'App -> ' + family + 'Drv : ' + m + '()'))
      .concat(['@enduml', '']).join('\n'),
  };
}

// uart と gpio は先頭のメッセージをラベルにし、dma だけ末尾を使う
// (reviewer が毎 tick 目で確かめ直していた形そのもの)。
function docsWithOddDma() {
  return [
    stateDoc('uart', 'Uart_Init'), seqDoc('uart', ['Uart_Init', 'Uart_Cfg', 'Uart_Done']),
    stateDoc('gpio', 'Gpio_Init'), seqDoc('gpio', ['Gpio_Init', 'Gpio_Cfg', 'Gpio_Done']),
    stateDoc('dma', 'Dma_Done'), seqDoc('dma', ['Dma_Init', 'Dma_Cfg', 'Dma_Done']),
  ];
}
function docsAllHead() {
  return [
    stateDoc('uart', 'Uart_Init'), seqDoc('uart', ['Uart_Init', 'Uart_Cfg', 'Uart_Done']),
    stateDoc('gpio', 'Gpio_Init'), seqDoc('gpio', ['Gpio_Init', 'Gpio_Cfg', 'Gpio_Done']),
    stateDoc('dma', 'Dma_Init'), seqDoc('dma', ['Dma_Init', 'Dma_Cfg', 'Dma_Done']),
  ];
}

function labelOnly(docs) {
  const MA = loadMA().MA;
  return report.buildReport(MA, docs, { targets: ['fixtures'], only: ['label'] });
}

describe('audit.js --only label — ラベル位置の慣習ズレを CLI から回す', () => {
  test('label は audit の一覧に載っている (--only で名前が引ける)', () => {
    expect(report.auditNames()).toContain('label');
  });

  test('src/core/label-position.js が browser 抜きで回り、ズレた系統を名指しする', () => {
    const r = labelOnly(docsWithOddDma());
    expect(r.audits.label.status).toBe('ok');
    expect(r.summary.label.common).toBe('head');
    expect(r.summary.label.known).toBe(3);
    expect(r.summary.label.odd).toBe(1);
    expect(r.summary.label.oddNames).toEqual(['dma (末尾)']);
  });

  test('揃っていれば 0 件。「見ていない」と区別できるよう母数も出す', () => {
    const r = labelOnly(docsAllHead());
    expect(r.summary.label.odd).toBe(0);
    expect(r.summary.label.known).toBe(3);
    expect(r.summary.label.commonLabel).toBe('先頭');
  });

  test('要約 1 行に系統名と位置が出る (method 順を目で読み直さない)', () => {
    const text = report.formatSummary(labelOnly(docsWithOddDma()));
    const line = text.split('\n').filter((l) => l.indexOf('ラベル位置:') === 0);
    expect(line.length).toBe(1);
    expect(line[0]).toContain('多数派 (先頭) とズレた系統 1 件 / 3 件');
    expect(line[0]).toContain('dma (末尾)');
  });

  test('揃っているときも 1 行出す (行が消えると「見ていない」と読めてしまう)', () => {
    const text = report.formatSummary(labelOnly(docsAllHead()));
    expect(text).toContain('3 系統とも遷移ラベルは先頭のメッセージを指している');
  });

  test('比べる相手が 1 系統しか無ければ「ズレ」と言わない', () => {
    const r = labelOnly([stateDoc('uart', 'Uart_Init'), seqDoc('uart', ['Uart_Init', 'Uart_Cfg'])]);
    expect(r.summary.label.odd).toBe(0);
    expect(report.formatSummary(r)).toContain('慣習を比べられる系統が 1 件しかない');
  });

  test('系統内で位置が割れている系統も名指しする', () => {
    const docs = docsAllHead();
    // dma の状態遷移図に、末尾のメッセージを指すラベルをもう 1 本足す。
    docs[4].dsl = docs[4].dsl.replace('Busy --> Idle : dma_Reset', 'Busy --> Idle : Dma_Done');
    const r = labelOnly(docs);
    expect(r.summary.label.mixedNames).toContain('dma');
    expect(report.formatSummary(r)).toContain('系統内で位置が割れている 1 系統: dma');
  });

  test('合計はズレた系統の数を数える (画面の 整合 と割れない)', () => {
    expect(report.totalIssues(labelOnly(docsWithOddDma()).summary)).toBe(1);
    expect(report.totalIssues(labelOnly(docsAllHead()).summary)).toBe(0);
  });

  test('label-position が読めなければ skipped。他の監査は結果を返す', () => {
    const MA = loadMA().MA;
    const stripped = Object.assign({}, MA, { labelPosition: null });
    const r = report.buildReport(stripped, docsWithOddDma(), { targets: ['x'], only: ['label', 'name'] });
    expect(r.audits.label.status).toBe('skipped');
    expect(r.audits.name.status).toBe('ok');
    expect(r.summary.label).toBe(undefined);
  });

  test('GUI (⇉ 系統チェック) と同じ入力・同じ結果を返す', () => {
    // 画面は traceCoverage.audit(docs) → labelPosition.rank(...) を呼ぶ。
    // CLI が別の道を通っていないことを、結果の同一性で固定する。
    const MA = loadMA().MA;
    const docs = docsWithOddDma();
    const viaGui = MA.labelPosition.rank(MA.traceCoverage.audit(docs));
    const viaCli = labelOnly(docs).audits.label.result;
    expect(JSON.stringify(viaCli)).toBe(JSON.stringify(viaGui));
  });
});
