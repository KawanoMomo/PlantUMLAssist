// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('UC-3: 不具合対応 (dependency 追記)', () => {
  test.describe('α: DSL technical', () => {
    test('addRelation dependency emits canonical', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('relation');
      await page.locator('#co-tail-rkind').selectOption('dependency');
      await page.locator('#co-tail-from').selectOption('WebApp');
      await page.locator('#co-tail-to').selectOption('IAuth');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('WebApp ..> IAuth');
    });
    test('parser distinguishes association vs dependency', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        var ed = document.getElementById('editor');
        ed.value = '@startuml\nA -- B\nC ..> D\n@enduml';
        ed.dispatchEvent(new Event('input'));
      });
      await page.waitForTimeout(200);
      var kinds = await page.evaluate(() => {
        var t = document.getElementById('editor').value;
        return window.MA.modules.plantumlComponent.parse(t).relations.map(function(r) { return r.kind; });
      });
      expect(kinds).toContain('association');
      expect(kinds).toContain('dependency');
    });
  });

  test.describe('γ: workflow completion', () => {
    test('relation kind selector exposes both options', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('relation');
      var options = await page.locator('#co-tail-rkind option').allTextContents();
      expect(options.some(function(o) { return o.includes('Association'); })).toBe(true);
      expect(options.some(function(o) { return o.includes('Dependency'); })).toBe(true);
    });
    test('post-add kind change works via updateRelation API', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        var ed = document.getElementById('editor');
        ed.value = '@startuml\nA -- B\n@enduml';
        ed.dispatchEvent(new Event('input'));
      });
      await page.waitForTimeout(200);
      var newT = await page.evaluate(() => {
        var t = document.getElementById('editor').value;
        return window.MA.modules.plantumlComponent.updateRelation(t, 2, 'kind', 'dependency');
      });
      expect(newT).toContain('A ..> B');
    });
  });
});
