// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('Component overlay-driven', () => {
  test('clicking component in SVG selects it', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-component');
    await page.waitForTimeout(2500);
    var rect = page.locator('#overlay-layer rect[data-type="component"]').first();
    var count = await rect.count();
    if (count === 0) test.skip();
    await rect.click();
    await page.waitForTimeout(300);
    var sel = await page.evaluate(function() { return window.MA.selection.getSelected(); });
    expect(sel.length).toBeGreaterThan(0);
    expect(sel[0].type).toBe('component');
  });

  test('shift+click 2 elements opens connect panel with 4 kind options', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-component');
    await page.waitForTimeout(2500);
    var c = page.locator('#overlay-layer rect[data-type="component"]').first();
    var i = page.locator('#overlay-layer rect[data-type="interface"]').first();
    var cCount = await c.count();
    var iCount = await i.count();
    if (cCount === 0 || iCount === 0) test.skip();
    await c.click();
    await i.click({ modifiers: ['Shift'] });
    await page.waitForTimeout(300);
    await expect(page.locator('#co-conn-create')).toBeVisible();
    var options = await page.locator('#co-conn-kind option').allTextContents();
    expect(options.some(function(o) { return o.indexOf('Association') >= 0; })).toBe(true);
    expect(options.some(function(o) { return o.indexOf('Dependency') >= 0; })).toBe(true);
    expect(options.some(function(o) { return o.indexOf('Provides') >= 0; })).toBe(true);
    expect(options.some(function(o) { return o.indexOf('Requires') >= 0; })).toBe(true);
  });

  test('multi-select connect creates relation in DSL', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-component');
    await page.waitForTimeout(2500);
    var c = page.locator('#overlay-layer rect[data-type="component"]').first();
    var i = page.locator('#overlay-layer rect[data-type="interface"]').first();
    var cCount = await c.count();
    var iCount = await i.count();
    if (cCount === 0 || iCount === 0) test.skip();
    var lineCountBefore = (await getEditorText(page)).split('\n').length;
    await c.click();
    await i.click({ modifiers: ['Shift'] });
    await page.waitForTimeout(300);
    await page.locator('#co-conn-create').click();
    await page.waitForTimeout(800);
    var lineCountAfter = (await getEditorText(page)).split('\n').length;
    expect(lineCountAfter).toBeGreaterThan(lineCountBefore);
  });

  test('relation kind selector switches DSL arrow on update', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-component');
    await page.waitForTimeout(2500);
    var relRect = page.locator('#overlay-layer rect[data-type="relation"]').first();
    var count = await relRect.count();
    if (count === 0) test.skip();
    await relRect.click();
    await page.waitForTimeout(300);
    await page.locator('#co-rel-kind').selectOption('dependency');
    await page.locator('#co-rel-apply').click();
    await page.waitForTimeout(800);
    var t = await getEditorText(page);
    expect(t).toContain('..>');
  });

  test('console error count is 0 during overlay interactions', async ({ page }) => {
    var errors = [];
    page.on('console', function(msg) { if (msg.type() === 'error') errors.push(msg.text()); });
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-component');
    await page.waitForTimeout(2500);
    var c = page.locator('#overlay-layer rect[data-type="component"]').first();
    if ((await c.count()) > 0) {
      await c.click();
      await page.waitForTimeout(300);
    }
    var jsErrors = errors.filter(function(e) { return e.indexOf('favicon') < 0; });
    expect(jsErrors).toHaveLength(0);
  });
});
