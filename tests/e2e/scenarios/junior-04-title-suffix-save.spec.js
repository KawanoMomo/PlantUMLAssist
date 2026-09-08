// @ts-check
// junior 台本 手順4: 日本語タイトルの末尾に「(資料用)」を付け足し、図(.puml)をこの名前で保存する。
const { test, expect } = require('@playwright/test');
const { setDiagramTitle } = require('../helpers');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);
const NAME = 'GPIOドライバ状態遷移(資料用)';

test('手順4 タイトル末尾に (資料用) を付けて、その名前で保存フォルダに書ける', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.typeDsl(page, S.GPIO_STATE);

  await setDiagramTitle(page, NAME);
  expect(await page.locator('#editor').inputValue()).toContain('(資料用)');

  await S.renameActive(page, NAME);
  await S.runCommand(page, 'ファイルを保存');
  await page.waitForTimeout(1000);

  // 到達条件: その名前の .puml が保存先にある。
  const saved = await S.readDoc(page, DIR, NAME);
  expect(saved).not.toBeNull();
  expect(saved).toContain('(資料用)');
});
