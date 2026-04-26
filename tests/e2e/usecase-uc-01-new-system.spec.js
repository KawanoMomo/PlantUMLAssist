// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('UC-1: 新規 (新規システムの要求洗い出し)', () => {

  test.describe('α: DSL technical', () => {
    test('switching diagram-type to UseCase loads template DSL', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-usecase');
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('@startuml');
      expect(t).toContain('actor User');
      expect(t).toContain('usecase Login');
    });

    test('add actor via tail-add form emits canonical actor line', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-usecase');
      await page.waitForTimeout(300);
      await page.locator('#uc-tail-kind').selectOption('actor');
      await page.locator('#uc-tail-alias').fill('Admin');
      await page.locator('#uc-tail-label').fill('Administrator');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('actor "Administrator" as Admin');
    });

    test('add usecase + association produces canonical DSL', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-usecase');
      await page.waitForTimeout(300);
      await page.locator('#uc-tail-kind').selectOption('usecase');
      await page.locator('#uc-tail-alias').fill('Logout');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(200);
      await page.locator('#uc-tail-kind').selectOption('relation');
      await page.locator('#uc-tail-from').selectOption('User');
      await page.locator('#uc-tail-to').selectOption('Logout');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('usecase Logout');
      expect(t).toContain('User --> Logout');
    });
  });

  test.describe('γ: workflow completion', () => {
    test('user can complete new-system flow (3 actor + usecase + association in <5 ops)', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-usecase');
      await page.waitForTimeout(300);
      // 1. add actor
      await page.locator('#uc-tail-kind').selectOption('actor');
      await page.locator('#uc-tail-alias').fill('Operator');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(200);
      // 2. add usecase
      await page.locator('#uc-tail-kind').selectOption('usecase');
      await page.locator('#uc-tail-alias').fill('Monitor');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(200);
      // 3. add association
      await page.locator('#uc-tail-kind').selectOption('relation');
      await page.locator('#uc-tail-from').selectOption('Operator');
      await page.locator('#uc-tail-to').selectOption('Monitor');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('actor Operator');
      expect(t).toContain('usecase Monitor');
      expect(t).toContain('Operator --> Monitor');
    });

    test('console error count is 0 during new-system flow', async ({ page }) => {
      var errors = [];
      page.on('console', function(msg) { if (msg.type() === 'error') errors.push(msg.text()); });
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-usecase');
      await page.waitForTimeout(300);
      await page.locator('#uc-tail-kind').selectOption('actor');
      await page.locator('#uc-tail-alias').fill('U2');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(300);
      // ignore favicon 404 (pre-existing cosmetic issue)
      var jsErrors = errors.filter(function(e) { return e.indexOf('favicon') < 0; });
      expect(jsErrors).toHaveLength(0);
    });
  });
});
