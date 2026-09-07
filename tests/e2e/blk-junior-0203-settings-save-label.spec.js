// @ts-check
// BLK-junior-20260908-0203: 設定ダイアログの確定ボタンが「保存」だけで、
// Export の「SVGとして保存」等と文言が紛らわしく、文言で探せなかった。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

test.describe('設定の確定ボタンは文言で一意に指せる (BLK-junior-20260908-0203)', () => {
  test('確定ボタンは「設定を保存」と表示され、その文言で押せる', async ({ page }) => {
    await gotoApp(page);
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    await page.locator('#rail-config').click();
    await expect(page.locator('#cfg-modal')).toBeVisible();

    const ok = page.getByRole('button', { name: '設定を保存', exact: true });
    await expect(ok).toHaveCount(1);
    await expect(ok).toBeVisible();
    await expect(page.locator('#cfg-ok')).toHaveText('設定を保存');

    await ok.click();
    await expect(page.locator('#cfg-modal')).toBeHidden();
  });

  test('「設定を保存」を含むボタンは画面上に 1 つだけ', async ({ page }) => {
    await gotoApp(page);
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    await page.locator('#rail-config').click();
    await expect(page.locator('#cfg-modal')).toBeVisible();

    const texts = await page.locator('button').allTextContents();
    const hit = texts.map(t => t.replace(/\s+/g, ' ').trim())
                     .filter(t => t.includes('設定を保存'));
    expect(hit).toEqual(['設定を保存']);
  });
});
