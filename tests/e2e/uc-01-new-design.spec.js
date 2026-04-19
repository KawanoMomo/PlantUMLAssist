// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText } = require('./helpers');

test.describe('UC-1: 新規機能設計 (API認証フロー)', () => {
  test('空からシーケンス図を組み立てる (3 actors / 4 msg)', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'empty.puml');

    // 末尾追加メニューで User actor を追加
    await page.locator('#seq-tail-kind').selectOption('participant');
    await page.locator('#seq-tail-ptype').selectOption('actor');
    await page.locator('#seq-tail-alias').fill('User');
    await page.locator('#seq-tail-add').click();
    await page.waitForTimeout(300);

    // System
    await page.locator('#seq-tail-kind').selectOption('participant');
    await page.locator('#seq-tail-ptype').selectOption('participant');
    await page.locator('#seq-tail-alias').fill('System');
    await page.locator('#seq-tail-add').click();
    await page.waitForTimeout(300);

    // DB
    await page.locator('#seq-tail-kind').selectOption('participant');
    await page.locator('#seq-tail-ptype').selectOption('database');
    await page.locator('#seq-tail-alias').fill('DB');
    await page.locator('#seq-tail-add').click();
    await page.waitForTimeout(300);

    // メッセージ4本
    const addMsg = async (from, to, label) => {
      await page.locator('#seq-tail-kind').selectOption('message');
      await page.locator('#seq-tail-from').selectOption(from);
      await page.locator('#seq-tail-to').selectOption(to);
      // rich editor の textarea で本文入力
      await page.locator('#seq-tail-label-rle .rle-textarea').fill(label);
      await page.locator('#seq-tail-add').click();
      await page.waitForTimeout(300);
    };
    await addMsg('User', 'System', 'login');
    await addMsg('System', 'DB', 'query');
    await addMsg('DB', 'System', 'result');
    await addMsg('System', 'User', 'response');

    var t = await getEditorText(page);
    expect(t).toContain('actor User');
    expect(t).toContain('participant System');
    expect(t).toContain('database DB');
    expect(t).toContain('User -> System : login');
    expect(t).toContain('System -> DB : query');
    expect(t).toContain('DB -> System : result');
    expect(t).toContain('System -> User : response');
  });
});
