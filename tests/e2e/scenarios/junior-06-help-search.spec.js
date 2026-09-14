// @ts-check
// junior 台本 手順6: 書き方が分からなければ探す。探す先は GUI のヘルプ・補完・エラーメッセージのみで、
// src/ は読まない。「GUI の中だけで分かる」こと自体が到達条件。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順6 コマンドパレットで、やりたいことを日本語で引ける', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, S.GPIO_STATE);
  await page.keyboard.press('Control+k');
  await expect(page.locator('#cp-modal')).toBeVisible();
  await page.locator('#cp-input').fill('保存');
  await page.waitForTimeout(400);
  // 到達条件: 記法を知らなくても、言葉で候補にたどり着く。
  await expect(page.locator('#cp-list')).toContainText('保存');
});

test('手順6 書き方を間違えるとエラーが画面に出る', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, '@startuml\nthis is not plantuml @@@\n@enduml');
  // 到達条件: どこが悪いかが画面から読める (src/ を読みに行かなくて済む)。
  await expect(page.locator('#render-error-overlay')).toBeVisible({ timeout: 20000 });
});
