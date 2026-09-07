// @ts-check
// BLK-junior-20260907-0943: 他の図から取り込んだ `interface "GPIO制御" as IGpio` が
// `interface ""GPIO制御" as IGpio" as C1` に壊れた。取り込みで壊れないことを実機で見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const BLOCK = [
  'component "GPIOドライバ" as GpioDrv',
  'interface "GPIO制御" as IGpio',
  'GpioDrv ..> IGpio',
].join('\n');

test.describe('BLK-junior-0943 別名つきの宣言を取り込んでも壊れない', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('一括欄に貼った別名つき宣言が、そのままの名前と表示名で入る', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#rail-cmp').click();
    await page.waitForTimeout(600);

    await page.locator('#co-tail-kind').selectOption('bulk');
    await page.waitForTimeout(300);
    await page.locator('#co-tail-bulk').fill(BLOCK);
    await page.locator('#co-tail-add').click();
    await page.waitForTimeout(800);

    const dsl = await getEditorText(page);
    expect(dsl).toContain('component "GPIOドライバ" as GpioDrv');
    expect(dsl).toContain('interface "GPIO制御" as IGpio');
    // 起票された壊れ方が出ないこと
    expect(dsl).not.toContain('""');
    expect(dsl).not.toMatch(/as C\d/);
  });

  test('取り込んだあとも図が描ける (壊れた DSL のまま保存されない)', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#rail-cmp').click();
    await page.waitForTimeout(600);
    await page.locator('#co-tail-kind').selectOption('bulk');
    await page.waitForTimeout(300);
    await page.locator('#co-tail-bulk').fill(BLOCK);
    await page.locator('#co-tail-add').click();
    await page.waitForTimeout(900);

    // 壊れた宣言が入ると PlantUML が構文エラーを返し、描画が止まる。
    await expect(page.locator('#render-status')).toContainText('OK');
  });
});
