// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText, switchTypeWithSample } = require('../helpers');

test.describe('UC-1: 新規 (新規システムの要求洗い出し)', () => {

  test.describe('α: DSL technical', () => {
    // BLK-junior-20260909-0703 / BLK-owner-20260925-0312-2: 白紙のタブで図種を選ぶと見本は入れず白紙になり、
    // ユースケース図の追加フォーム(種別チップ)から 1 件目を足せる。
    test('switching a blank tab to UseCase gives a blank diagram and the add chips', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-usecase');
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toMatch(/^@startuml/);
      expect(t.trim()).toMatch(/@enduml$/);
      expect(t).not.toContain('actor User');
      await expect(page.locator('#uc-tail-kind-chip-actor')).toBeVisible();
    });

    test('add actor via tail-add form emits canonical actor line', async ({ page }) => {
      await gotoApp(page);
      await switchTypeWithSample(page, 'plantuml-usecase');
      await page.locator('#uc-tail-kind-chip-actor').click();
      await page.locator('#uc-tail-alias').fill('Admin');
      await page.locator('#uc-tail-label').fill('Administrator');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('actor "Administrator" as Admin');
    });

    test('add usecase + association produces canonical DSL', async ({ page }) => {
      await gotoApp(page);
      await switchTypeWithSample(page, 'plantuml-usecase');
      await page.locator('#uc-tail-kind-chip-usecase').click();
      await page.locator('#uc-tail-alias').fill('Logout');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(200);
      await page.locator('#uc-tail-kind-chip-relation').click();
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
      await switchTypeWithSample(page, 'plantuml-usecase');
      // 1. add actor
      await page.locator('#uc-tail-kind-chip-actor').click();
      await page.locator('#uc-tail-alias').fill('Operator');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(200);
      // 2. add usecase
      await page.locator('#uc-tail-kind-chip-usecase').click();
      await page.locator('#uc-tail-alias').fill('Monitor');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(200);
      // 3. add association
      await page.locator('#uc-tail-kind-chip-relation').click();
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
      await switchTypeWithSample(page, 'plantuml-usecase');
      await page.locator('#uc-tail-kind-chip-actor').click();
      await page.locator('#uc-tail-alias').fill('U2');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(300);
      // ignore favicon 404 (pre-existing cosmetic issue)
      var jsErrors = errors.filter(function(e) { return e.indexOf('favicon') < 0; });
      expect(jsErrors).toHaveLength(0);
    });
  });
});
