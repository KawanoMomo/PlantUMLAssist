// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('Class diagram (v0.6.0)', () => {
  test.describe('α: DSL technical', () => {
    test('switching to Class loads template with class + interface', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(500);
      var t = await getEditorText(page);
      expect(t).toContain('class User');
      expect(t).toContain('interface IAuth');
    });

    test('add class via tail-add emits canonical', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(500);
      await page.locator('#cl-tail-kind').selectOption('class');
      await page.locator('#cl-tail-alias').fill('Order');
      await page.locator('#cl-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('class Order');
    });

    test('add abstract class with stereotype', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(500);
      await page.locator('#cl-tail-kind').selectOption('abstract');
      await page.locator('#cl-tail-alias').fill('Shape');
      await page.locator('#cl-tail-stereo').fill('Geometry');
      await page.locator('#cl-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('abstract class Shape');
      expect(t).toContain('<<Geometry>>');
    });

    test('add enum with values', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(500);
      await page.locator('#cl-tail-kind').selectOption('enum');
      await page.locator('#cl-tail-alias').fill('Color');
      await page.locator('#cl-tail-values').fill('RED\nGREEN\nBLUE');
      await page.locator('#cl-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('enum Color');
      expect(t).toContain('RED');
      expect(t).toContain('GREEN');
      expect(t).toContain('BLUE');
    });

    test('add inheritance relation emits canonical (parent <|-- child)', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(500);
      await page.locator('#cl-tail-kind').selectOption('class');
      await page.locator('#cl-tail-alias').fill('Animal');
      await page.locator('#cl-tail-add').click();
      await page.waitForTimeout(200);
      await page.locator('#cl-tail-kind').selectOption('class');
      await page.locator('#cl-tail-alias').fill('Dog');
      await page.locator('#cl-tail-add').click();
      await page.waitForTimeout(200);
      await page.locator('#cl-tail-kind').selectOption('relation');
      await page.locator('#cl-tail-rkind').selectOption('inheritance');
      await page.locator('#cl-tail-from').selectOption('Animal');
      await page.locator('#cl-tail-to').selectOption('Dog');
      await page.locator('#cl-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('Animal <|-- Dog');
    });

    test('add generics class', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(500);
      await page.locator('#cl-tail-kind').selectOption('class');
      await page.locator('#cl-tail-alias').fill('Container');
      await page.locator('#cl-tail-generics').fill('T');
      await page.locator('#cl-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('class Container<T>');
    });
  });

  test.describe('γ: overlay-driven', () => {
    test('clicking class in SVG selects it', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(2500);
      var rect = page.locator('#overlay-layer rect[data-type="class"]').first();
      var count = await rect.count();
      if (count === 0) test.skip();
      await rect.click();
      await page.waitForTimeout(300);
      var sel = await page.evaluate(function() { return window.MA.selection.getSelected(); });
      expect(sel[0].type).toBe('class');
    });

    test('clicking interface selects with interface type', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(2500);
      var rect = page.locator('#overlay-layer rect[data-type="interface"]').first();
      var count = await rect.count();
      if (count === 0) test.skip();
      await rect.click();
      await page.waitForTimeout(300);
      var sel = await page.evaluate(function() { return window.MA.selection.getSelected(); });
      expect(sel[0].type).toBe('interface');
    });

    test('shift+click 2 elements opens connect panel with 6 kind options', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(2500);
      var c = page.locator('#overlay-layer rect[data-type="class"]').first();
      var i = page.locator('#overlay-layer rect[data-type="interface"]').first();
      if ((await c.count()) === 0 || (await i.count()) === 0) test.skip();
      await c.click();
      await i.click({ modifiers: ['Shift'] });
      await page.waitForTimeout(300);
      var options = await page.locator('#cl-conn-kind option').allTextContents();
      expect(options.some(function(o) { return o.indexOf('Inheritance') >= 0; })).toBe(true);
      expect(options.some(function(o) { return o.indexOf('Implementation') >= 0; })).toBe(true);
      expect(options.some(function(o) { return o.indexOf('Composition') >= 0; })).toBe(true);
      expect(options.some(function(o) { return o.indexOf('Aggregation') >= 0; })).toBe(true);
      expect(options.some(function(o) { return o.indexOf('Dependency') >= 0; })).toBe(true);
      expect(options.some(function(o) { return o.indexOf('Association') >= 0; })).toBe(true);
    });

    test('multi-select connect creates relation in DSL', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(2500);
      var c = page.locator('#overlay-layer rect[data-type="class"]').first();
      var i = page.locator('#overlay-layer rect[data-type="interface"]').first();
      if ((await c.count()) === 0 || (await i.count()) === 0) test.skip();
      var lineCountBefore = (await getEditorText(page)).split('\n').length;
      await c.click();
      await i.click({ modifiers: ['Shift'] });
      await page.waitForTimeout(300);
      await page.locator('#cl-conn-create').click();
      await page.waitForTimeout(800);
      var lineCountAfter = (await getEditorText(page)).split('\n').length;
      expect(lineCountAfter).toBeGreaterThan(lineCountBefore);
    });

    test('console error count is 0 during overlay interactions', async ({ page }) => {
      var errors = [];
      page.on('console', function(msg) { if (msg.type() === 'error') errors.push(msg.text()); });
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(2500);
      var c = page.locator('#overlay-layer rect[data-type="class"]').first();
      if ((await c.count()) > 0) {
        await c.click();
        await page.waitForTimeout(300);
      }
      var jsErrors = errors.filter(function(e) { return e.indexOf('favicon') < 0; });
      expect(jsErrors).toHaveLength(0);
    });

    // v1.1.2: Japanese class alias normalizes to ASCII alias + label so the
    // class is selectable via overlay click (parser CLASS_KW_RE only accepts
    // ASCII identifiers).
    test('UC-bug-jp v1.1.2: Japanese-named class is selectable', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(3000);
      await page.locator('#cl-tail-kind').selectOption('class');
      await page.locator('#cl-tail-alias').fill('クラスA');
      await page.locator('#cl-tail-add').click();
      // Class template is bigger (multiple classes + relations) so the render
      // round-trip + buildOverlay takes longer than other modules. The
      // expect.toHaveCount below polls up to 5s on its own, but the overlay
      // is only attached after the render fetch resolves.
      await page.waitForTimeout(4500);
      var t = await getEditorText(page);
      expect(t).toContain('class "クラスA" as C1');
      var rect = page.locator('#overlay-layer rect[data-id="C1"]');
      await expect(rect).toHaveCount(1, { timeout: 8000 });
    });
  });
});
