// @ts-check
// BLK-primary-20260907-0803-wish: テンプレート複製のあと、元の系統の部品名
// (Spi_Driver 等) が残ったままの図を作らせない。今までは複製した図に元の名前が
// 残って提出され、同じレビュー指摘を 3 系統・3 回続けて受けていた。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const SPI = [
  '@startuml',
  'title SPI 転送',
  'participant Spi_Driver',
  'participant "共通ログ" as CommonLog',
  'database Spi_Buffer',
  'Spi_Driver -> Spi_Buffer : write',
  'Spi_Driver -> CommonLog : trace',
  '@enduml',
].join('\n');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(350);
}

async function openTemplate(page) {
  await page.locator('#btn-tab-template').click();
  await expect(page.locator('#tpl-source')).toBeVisible();
}

function editorText(page) {
  return page.evaluate(() =>
    /** @type {HTMLTextAreaElement} */ (document.getElementById('editor')).value);
}

test.describe('BLK-primary-0803-wish 複製後の必須リネーム', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('1 語替えただけでは残る部品名が挙がり、作れない', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SPI);
    await openTemplate(page);
    await page.locator('#tpl-from').fill('Spi');
    await page.locator('#tpl-to').fill('Adc');
    await expect(page.locator('#tpl-remaining-head')).toHaveAttribute('data-remaining', '1');
    await expect(page.locator('.tpl-remaining-row')).toHaveCount(1);
    await expect(page.locator('.tpl-remaining-row').first()).toContainText('CommonLog');
    await expect(page.locator('#btn-tpl-create')).toBeDisabled();
    await expect(page.locator('#tpl-blocked')).toContainText('CommonLog');
  });

  test('残った名前に新しい名前を入れると作れるようになる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SPI);
    await openTemplate(page);
    await page.locator('#tpl-from').fill('Spi');
    await page.locator('#tpl-to').fill('Adc');
    await page.locator('[data-remaining-input="CommonLog"]').fill('AdcLog');
    await expect(page.locator('#tpl-blocked')).toHaveAttribute('data-unresolved', '0');
    await expect(page.locator('#btn-tpl-create')).toBeEnabled();
    await page.locator('#btn-tpl-create').click();
    const dsl = await editorText(page);
    expect(dsl).toContain('participant Adc_Driver');
    expect(dsl).toContain('as AdcLog');
    expect(dsl).toContain('title ADC 転送');
    expect(dsl).not.toContain('Spi');
    expect(dsl).not.toContain('CommonLog');
  });

  test('「このままで良い」を選べば残してよいが、選ぶまでは作れない', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SPI);
    await openTemplate(page);
    await page.locator('#tpl-from').fill('Spi');
    await page.locator('#tpl-to').fill('Adc');
    await expect(page.locator('#btn-tpl-create')).toBeDisabled();
    await page.locator('[data-remaining-keep="CommonLog"]').check();
    await expect(page.locator('#btn-tpl-create')).toBeEnabled();
    await page.locator('#btn-tpl-create').click();
    const dsl = await editorText(page);
    expect(dsl).toContain('as CommonLog');
    expect(dsl).toContain('participant Adc_Driver');
  });

  test('残りが 0 件ならその旨が出て、そのまま作れる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, '@startuml\nparticipant Spi_Driver\nparticipant Spi_Buffer\n@enduml');
    await openTemplate(page);
    await page.locator('#tpl-from').fill('Spi');
    await page.locator('#tpl-to').fill('Adc');
    await expect(page.locator('#tpl-remaining-head')).toHaveAttribute('data-remaining', '0');
    await expect(page.locator('#tpl-remaining-head')).toContainText('残っていません');
    await expect(page.locator('#btn-tpl-create')).toBeEnabled();
  });

  test('追加のリネームも確定前のプレビューに反映される', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SPI);
    await openTemplate(page);
    await page.locator('#tpl-from').fill('Spi');
    await page.locator('#tpl-to').fill('Adc');
    const before = await page.locator('#tpl-summary').getAttribute('data-changed');
    await page.locator('[data-remaining-input="CommonLog"]').fill('AdcLog');
    const after = await page.locator('#tpl-summary').getAttribute('data-changed');
    expect(Number(after)).toBeGreaterThan(Number(before));
    await expect(page.locator('#tpl-preview')).toContainText('AdcLog');
  });

  test('置換元を打ち直すと残り名の一覧も付いてくる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SPI);
    await openTemplate(page);
    await page.locator('#tpl-from').fill('CommonLog');
    await page.locator('#tpl-to').fill('AdcLog');
    await expect(page.locator('#tpl-remaining-head')).toHaveAttribute('data-remaining', '2');
    await page.locator('#tpl-from').fill('Spi');
    await expect(page.locator('#tpl-remaining-head')).toHaveAttribute('data-remaining', '1');
  });
});
