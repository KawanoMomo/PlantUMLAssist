const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText } = require('./helpers');

test.describe('UC-13: pulldown new participant', () => {
  test('selecting __new__ in From creates participant + message', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);

    // 末尾追加 menu で message kind
    await page.locator('#seq-tail-kind').selectOption('message');
    await page.waitForTimeout(300);
    await page.locator('#seq-tail-from').selectOption('__new__');
    await page.waitForTimeout(300);

    expect(await page.locator('#seq-tail-new-inline').isVisible()).toBe(true);

    await page.locator('#seq-tail-new-alias').fill('Cache');
    await page.locator('#seq-tail-new-ptype').selectOption('participant');
    await page.locator('#seq-tail-to').selectOption('User');
    await page.locator('#seq-tail-label-rle .rle-textarea').fill('probe');

    await page.locator('#seq-tail-add').click();
    await page.waitForTimeout(600);

    var t = await getEditorText(page);
    expect(t).toContain('participant Cache');
    expect(t).toContain('Cache -> User : probe');
  });
});
