// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('UC-2: 仕様変更 (新規 component を package 内に追加)', () => {
  test.describe('α: DSL technical', () => {
    test('parser assigns parentPackageId', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        var ed = document.getElementById('editor');
        ed.value = '@startuml\npackage "Backend" {\ncomponent W\n}\n@enduml';
        ed.dispatchEvent(new Event('input'));
      });
      await page.waitForTimeout(300);
      var parentId = await page.evaluate(() => {
        var t = document.getElementById('editor').value;
        var p = window.MA.modules.plantumlComponent.parse(t);
        return p.elements[0].parentPackageId;
      });
      expect(parentId).toBeTruthy();
    });
    test('addPackage emits canonical', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('package');
      await page.locator('#co-tail-label').fill('Frontend');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('package "Frontend" {');
    });
  });

  test.describe('γ: workflow completion', () => {
    test('user can add package in single op', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('package');
      await page.locator('#co-tail-label').fill('Auth');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('package "Auth"');
    });
    test('package open and close paired', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('package');
      await page.locator('#co-tail-label').fill('X');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      var lines = t.split('\n');
      var openIdx = lines.findIndex(function(l) { return l.includes('package "X"'); });
      var closeIdx = lines.findIndex(function(l, i) { return i > openIdx && l.trim() === '}'; });
      expect(closeIdx).toBeGreaterThan(openIdx);
    });
  });
});
