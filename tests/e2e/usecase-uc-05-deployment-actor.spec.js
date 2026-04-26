// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('UC-5: 横展開 (二次 actor + association/generalization 追加)', () => {

  test.describe('α: DSL technical', () => {
    test('add secondary actor + association', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-usecase');
      await page.waitForTimeout(300);
      await page.locator('#uc-tail-kind').selectOption('actor');
      await page.locator('#uc-tail-alias').fill('AuthServer');
      await page.locator('#uc-tail-label').fill('External Auth Server');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(200);
      await page.locator('#uc-tail-kind').selectOption('relation');
      await page.locator('#uc-tail-rkind').selectOption('association');
      await page.locator('#uc-tail-from').selectOption('AuthServer');
      await page.locator('#uc-tail-to').selectOption('Login');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('actor "External Auth Server" as AuthServer');
      expect(t).toContain('AuthServer --> Login');
    });

    test('generalization with parent <|-- child direction canonical', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-usecase');
      await page.waitForTimeout(300);
      await page.locator('#uc-tail-kind').selectOption('actor');
      await page.locator('#uc-tail-alias').fill('Admin');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(200);
      await page.locator('#uc-tail-kind').selectOption('relation');
      await page.locator('#uc-tail-rkind').selectOption('generalization');
      await page.locator('#uc-tail-from').selectOption('User');
      await page.locator('#uc-tail-to').selectOption('Admin');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('User <|-- Admin');
    });
  });

  test.describe('γ: workflow completion', () => {
    test('add secondary actor flow does not block on overlay (form-based works)', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-usecase');
      await page.waitForTimeout(300);
      await page.locator('#uc-tail-kind').selectOption('actor');
      await page.locator('#uc-tail-alias').fill('Watchdog');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('actor Watchdog');
    });

    test('relation kind 変更で association → generalization に切替可能', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-usecase');
      await page.waitForTimeout(300);
      await page.locator('#uc-tail-kind').selectOption('actor');
      await page.locator('#uc-tail-alias').fill('Sub');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(200);
      await page.locator('#uc-tail-kind').selectOption('relation');
      await page.locator('#uc-tail-rkind').selectOption('association');
      await page.locator('#uc-tail-from').selectOption('User');
      await page.locator('#uc-tail-to').selectOption('Sub');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('User --> Sub');
      var newT = await page.evaluate(() => {
        var t = document.getElementById('editor').value;
        var lines = t.split('\n');
        var idx = lines.findIndex(function(l) { return /^User\s+-->\s+Sub/.test(l); });
        if (idx < 0) return t;
        var lineNum = idx + 1;
        return window.MA.modules.plantumlUsecase.updateRelation(t, lineNum, 'kind', 'generalization');
      });
      expect(newT).toContain('User <|-- Sub');
    });
  });
});
