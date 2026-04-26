// @ts-check
// Generates screenshots for README.md feature documentation.
// Run: npx playwright test tests/e2e/readme-screenshots.spec.js --workers=1
const { test } = require('@playwright/test');
const { gotoApp } = require('./helpers');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', '..', 'docs', 'images');

test.describe('README screenshots', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('01 — top: sequence (default) full UI', async ({ page }) => {
    await gotoApp(page);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT_DIR, '01-sequence-default.png'), fullPage: false });
  });

  test('02 — sequence: click message to edit', async ({ page }) => {
    await gotoApp(page);
    await page.waitForTimeout(2500);
    var msgRect = page.locator('#overlay-layer rect[data-type="message"]').first();
    if ((await msgRect.count()) > 0) {
      await msgRect.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT_DIR, '02-sequence-message-selected.png'), fullPage: false });
    }
  });

  test('03 — usecase: overlay-driven default', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-usecase');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT_DIR, '03-usecase-default.png'), fullPage: false });
  });

  test('04 — usecase: click actor to select + edit', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-usecase');
    await page.waitForTimeout(2500);
    var actorRect = page.locator('#overlay-layer rect[data-type="actor"]').first();
    if ((await actorRect.count()) > 0) {
      await actorRect.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT_DIR, '04-usecase-actor-selected.png'), fullPage: false });
    }
  });

  test('05 — usecase: multi-select connect (Shift+click)', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-usecase');
    await page.waitForTimeout(2500);
    var actorRect = page.locator('#overlay-layer rect[data-type="actor"]').first();
    var ucRect = page.locator('#overlay-layer rect[data-type="usecase"]').first();
    if ((await actorRect.count()) > 0 && (await ucRect.count()) > 0) {
      await actorRect.click();
      await ucRect.click({ modifiers: ['Shift'] });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT_DIR, '05-usecase-multi-select-connect.png'), fullPage: false });
    }
  });

  test('06 — component: overlay-driven default', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-component');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT_DIR, '06-component-default.png'), fullPage: false });
  });

  test('07 — component: click relation to edit (kind switch)', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-component');
    await page.waitForTimeout(2500);
    var relRect = page.locator('#overlay-layer rect[data-type="relation"]').first();
    if ((await relRect.count()) > 0) {
      await relRect.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT_DIR, '07-component-relation-selected.png'), fullPage: false });
    }
  });

  test('08 — component: multi-select connect with 4 kind options', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-component');
    await page.waitForTimeout(2500);
    var c = page.locator('#overlay-layer rect[data-type="component"]').first();
    var i = page.locator('#overlay-layer rect[data-type="interface"]').first();
    if ((await c.count()) > 0 && (await i.count()) > 0) {
      await c.click();
      await i.click({ modifiers: ['Shift'] });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT_DIR, '08-component-connect-panel.png'), fullPage: false });
    }
  });

  test('09 — component: with port (block form)', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-component');
    await page.waitForTimeout(2500);
    // Add port via property panel
    await page.locator('#co-tail-kind').selectOption('port');
    await page.locator('#co-tail-parent').selectOption('WebApp');
    await page.locator('#co-tail-alias').fill('p1');
    await page.locator('#co-tail-add').click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT_DIR, '09-component-port-block.png'), fullPage: false });
  });

  test('10 — sequence: tail-add panel (no selection)', async ({ page }) => {
    await gotoApp(page);
    await page.waitForTimeout(2500);
    // Make sure no selection
    await page.evaluate(function() { window.MA.selection.clearSelection(); });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT_DIR, '10-sequence-tail-add.png'), fullPage: false });
  });
});
