// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText, clickOverlayByLine } = require('./helpers');

test.describe('UC-3: 仕様変更 (Cache 層)', () => {
  test('Cache 参加者を末尾追加 + 既存メッセージの 1本の to を Cache に変更', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-cache-spec.puml');
    await page.waitForTimeout(1500);

    // 1. Cache 参加者を末尾追加 (位置駆動挿入は Sprint 7 で完成、ここでは末尾追加で代替)
    await page.locator('#seq-tail-kind').selectOption('participant');
    await page.locator('#seq-tail-ptype').selectOption('participant');
    await page.locator('#seq-tail-alias').fill('Cache');
    await page.locator('#seq-tail-add').click();
    await page.waitForTimeout(300);

    // 2. 既存 query1 message (line 6) をクリックして to を Cache に変更
    await clickOverlayByLine(page, 6);
    await page.waitForTimeout(300);
    await page.locator('#seq-edit-to').selectOption('Cache');
    await page.waitForTimeout(500);

    var t = await getEditorText(page);
    expect(t).toContain('participant Cache');
    expect(t).toContain('System -> Cache : query1');
  });
});
