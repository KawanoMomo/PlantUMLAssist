'use strict';
// BLK-reviewer-20260907-1803: npm run audit の粒度検定が、初期化手順のシーケンスと
// 初期化後の状態遷移という意図して粒度の違う 2 枚を、同じフォルダにあるというだけで
// 突き合わせて全件を「食い違い」にしていた。
// フォルダ名で系統をまとめないこと、粒度違いの組は突き合わせず件数にも入らないこと、
// 要約が「何を見ていないか」を言うことを固定する。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadMA } = require('../tools/audit-runtime');
const report = require('../tools/audit-report');

const { MA } = loadMA();

const INIT_SEQ = [
  '@startuml',
  'Drv -> Adc : EnableClock()',
  'Drv -> Adc : WriteConfig()',
  'Drv -> Adc : EnableIrq()',
  'Adc --> Drv : Ack',
  'Adc --> Drv : InitDone',
  '@enduml',
].join('\n');

const STATE = [
  '@startuml',
  '[*] --> Idle',
  'Idle --> Configured : Adc_Configure',
  'Configured --> Sampling : Adc_StartConv',
  'Sampling --> Idle : ConvComplete',
  '@enduml',
].join('\n');

// 同じ図種の写し。1 本足りないのは書き漏らしなので、これは出さなければならない。
const STATE_COPY = [
  '@startuml',
  '[*] --> Idle',
  'Idle --> Configured : Adc_Configure',
  'Configured --> Sampling : Adc_StartConv',
  '@enduml',
].join('\n');

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pua-gran-'));
  Object.keys(files).forEach((rel) => {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, files[rel], 'utf-8');
  });
  return dir;
}

function auditOf(dir) {
  const docs = report.collectDocs([dir]);
  const audits = report.runAudits(MA, docs);
  return { docs, audits, summary: report.summarize(audits) };
}

describe('粒度検定の過検出 (BLK-reviewer-20260907-1803)', () => {
  test('初期化手順と状態遷移は突き合わせず、粒度の指摘を出さない', () => {
    const dir = fixture({
      'primary/adc_init_sequence.puml': INIT_SEQ,
      'primary/adc_state.puml': STATE,
    });
    const { audits } = auditOf(dir);
    expect(audits.consistency.result.granularity).toEqual([]);
    const fam = audits.family.result;
    expect(fam.length).toBe(1);
    expect(fam[0].key).toBe('adc');
    expect(fam[0].mismatches).toEqual([]);
    expect(fam[0].skipped.length).toBe(1);
  });

  test('フォルダが同じでも別系統は混ぜない', () => {
    const dir = fixture({
      'primary/adc_init_sequence.puml': INIT_SEQ,
      'primary/adc_state.puml': STATE,
      'primary/uart_init_sequence.puml': INIT_SEQ.replace(/Adc/g, 'Uart'),
      'primary/uart_state.puml': STATE.replace(/Adc/g, 'Uart'),
    });
    const { audits } = auditOf(dir);
    const keys = audits.family.result.map((f) => f.key).sort();
    expect(keys).toEqual(['adc', 'uart']);
    // 系統を跨いだ突き合わせが消えるので、粒度の指摘も出ない。
    expect(audits.consistency.result.granularity).toEqual([]);
  });

  test('同じ図種どうしの書き漏らしは今までどおり出る', () => {
    const dir = fixture({
      'primary/adc_state.puml': STATE,
      'primary/adc_state_copy.puml': STATE_COPY,
    });
    const { audits } = auditOf(dir);
    const labels = audits.consistency.result.granularity.map((g) => g.label);
    expect(labels).toEqual(['ConvComplete']);
  });

  test('要約は突き合わせ対象外にした組数を言う', () => {
    const dir = fixture({
      'primary/adc_init_sequence.puml': INIT_SEQ,
      'primary/adc_state.puml': STATE,
    });
    const { docs, audits, summary } = auditOf(dir);
    expect(summary.family.skippedPairs).toBe(1);
    const text = report.formatSummary(report.buildReport(MA, docs, { targets: [dir] }));
    expect(text).toContain('粒度違いで突き合わせ対象外 1 組');
  });
});
