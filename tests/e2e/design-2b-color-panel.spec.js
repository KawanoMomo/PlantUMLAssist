const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, clickOverlayByLine } = require('./helpers');

// design 2b: 本文 / Label のツールバーは `B I U ··· ↵ creole`。
// 色は常時出さず `···` の内側に畳む。パネルは文字色 / 最近使った色 / 色を外す / Esc で閉じる。
test.describe('design 2b: 色は ··· の内側に畳む', () => {
  test('色パネルは ··· を押すまで幅を取らない', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);

    await clickOverlayByLine(page, 7);
    await page.waitForTimeout(400);

    const editor = page.locator('#seq-edit-msg-label-rle');
    const panel = editor.locator('.rle-color-panel');
    const more = editor.locator('.rle-color-more');

    await expect(more).toBeVisible();
    await expect(editor.locator('.rle-creole')).toBeVisible();
    await expect(panel).toBeHidden();

    // ツールバーは 1 段に収まる (色の見本が並んでいた頃は 280px で折り返していた)
    const toolbar = editor.locator('.rle-toolbar');
    const h = await toolbar.evaluate((el) => el.getBoundingClientRect().height);
    expect(h).toBeLessThan(48);

    await more.click();
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('文字色');
    await expect(panel).toContainText('色を外す');
    await expect(panel).toContainText('Esc で閉じる');
  });

  test('選んだ色が本文に入り、最近使った色として残る', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);

    await clickOverlayByLine(page, 7);
    await page.waitForTimeout(400);

    const editor = page.locator('#seq-edit-msg-label-rle');
    const ta = editor.locator('.rle-textarea');
    await ta.fill('hello');
    await ta.evaluate((el) => el.setSelectionRange(0, 5));

    await editor.locator('.rle-color-more').click();
    const swatch = editor.locator('.rle-color-panel .rle-color').first();
    const used = await swatch.getAttribute('data-color');
    await swatch.click();

    expect(await ta.inputValue()).toBe('<color:' + used + '>hello</color>');
    await expect(editor.locator('.rle-recent-row')).toContainText('最近使った色');
    expect(await editor.locator('.rle-recent-row .rle-recent').first().getAttribute('data-color')).toBe(used);
  });

  test('Esc は色パネルだけを閉じる', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);

    await clickOverlayByLine(page, 7);
    await page.waitForTimeout(400);

    const editor = page.locator('#seq-edit-msg-label-rle');
    const panel = editor.locator('.rle-color-panel');
    await editor.locator('.rle-color-more').click();
    await expect(panel).toBeVisible();

    await editor.locator('.rle-textarea').focus();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(editor.locator('.rle-textarea')).toBeVisible();
  });
});
