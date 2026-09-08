// @ts-check
// reviewer 台本 手順4.7: 同一サブシステムのシーケンス図と状態遷移図で、分解の粒度が揃っているか。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');

test('手順4.7 シーケンスと状態遷移の粒度差を数で言える', () => {
  const pairs = [['spi_init_sequence', 'spi_state'], ['gpio_init_sequence', 'gpio_state']];
  const report = pairs.map(([seq, st]) => ({
    subsystem: seq.split('_')[0],
    messages: R.messages(R.DOCS[seq]).length,
    transitions: R.transitions(R.DOCS[st]).length,
  }));
  // 到達条件: 図の組ごとに数が出て、差がある組を指せる。
  expect(report.length).toBe(2);
  for (const r of report) expect(r.messages).toBeGreaterThan(0);
  const skewed = report.filter((r) => Math.abs(r.messages - r.transitions) >= 1);
  expect(skewed.length).toBeGreaterThan(0);
});
