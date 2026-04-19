const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture } = require('./helpers');

test.describe('UC-12: hover-to-insert', () => {
  test('click on empty preview area opens insert modal', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);

    var modalBefore = await page.locator('#seq-modal').isVisible();
    expect(modalBefore).toBe(false);

    // page.evaluate で mouse click event を dispatch (mouse API は overlay rect にヒットしてしまうため JS で空白領域 click を合成)
    await page.evaluate(() => {
      var container = document.getElementById('preview-container');
      var overlay = document.getElementById('overlay-layer');
      var ovRect = overlay.getBoundingClientRect();
      var cx = ovRect.left + ovRect.width / 2;
      var cy = ovRect.bottom - 20;  // メッセージ rects より下の空白
      container.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: cx, clientY: cy }));
    });
    await page.waitForTimeout(500);

    expect(await page.locator('#seq-modal').isVisible()).toBe(true);
  });
});
