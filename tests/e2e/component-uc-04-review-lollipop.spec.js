// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('UC-4: レビュー指摘 (lollipop で interface を明示)', () => {
  test.describe('α: DSL technical', () => {
    test('addRelation provides emits canonical -()', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('relation');
      await page.locator('#co-tail-rkind').selectOption('provides');
      await page.locator('#co-tail-from').selectOption('WebApp');
      await page.locator('#co-tail-to').selectOption('IAuth');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('WebApp -() IAuth');
    });
    test('addRelation requires emits canonical )-', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('relation');
      await page.locator('#co-tail-rkind').selectOption('requires');
      await page.locator('#co-tail-from').selectOption('IAuth');
      await page.locator('#co-tail-to').selectOption('WebApp');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('IAuth )- WebApp');
    });
  });

  test.describe('γ: workflow completion', () => {
    test('lollipop options visible in kind selector', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('relation');
      var options = await page.locator('#co-tail-rkind option').allTextContents();
      expect(options.some(function(o) { return o.includes('Provides'); })).toBe(true);
      expect(options.some(function(o) { return o.includes('Requires'); })).toBe(true);
    });
    test('parser canonicalizes reverse forms', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        var ed = document.getElementById('editor');
        ed.value = '@startuml\nIAuth ()- WebApp\n@enduml';
        ed.dispatchEvent(new Event('input'));
      });
      await page.waitForTimeout(200);
      var rel = await page.evaluate(() => {
        var t = document.getElementById('editor').value;
        return window.MA.modules.plantumlComponent.parse(t).relations[0];
      });
      expect(rel.kind).toBe('provides');
      expect(rel.from).toBe('WebApp');
      expect(rel.to).toBe('IAuth');
    });
  });
});
