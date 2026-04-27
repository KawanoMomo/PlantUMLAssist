// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('State v1.0.0', () => {
  test.describe('α: DSL technical', () => {
    test('UC-1: switching to State loads template', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-state');
      await page.waitForTimeout(500);
      var t = await getEditorText(page);
      expect(t).toContain('state Idle');
      expect(t).toContain('[*]');
    });
    test('UC-2: tail-add state emits canonical', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-state');
      await page.waitForTimeout(500);
      await page.locator('#st-tail-kind').selectOption('state');
      await page.locator('#st-tail-id').fill('Paused');
      await page.locator('#st-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('state Paused');
    });
    test('UC-3: tail-add composite emits state X { }', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-state');
      await page.waitForTimeout(500);
      await page.locator('#st-tail-kind').selectOption('composite');
      await page.locator('#st-tail-id').fill('Outer');
      await page.locator('#st-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('state Outer {');
      expect(t).toContain('}');
    });
    test('UC-4: tail-add transition with full label', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-state');
      await page.waitForTimeout(500);
      await page.locator('#st-tail-kind').selectOption('transition');
      await page.locator('#st-tail-from').selectOption('Idle');
      await page.locator('#st-tail-to').selectOption('Active');
      await page.locator('#st-tail-trig').fill('click');
      await page.locator('#st-tail-guard').fill('enabled');
      await page.locator('#st-tail-act').fill('save()');
      await page.locator('#st-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('Idle --> Active : click [enabled] / save()');
    });
  });

  test.describe('γ: form + overlay', () => {
    test('UC-5: clicking state overlay opens edit panel', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-state');
      await page.waitForTimeout(2500);
      var rect = page.locator('#overlay-layer rect[data-type="state"]').first();
      var c = await rect.count();
      if (c === 0) test.skip();
      await rect.click();
      await page.waitForTimeout(300);
      var idField = await page.locator('#st-id').count();
      expect(idField).toBeGreaterThan(0);
    });
    test('UC-6: hover preview shows insert guide', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-state');
      await page.waitForTimeout(2500);
      var rect = page.locator('#overlay-layer rect[data-type="state"]').first();
      var c = await rect.count();
      if (c === 0) test.skip();
      var box = await rect.boundingBox();
      // Hover BELOW the state rect: state diagrams render transition arrows as
      // overlay rects too, so the area immediately above a state typically
      // overlaps the incoming transition rect (which would suppress the
      // hover guide via app.js: data-type check). The gap right after a
      // state -- before the next transition rect -- is empty space.
      await page.mouse.move(box.x + box.width / 2, box.y + box.height + 10);
      await page.waitForTimeout(200);
      var guide = await page.locator('#hover-layer .hover-guide').count();
      expect(guide).toBeGreaterThan(0);
    });
    test('UC-7: empty click opens insert modal', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-state');
      await page.waitForTimeout(2500);
      var rect = page.locator('#overlay-layer rect[data-type="state"]').first();
      var c = await rect.count();
      if (c === 0) test.skip();
      var box = await rect.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height + 6);
      await page.waitForTimeout(300);
      var modalDisplay = await page.locator('#st-modal').evaluate(function(el) { return el.style.display; });
      expect(modalDisplay).toBe('flex');
      // Cancel to clean up
      await page.locator('#st-mod-cancel').click();
    });
    test('UC-8: console error count is 0', async ({ page }) => {
      var errors = [];
      page.on('console', function(msg) { if (msg.type() === 'error') errors.push(msg.text()); });
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-state');
      await page.waitForTimeout(2500);
      var rect = page.locator('#overlay-layer rect[data-type="state"]').first();
      if ((await rect.count()) > 0) {
        await rect.click();
        await page.waitForTimeout(200);
      }
      var jsErrors = errors.filter(function(e) { return e.indexOf('favicon') < 0; });
      expect(jsErrors).toHaveLength(0);
    });
  });
});
