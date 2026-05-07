// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('UseCase overlay-driven', () => {
  test('clicking actor in SVG selects it', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-usecase');
    await page.waitForTimeout(2500);
    var actorRect = page.locator('#overlay-layer rect[data-type="actor"]').first();
    var count = await actorRect.count();
    if (count === 0) test.skip();
    await actorRect.click();
    await page.waitForTimeout(300);
    var sel = await page.evaluate(function() { return window.MA.selection.getSelected(); });
    expect(sel.length).toBeGreaterThan(0);
    expect(sel[0].type).toBe('actor');
  });

  test('clicking same actor twice toggles selection off', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-usecase');
    await page.waitForTimeout(2500);
    var actorRect = page.locator('#overlay-layer rect[data-type="actor"]').first();
    var count = await actorRect.count();
    if (count === 0) test.skip();
    await actorRect.click();
    await page.waitForTimeout(200);
    await actorRect.click();
    await page.waitForTimeout(200);
    var sel = await page.evaluate(function() { return window.MA.selection.getSelected(); });
    expect(sel.length).toBe(0);
  });

  test('shift+click on second element opens multi-select connect panel', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-usecase');
    await page.waitForTimeout(2500);
    var actorRect = page.locator('#overlay-layer rect[data-type="actor"]').first();
    var ucRect = page.locator('#overlay-layer rect[data-type="usecase"]').first();
    var aCount = await actorRect.count();
    var uCount = await ucRect.count();
    if (aCount === 0 || uCount === 0) test.skip();
    await actorRect.click();
    await ucRect.click({ modifiers: ['Shift'] });
    await page.waitForTimeout(300);
    var sel = await page.evaluate(function() { return window.MA.selection.getSelected(); });
    expect(sel.length).toBe(2);
    await expect(page.locator('#uc-conn-create')).toBeVisible();
  });

  test('multi-select connect creates relation in DSL', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-usecase');
    await page.waitForTimeout(2500);
    var actorRect = page.locator('#overlay-layer rect[data-type="actor"]').first();
    var ucRect = page.locator('#overlay-layer rect[data-type="usecase"]').first();
    var aCount = await actorRect.count();
    var uCount = await ucRect.count();
    if (aCount === 0 || uCount === 0) test.skip();
    var lineCountBefore = (await getEditorText(page)).split('\n').length;
    await actorRect.click();
    await ucRect.click({ modifiers: ['Shift'] });
    await page.waitForTimeout(300);
    await page.locator('#uc-conn-create').click();
    await page.waitForTimeout(500);
    var lineCountAfter = (await getEditorText(page)).split('\n').length;
    expect(lineCountAfter).toBeGreaterThan(lineCountBefore);
  });

  test('console error count is 0 during overlay interactions', async ({ page }) => {
    var errors = [];
    page.on('console', function(msg) { if (msg.type() === 'error') errors.push(msg.text()); });
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-usecase');
    await page.waitForTimeout(2500);
    var actorRect = page.locator('#overlay-layer rect[data-type="actor"]').first();
    if ((await actorRect.count()) > 0) {
      await actorRect.click();
      await page.waitForTimeout(300);
    }
    var jsErrors = errors.filter(function(e) { return e.indexOf('favicon') < 0; });
    expect(jsErrors).toHaveLength(0);
  });

  // v1.1.2: Japanese actor alias normalizes to ASCII alias (A1) so the new
  // actor is selectable (parser ACTOR_KW_RE only accepts ASCII identifiers).
  test('UC-bug-jp v1.1.2: Japanese-named actor is selectable', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-usecase');
    await page.waitForTimeout(2000);
    await page.locator('#uc-tail-kind').selectOption('actor');
    await page.locator('#uc-tail-alias').fill('管理者');
    await page.locator('#uc-tail-add').click();
    await page.waitForTimeout(2500);
    var t = await getEditorText(page);
    expect(t).toContain('actor "管理者" as A1');
    var rect = page.locator('#overlay-layer rect[data-id="A1"]');
    await expect(rect).toHaveCount(1);
  });
});
