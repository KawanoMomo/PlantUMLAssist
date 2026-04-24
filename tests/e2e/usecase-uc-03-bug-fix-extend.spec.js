// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('UC-3: 不具合対応 (extend で例外フロー追加)', () => {

  async function setup(page) {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-usecase');
    await page.waitForTimeout(300);
    // template = User --> Login. 例外 UC: CancelLogin
    await page.locator('#uc-tail-kind').selectOption('usecase');
    await page.locator('#uc-tail-alias').fill('CancelLogin');
    await page.locator('#uc-tail-add').click();
    await page.waitForTimeout(200);
  }

  test.describe('α: DSL technical', () => {
    test('extend relation emits canonical ..> with <<extend>>', async ({ page }) => {
      await setup(page);
      await page.locator('#uc-tail-kind').selectOption('relation');
      await page.locator('#uc-tail-rkind').selectOption('extend');
      await page.locator('#uc-tail-from').selectOption('Login');
      await page.locator('#uc-tail-to').selectOption('CancelLogin');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('Login ..> CancelLogin : <<extend>>');
    });

    test('extend distinguished from include in re-parse', async ({ page }) => {
      await setup(page);
      await page.locator('#uc-tail-kind').selectOption('relation');
      await page.locator('#uc-tail-rkind').selectOption('extend');
      await page.locator('#uc-tail-from').selectOption('Login');
      await page.locator('#uc-tail-to').selectOption('CancelLogin');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(300);
      var kind = await page.evaluate(() => {
        var t = document.getElementById('editor').value;
        var parsed = window.MA.modules.plantumlUsecase.parse(t);
        return parsed.relations[parsed.relations.length - 1].kind;
      });
      expect(kind).toBe('extend');
    });
  });

  test.describe('γ: workflow completion', () => {
    test('add extend without overlay, form-based MVP only', async ({ page }) => {
      await setup(page);
      await page.locator('#uc-tail-kind').selectOption('relation');
      await page.locator('#uc-tail-rkind').selectOption('extend');
      await page.locator('#uc-tail-from').selectOption('Login');
      await page.locator('#uc-tail-to').selectOption('CancelLogin');
      await page.locator('#uc-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('<<extend>>');
    });

    test('include vs extend は selector で明示区別できる', async ({ page }) => {
      await setup(page);
      await page.locator('#uc-tail-kind').selectOption('relation');
      var includeOpt = await page.locator('#uc-tail-rkind option[value="include"]').textContent();
      var extendOpt = await page.locator('#uc-tail-rkind option[value="extend"]').textContent();
      expect(includeOpt).toContain('<<include>>');
      expect(extendOpt).toContain('<<extend>>');
    });
  });
});
