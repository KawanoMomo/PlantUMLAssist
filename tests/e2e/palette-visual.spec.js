// @ts-check
// userissue v1.2.5: participant カラーパレットを設計ドキュメント向けに刷新
// (Material Design 100 base, 10 色)。 視覚スクショで確認。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');
const path = require('path');

test('VISUAL: new palette renders 10 swatches with role tooltips', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await gotoApp(page);
  // Click an actor (participant) — User on line 3
  await page.locator('#overlay-layer rect[data-type="participant"][data-id="User"]').first().click();
  await page.waitForTimeout(400);
  // Verify all 10 new hex codes are present as data-color attrs
  const expected = ['#FFCDD2', '#FFE0B2', '#FFF9C4', '#C8E6C9', '#B2DFDB', '#BBDEFB', '#D1C4E9', '#F8BBD0', '#D7CCC8', '#CFD8DC'];
  for (const hex of expected) {
    const sw = page.locator('.seq-color-swatch[data-color="' + hex + '"]');
    await expect(sw).toBeVisible();
  }
  // Tooltip on first swatch should contain role text
  const firstTitle = await page.locator('.seq-color-swatch[data-color="#FFCDD2"]').getAttribute('title');
  expect(firstTitle).toContain('Red');
  expect(firstTitle).toContain('#FFCDD2');
  await page.screenshot({
    path: path.join(__dirname, '../../.investigation/palette-01-new-palette.png'),
    fullPage: true,
  });
  // Apply Blue to User (semantic User=Blue) and screenshot the rendered SVG
  await page.locator('.seq-color-swatch[data-color="#BBDEFB"]').click();
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(__dirname, '../../.investigation/palette-02-applied-blue.png'),
    fullPage: true,
  });
});
