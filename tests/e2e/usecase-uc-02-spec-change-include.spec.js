// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('UC-2: 仕様変更 (共通機能を抜き出して include で再利用)', () => {

  async function setupTwoUsecases(page) {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-usecase');
    await page.waitForTimeout(300);
    await page.locator('#uc-tail-kind').selectOption('usecase');
    await page.locator('#uc-tail-alias').fill('Validate');
    await page.locator('#uc-tail-add').click();
    await page.waitForTimeout(200);
  }

  test.describe('α: DSL technical', () => {
    test('add include relation emits canonical ..> with stereotype', async ({ page }) => {
      await setupTwoUsecases(page);
      await page.locator('#uc-tail-kind').selectOption('relation');
      await page.locator('#uc-tail-rkind').selectOption('include');
      await page.locator('#uc-tail-from').selectOption('Login');
      await page.locator('#uc-tail-to').selectOption('Validate');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('Login ..> Validate : <<include>>');
    });

    test('parser round-trip preserves include kind', async ({ page }) => {
      await setupTwoUsecases(page);
      await page.locator('#uc-tail-kind').selectOption('relation');
      await page.locator('#uc-tail-rkind').selectOption('include');
      await page.locator('#uc-tail-from').selectOption('Login');
      await page.locator('#uc-tail-to').selectOption('Validate');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(300);
      var kind = await page.evaluate(() => {
        var t = document.getElementById('editor').value;
        var parsed = window.MA.modules.plantumlUsecase.parse(t);
        return parsed.relations[parsed.relations.length - 1].kind;
      });
      expect(kind).toBe('include');
    });
  });

  test.describe('γ: workflow completion', () => {
    test('user can extract common UC and add include in <4 ops', async ({ page }) => {
      await setupTwoUsecases(page);
      await page.locator('#uc-tail-kind').selectOption('relation');
      await page.locator('#uc-tail-rkind').selectOption('include');
      await page.locator('#uc-tail-from').selectOption('Login');
      await page.locator('#uc-tail-to').selectOption('Validate');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toMatch(/Login\s+\.\.>\s+Validate\s+:\s+<<include>>/);
    });

    test('include / extend / association options visible in relation kind selector', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-usecase');
      await page.waitForTimeout(300);
      await page.locator('#uc-tail-kind').selectOption('relation');
      var options = await page.locator('#uc-tail-rkind option').allTextContents();
      expect(options.some(function(o) { return o.includes('include'); })).toBe(true);
      expect(options.some(function(o) { return o.includes('extend'); })).toBe(true);
      expect(options.some(function(o) { return o.includes('Association'); })).toBe(true);
    });
  });
});
