// @ts-check
// junior 台本 手順2: タイトル・要素名が読める内容か確認する(読みにくければ先に GUI 上で直す)。
const { test, expect } = require('@playwright/test');
const { setDiagramTitle } = require('../helpers');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順2 タイトルと要素名が読め、読みにくければ GUI で直せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, S.GPIO_STATE);
  await page.waitForTimeout(1500);

  // 到達条件その1: 描かれた図にタイトルと状態名が文字として出る。
  const svg = await page.locator('#preview-svg').innerHTML();
  expect(svg).toContain('Ready');

  // 到達条件その2: 読みにくいタイトルを GUI(図の設定)から直せる。
  await setDiagramTitle(page, 'GPIOドライバ 状態遷移');
  expect(await page.locator('#editor').inputValue()).toContain('title GPIOドライバ 状態遷移');
});
