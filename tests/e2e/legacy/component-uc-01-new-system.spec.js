// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText, switchTypeWithSample } = require('../helpers');

test.describe('UC-1: 新規 (システムブロック構成の初期描画)', () => {
  test.describe('α: DSL technical', () => {
    // BLK-junior-20260909-0703 / BLK-owner-20260925-0312-2: 白紙のタブで図種を選ぶと見本は入れず白紙になり、
    // コンポーネント図の追加フォーム(種別チップ)から 1 件目を足せる。
    test('switching a blank tab to Component gives a blank diagram and the add chips', async ({ page }) => {
      await gotoApp(page);
      // BLK-releaser-20260930-0417-1: 起動時のタブは前の spec が保存先に残した図を開き直していることがある
      // (白紙でない)。＋ で白紙のタブを作ってから図種を選ぶ。
      await page.locator('#btn-tab-new').click();
      await page.waitForTimeout(300);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toMatch(/^@startuml/);
      expect(t.trim()).toMatch(/@enduml$/);
      expect(t).not.toContain('component WebApp');
      await expect(page.locator('#co-tail-kind-chip-component')).toBeVisible();
    });
    test('add component emits canonical', async ({ page }) => {
      await gotoApp(page);
      await switchTypeWithSample(page, 'plantuml-component');
      await page.locator('#co-tail-kind-chip-component').click();
      await page.locator('#co-tail-alias').fill('DB');
      await page.locator('#co-tail-label').fill('Database');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('component "Database" as DB');
    });
    test('add interface and association', async ({ page }) => {
      await gotoApp(page);
      await switchTypeWithSample(page, 'plantuml-component');
      await page.locator('#co-tail-kind-chip-interface').click();
      await page.locator('#co-tail-alias').fill('ILog');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(200);
      await page.locator('#co-tail-kind-chip-relation').click();
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
      await switchTypeWithSample(page, 'plantuml-component');
      await page.locator('#co-tail-kind-chip-component').click();
      await page.locator('#co-tail-alias').fill('Cache');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(200);
      await page.locator('#co-tail-kind-chip-relation').click();
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
      await switchTypeWithSample(page, 'plantuml-component');
      await page.locator('#co-tail-kind-chip-component').click();
      await page.locator('#co-tail-alias').fill('X');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var jsErrors = errors.filter(function(e) { return e.indexOf('favicon') < 0; });
      expect(jsErrors).toHaveLength(0);
    });
  });
});
