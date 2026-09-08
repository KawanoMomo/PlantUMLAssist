// @ts-check
// reviewer 台本 手順4: クラス図のクラス名が、シーケンスの participant 名と一致するか突合する。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');

test('手順4 クラス名と participant 名の食い違いを挙げられる', () => {
  const classes = R.classNames(R.DOCS.driver_common_class);
  expect(classes).toContain('Gpio_Driver');
  const parts = R.participants(R.DOCS.gpio_init_sequence);
  // 到達条件: クラス図にある Gpio_Driver がシーケンスに無い(GpioDrv になっている)と言える。
  expect(parts).not.toContain('Gpio_Driver');
  expect(parts).toContain('GpioDrv');
  const unmatched = classes.filter((c) => !parts.includes(c) && /Gpio/.test(c));
  expect(unmatched).toEqual(['Gpio_Driver']);
});
