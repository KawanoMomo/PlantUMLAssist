// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

// BLK-builder-20260907-0843-2c — design 2c「Export メニュー」。
// よく使う 2 つ (SVG 保存 / クリップボードにコピー) がメニューを開かずに
// キー 1 発で出せ、割り当てが行の右に見えていることを実機で確かめる。
test.describe('Export メニューのショートカット (design 2c)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('メニューの行にキー割り当てが出る (割り当ての無い行には出ない)', async ({ page }) => {
    await page.locator('#btn-export').click();
    await expect(page.locator('#export-menu')).toHaveClass(/open/);
    await expect(page.locator('#exp-svg .exp-key')).toHaveText('Ctrl+Shift+S');
    await expect(page.locator('#exp-clipboard .exp-key')).toHaveText('Ctrl+Shift+C');
    expect(await page.locator('#exp-png .exp-key').count()).toBe(0);
    expect(await page.locator('#exp-png-transparent .exp-key').count()).toBe(0);
  });

  test('Ctrl+Shift+S: メニューを開かずに SVG を保存する', async ({ page }) => {
    const dl = page.waitForEvent('download', { timeout: 10000 });
    await page.keyboard.press('Control+Shift+S');
    const file = await dl;
    expect(file.suggestedFilename()).toMatch(/\.svg$/);
    // メニューは開かないままである
    await expect(page.locator('#export-menu')).not.toHaveClass(/open/);
  });

  test('Ctrl+Shift+S: 開いていたメニューは閉じてから実行される', async ({ page }) => {
    await page.locator('#btn-export').click();
    await expect(page.locator('#export-menu')).toHaveClass(/open/);
    const dl = page.waitForEvent('download', { timeout: 10000 });
    await page.keyboard.press('Control+Shift+S');
    await dl;
    await expect(page.locator('#export-menu')).not.toHaveClass(/open/);
  });

  test('Ctrl+Shift+C: クリップボードへのコピーが走る', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const calls = await page.evaluate(() => {
      window.__clipCalls = 0;
      const orig = navigator.clipboard.write.bind(navigator.clipboard);
      // @ts-ignore
      navigator.clipboard.write = function(...a) { window.__clipCalls++; return orig(...a); };
      return window.__clipCalls;
    });
    expect(calls).toBe(0);
    await page.keyboard.press('Control+Shift+C');
    await expect.poll(() => page.evaluate(() => window.__clipCalls), { timeout: 10000 }).toBe(1);
  });

  test('DSL エディタに入力中でも Ctrl+Shift+S は効く (文字入力は奪わない)', async ({ page }) => {
    await page.locator('#editor').click();
    const before = await page.locator('#editor').inputValue();
    const dl = page.waitForEvent('download', { timeout: 10000 });
    await page.keyboard.press('Control+Shift+S');
    await dl;
    expect(await page.locator('#editor').inputValue()).toBe(before);
  });

  test('Ctrl+S (Shift 無し) は書き出しを起こさない', async ({ page }) => {
    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    await page.keyboard.press('Control+S');
    await page.waitForTimeout(1200);
    expect(downloaded).toBe(false);
  });

  test('設定のショートカット一覧に書き出しのキーが載る', async ({ page }) => {
    await page.locator('#btn-config').click();
    await page.locator('#cfg-tab-shortcuts').click();
    const text = await page.locator('#cfg-modal').innerText();
    expect(text).toContain('Ctrl+Shift+S');
    expect(text).toContain('Ctrl+Shift+C');
  });
});
