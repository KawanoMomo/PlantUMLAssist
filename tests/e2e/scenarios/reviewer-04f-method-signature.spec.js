// @ts-check
// reviewer 台本 手順4.9: シーケンスのメッセージの引数・戻り値と、クラス図のメソッド宣言が一致するか。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');

test('手順4.9 クラス図に無いメソッドがシーケンスで呼ばれていれば挙がる', () => {
  const declared = R.methods(R.DOCS.driver_common_class).map((m) => m.replace(/^[+\-#]\s*/, '').split('(')[0]);
  // 到達条件その1: クラス図から宣言が読める。
  expect(declared).toContain('Init');
  expect(declared).toContain('Write');

  // 到達条件その2: シーケンスの呼び出し名を宣言と突き合わせられる。
  const calls = R.messages(R.DOCS.spi_init_sequence).map((m) => m.replace(/^\w+?_Driver_/, ''));
  const undeclaredCalls = calls.filter((c) => !declared.includes(c) && !/Done$/.test(c));
  expect(undeclaredCalls).toEqual([]);
});
