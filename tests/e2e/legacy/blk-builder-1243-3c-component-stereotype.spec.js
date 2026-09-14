// @ts-check
// BLK-builder-20260907-1243-3c: design 5d の Component ステレオタイプ。
// <<service>> の付いた行が要素として選べ、右ペインから足す・変える・外せる。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

async function openComponent(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-component');
  await page.waitForTimeout(500);
}

async function setDsl(page, dsl) {
  await page.evaluate((text) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = text;
    ed.dispatchEvent(new Event('input'));
  }, dsl);
  await page.waitForTimeout(900);
}

test.describe('BLK-builder-1243-3c Component のステレオタイプ (design 5d)', () => {
  test('ステレオタイプ付きで足せる', async ({ page }) => {
    await openComponent(page);
    await page.locator('#co-tail-kind').selectOption('component');
    await page.locator('#co-tail-alias').fill('AuthSvc');
    await page.locator('#co-tail-stereo').fill('service');
    await page.locator('#co-tail-add').click();
    await expect.poll(async () => await getEditorText(page)).toContain('component AuthSvc <<service>>');
  });

  test('ステレオタイプ付きの行も要素として選べ、右ペインに出る', async ({ page }) => {
    await openComponent(page);
    await setDsl(page, ['@startuml', 'title T', 'component WebApp <<service>>', '@enduml'].join('\n'));
    await page.evaluate(() => {
      window.MA.selection.setSelected([{ type: 'component', id: 'WebApp' }]);
    });
    await expect(page.locator('#co-edit-id')).toHaveValue('WebApp');
    await expect(page.locator('#co-edit-stereo')).toHaveValue('service');
  });

  test('付け替えと取り外しが右ペインからできる', async ({ page }) => {
    await openComponent(page);
    await setDsl(page, ['@startuml', 'title T', 'component WebApp <<service>>', '@enduml'].join('\n'));
    await page.evaluate(() => {
      window.MA.selection.setSelected([{ type: 'component', id: 'WebApp' }]);
    });
    await page.locator('#co-edit-stereo').fill('device');
    await page.locator('#co-edit-apply').click();
    await expect.poll(async () => await getEditorText(page)).toContain('component WebApp <<device>>');

    await page.evaluate(() => {
      window.MA.selection.setSelected([{ type: 'component', id: 'WebApp' }]);
    });
    await page.locator('#co-edit-stereo').fill('');
    await page.locator('#co-edit-apply').click();
    await expect.poll(async () => await getEditorText(page)).not.toContain('<<');
  });
});
