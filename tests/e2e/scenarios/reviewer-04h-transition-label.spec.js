// @ts-check
// reviewer 台本 手順4.11: 状態遷移図の遷移ラベルが、対応するシーケンス図のメッセージ名と一致するか
// (粒度が揃っていても、架空の名前になっていないか)。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');

test('手順4.11 シーケンスに実在しない遷移ラベルを挙げられる', () => {
  const msgs = new Set(R.messages(R.DOCS.gpio_init_sequence));
  const labels = R.transitions(R.DOCS.gpio_state);
  const phantom = labels.filter((l) => !msgs.has(l));
  // 到達条件: Gpio_Reset はシーケンスに無い架空の名前だと言える。
  expect(labels).toContain('Gpio_Init');
  expect(phantom).toEqual(['Gpio_Reset']);
});
