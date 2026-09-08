// @ts-check
// junior 台本 手順5: Export メニューから資料に貼る画像を書き出す。
// 状態遷移図は「SVGとして保存」、他の図種は「PNG(透過背景)」。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順5(状態遷移図) SVG として書き出せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, S.GPIO_STATE);
  await S.renameActive(page, 'gpio_state_doc');

  const download = await (await S.exportVia(page, 'exp-svg'));
  // 到達条件: SVG が 1 本書き出される。
  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.svg$/);
});

test('手順5(他の図種) PNG(透過背景)も同じメニューから選べる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, S.GPIO_SEQ);
  await S.renameActive(page, 'gpio_seq_doc');

  const download = await (await S.exportVia(page, 'exp-png-transparent'));
  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.png$/);
});
