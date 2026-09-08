// @ts-check
// reviewer 台本 手順4.5: 命名規約の一貫性(略語の大文字化・接頭辞+アンダースコア)が図間で揃っているか。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');

test('手順4.5 多数派の命名から外れた名前だけを挙げられる', () => {
  const names = new Set();
  for (const dsl of Object.values(R.DOCS)) {
    R.participants(dsl).forEach((n) => names.add(n));
    R.classNames(dsl).forEach((n) => names.add(n));
  }
  const all = [...names];
  const underscore = all.filter((n) => /_/.test(n));
  const deviating = all.filter((n) => /Drv$/.test(n));
  // 到達条件: 多数派が Xxx_Yyy 形で、外れているのは 1 つだけだと言い切れる。
  expect(underscore.length).toBeGreaterThan(deviating.length);
  expect(deviating).toEqual(['GpioDrv']);
});
