// @ts-check
// reviewer 台本 手順3: シーケンス図のメッセージが、状態遷移図の遷移として存在するか突合する。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');

test('手順3 シーケンスのメッセージが状態遷移に無ければ名指しできる', () => {
  const msgs = R.messages(R.DOCS.gpio_init_sequence);
  const trans = R.transitions(R.DOCS.gpio_state);
  const missing = msgs.filter((m) => !trans.includes(m));
  // 到達条件: 突合の結果が言葉で出る。Gpio_Init は両方にあり、Gpio_Done は状態遷移に無い。
  expect(msgs).toContain('Gpio_Init');
  expect(trans).toContain('Gpio_Init');
  expect(missing).toEqual(['Gpio_Done']);
});
