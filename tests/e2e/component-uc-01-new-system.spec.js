// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('UC-1: 新規 (システムブロック構成の初期描画)', () => {
  test.describe('α: DSL technical', () => {
    test('switching to Component loads template', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('component WebApp');
      expect(t).toContain('interface IAuth');
    });
    test('add component emits canonical', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('component');
      await page.locator('#co-tail-alias').fill('DB');
      await page.locator('#co-tail-label').fill('Database');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('component "Database" as DB');
    });
    test('add interface and association', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('interface');
      await page.locator('#co-tail-alias').fill('ILog');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(200);
      await page.locator('#co-tail-kind').selectOption('relation');
      await page.locator('#co-tail-rkind').selectOption('association');
      await page.locator('#co-tail-from').selectOption('WebApp');
      await page.locator('#co-tail-to').selectOption('ILog');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('interface ILog');
      expect(t).toContain('WebApp -- ILog');
    });
  });

  test.describe('γ: workflow completion', () => {
    test('user can complete new-system flow in <5 ops', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('component');
      await page.locator('#co-tail-alias').fill('Cache');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(200);
      await page.locator('#co-tail-kind').selectOption('relation');
      await page.locator('#co-tail-from').selectOption('WebApp');
      await page.locator('#co-tail-to').selectOption('Cache');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('component Cache');
      expect(t).toContain('WebApp -- Cache');
    });
    test('console error count is 0', async ({ page }) => {
      var errors = [];
      page.on('console', function(msg) { if (msg.type() === 'error') errors.push(msg.text()); });
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('component');
      await page.locator('#co-tail-alias').fill('X');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var jsErrors = errors.filter(function(e) { return e.indexOf('favicon') < 0; });
      expect(jsErrors).toHaveLength(0);
    });
  });
});
