// @ts-check
// BLK-builder-20260907-1306-2 / design 5d「UML 要素の網羅一覧」の State 行。
// State の「その他パレット」に畳まれる 色 を、状態と遷移の両方で選べる。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const SAMPLE = [
  '@startuml',
  'title Sample State',
  'state Idle',
  'state Running',
  '[*] --> Idle',
  'Idle --> Running : start',
  'Running --> Idle : stop',
  '@enduml',
].join('\n');

async function openState(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(600);
  await page.evaluate((text) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = text;
    ed.dispatchEvent(new Event('input'));
  }, SAMPLE);
  await page.waitForTimeout(900);
}

test.describe('BLK-builder-1306-2 State の色', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('状態を選ぶと「その他（色）」が畳まれた形で出る', async ({ page }) => {
    await openState(page);
    await page.locator('#overlay-layer rect[data-type="state"]').first().click();
    await expect(page.locator('#st-more-btn')).toBeVisible();
    await expect(page.locator('#st-more-btn')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#st-more')).toBeHidden();
  });

  test('その他を開いて色を押すと、状態行に色が入る', async ({ page }) => {
    await openState(page);
    await page.locator('#overlay-layer rect[data-type="state"]').first().click();
    await page.locator('#st-more-btn').click();
    await expect(page.locator('#st-more')).toBeVisible();
    await page.locator('#st-more-colors .prop-color-swatch[data-value="red"]').click();
    await page.waitForTimeout(700);
    const text = await getEditorText(page);
    expect(text).toContain('state Idle #red');
  });

  test('もう一度「既定」を押すと色が消える', async ({ page }) => {
    await openState(page);
    await page.locator('#overlay-layer rect[data-type="state"]').first().click();
    await page.locator('#st-more-btn').click();
    await page.locator('#st-more-colors .prop-color-swatch[data-value="green"]').click();
    await page.waitForTimeout(700);
    expect(await getEditorText(page)).toContain('state Idle #green');
    // 色が付いたので、描き直したパレットは開いた状態で出る。
    await expect(page.locator('#st-more-btn')).toHaveAttribute('aria-expanded', 'true');
    await page.locator('#st-more-colors .prop-color-swatch[data-value=""]').click();
    await page.waitForTimeout(700);
    const text = await getEditorText(page);
    expect(text).toContain('state Idle');
    expect(text).not.toContain('#green');
  });

  test('遷移を選ぶと「その他（線の色）」が出て、線の色を変えられる', async ({ page }) => {
    await openState(page);
    await page.locator('#overlay-layer rect[data-type="transition"]').first().click();
    await expect(page.locator('#st-tr-more-btn')).toBeVisible();
    await page.locator('#st-tr-more-btn').click();
    await page.locator('#st-tr-more-colors .prop-color-swatch[data-value="blue"]').click();
    await page.waitForTimeout(700);
    expect(await getEditorText(page)).toMatch(/-\[#blue\]->/);
  });

  test('色を付けた状態のラベルを更新しても色が残る', async ({ page }) => {
    await openState(page);
    await page.locator('#overlay-layer rect[data-type="state"]').first().click();
    await page.locator('#st-more-btn').click();
    await page.locator('#st-more-colors .prop-color-swatch[data-value="orange"]').click();
    await page.waitForTimeout(700);
    await page.locator('#st-label').fill('待機中');
    await page.locator('#st-update').click();
    await page.waitForTimeout(700);
    const text = await getEditorText(page);
    expect(text).toContain('#orange');
    expect(text).toContain('待機中');
  });
});
