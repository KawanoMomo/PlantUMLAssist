// @ts-check
// junior 台本 手順8: 保存した .puml を一覧から見つけて開き直す。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);
const NAME = 'GPIO状態遷移(資料用)';

test('手順8 保存した .puml を一覧から見つけて開き直せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, NAME, S.GPIO_STATE);

  await S.openFolder(page);
  const filter = page.locator('#folder-filter');
  if (await filter.count()) { await filter.fill('資料用'); await page.waitForTimeout(400); }
  // 到達条件その1: 名前で見つかる。
  await expect(page.locator('#folder-panel .folder-item[data-file-name="' + NAME + '"]')).toBeVisible();

  await S.openFolderItem(page, NAME);
  // 到達条件その2: 開き直した本文が保存した内容と一致し、編集中の本文で上書きされていない。
  expect(await page.locator('#editor').inputValue()).toContain('GPIOドライバ状態遷移');
  expect(await S.readDoc(page, DIR, NAME)).toContain('GPIOドライバ状態遷移');
});
