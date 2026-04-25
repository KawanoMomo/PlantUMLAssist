// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('UC-4: レビュー指摘 (package境界の明示)', () => {

  test.describe('α: DSL technical', () => {
    test('addPackage inserts canonical package open + close', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-usecase');
      await page.waitForTimeout(300);
      await page.locator('#uc-tail-kind').selectOption('package');
      await page.locator('#uc-tail-label').fill('Auth Module');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('package "Auth Module" {');
      expect(t).toMatch(/\}\s*\n@enduml/);
    });

    test('parser assigns parentPackageId to elements moved into package', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-usecase');
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        var ed = document.getElementById('editor');
        ed.value = '@startuml\npackage "Auth" {\nactor U\nusecase L1\n}\n@enduml';
        ed.dispatchEvent(new Event('input'));
      });
      await page.waitForTimeout(300);
      var parentIds = await page.evaluate(() => {
        var t = document.getElementById('editor').value;
        var parsed = window.MA.modules.plantumlUsecase.parse(t);
        return parsed.elements.map(function(e) { return e.parentPackageId; });
      });
      expect(parentIds.every(function(id) { return id !== null; })).toBe(true);
    });
  });

  test.describe('γ: workflow completion', () => {
    test('レビュー指摘で package 追加: Auth境界を引く', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-usecase');
      await page.waitForTimeout(300);
      await page.locator('#uc-tail-kind').selectOption('package');
      await page.locator('#uc-tail-label').fill('Authentication');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('package "Authentication"');
    });

    test('package 追加直後は内側が空 (要素手動移動は v0.5.0)', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-usecase');
      await page.waitForTimeout(300);
      await page.locator('#uc-tail-kind').selectOption('package');
      await page.locator('#uc-tail-label').fill('Empty');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      var lines = t.split('\n');
      var openIdx = lines.findIndex(function(l) { return l.includes('package "Empty"'); });
      var closeIdx = lines.findIndex(function(l, i) { return i > openIdx && l.trim() === '}'; });
      expect(closeIdx).toBeGreaterThan(openIdx);
      for (var i = openIdx + 1; i < closeIdx; i++) {
        expect(lines[i].trim()).toBe('');
      }
    });
  });
});
