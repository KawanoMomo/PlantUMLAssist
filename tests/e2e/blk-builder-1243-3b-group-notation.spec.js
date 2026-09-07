// @ts-check
// BLK-builder-20260907-1243-3b: design 5d の「その他パレット」—
// Component の folder / frame / node 表記と UseCase の rectangle 表記を
// GUI から選んで境界を足せること、既にある境界の表記を差し替えられること。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

async function openDiagram(page, type) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption(type);
  await page.waitForTimeout(500);
}

async function setDsl(page, dsl) {
  await page.evaluate((text) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = text;
    ed.dispatchEvent(new Event('input'));
  }, dsl);
  await page.waitForTimeout(800);
}

test.describe('BLK-builder-1243-3b 境界の表記 (design 5d)', () => {
  test('Component: 表記の 5 択が出て、選んだ表記で境界が入る', async ({ page }) => {
    await openDiagram(page, 'plantuml-component');
    await page.locator('#co-tail-kind').selectOption('package');
    const sel = page.locator('#co-tail-notation');
    await expect(sel).toBeVisible();
    await expect(sel.locator('option')).toHaveCount(5);
    await page.locator('#co-tail-label').fill('Backend');
    await sel.selectOption('node');
    await page.locator('#co-tail-add').click();
    await expect.poll(async () => await getEditorText(page)).toContain('node "Backend" {');
  });

  test('Component: 既定は package のまま', async ({ page }) => {
    await openDiagram(page, 'plantuml-component');
    await page.locator('#co-tail-kind').selectOption('package');
    await page.locator('#co-tail-label').fill('Front');
    await page.locator('#co-tail-add').click();
    await expect.poll(async () => await getEditorText(page)).toContain('package "Front" {');
  });

  test('Component: 既にある境界の表記を差し替えても中身は残る', async ({ page }) => {
    await openDiagram(page, 'plantuml-component');
    await setDsl(page, ['@startuml', 'title T', 'folder "Backend" {', 'component WebApp', '}', '@enduml'].join('\n'));
    // 境界を選ぶと編集パネルが開く
    await page.evaluate(() => {
      window.MA.selection.setSelected([{ type: 'package', id: '__pkg_0' }]);
    });
    const sel = page.locator('#co-grp-notation');
    await expect(sel).toBeVisible();
    await expect(sel).toHaveValue('folder');
    await sel.selectOption('frame');
    await page.locator('#co-grp-notation-apply').click();
    await expect.poll(async () => await getEditorText(page)).toContain('frame "Backend" {');
    expect(await getEditorText(page)).toContain('component WebApp');
  });

  test('UseCase: 表記は package / rectangle の 2 択で、rectangle で足せる', async ({ page }) => {
    await openDiagram(page, 'plantuml-usecase');
    await page.locator('#uc-tail-kind').selectOption('package');
    const sel = page.locator('#uc-tail-notation');
    await expect(sel).toBeVisible();
    await expect(sel.locator('option')).toHaveCount(2);
    await page.locator('#uc-tail-label').fill('受付');
    await sel.selectOption('rectangle');
    await page.locator('#uc-tail-add').click();
    await expect.poll(async () => await getEditorText(page)).toContain('rectangle "受付" {');
  });
});
