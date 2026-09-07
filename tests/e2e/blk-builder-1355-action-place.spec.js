// @ts-check
// BLK-builder-20260907-1355-3 (design 4b の右ペイン):
// アクションを選ぶと「位置」が構造で出て、「↑ 前に」「↓ 後に」からその位置に挿入できる。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const SAMPLE = [
  '@startuml',
  'title Sample Activity',
  'start',
  ':入力を受け取る;',
  'if (有効?) then (yes)',
  ':保存する;',
  'else (no)',
  ':エラーを返す;',
  'endif',
  'stop',
  '@enduml',
].join('\n');

async function openActivity(page, dsl) {
  await gotoApp(page);
  await page.evaluate(() => {
    const sel = /** @type {HTMLSelectElement} */ (document.getElementById('diagram-type'));
    sel.value = 'plantuml-activity';
    sel.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(500);
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, dsl);
  await page.waitForTimeout(1200);
}

async function selectAction(page, line) {
  await page.locator('#overlay-layer rect[data-line="' + line + '"]').first().click();
  await page.waitForTimeout(400);
}

test.describe('BLK-builder-1355 選択中アクションの位置と挿入', () => {
  test.beforeEach(async ({ page }) => {
    await openActivity(page, SAMPLE);
  });

  test('then 側のアクションを選ぶと、位置が条件分岐の枝で示される', async ({ page }) => {
    await selectAction(page, 6);
    await expect(page.locator('#ac-action-place')).toContainText('条件分岐「有効?」の yes 側');
    await expect(page.locator('#ac-action-place')).toContainText('1 番目');
  });

  test('フローの直下のアクションは「フローの N 番目」', async ({ page }) => {
    await selectAction(page, 4);
    await expect(page.locator('#ac-action-place')).toContainText('フローの 1 番目');
  });

  test('「↓ 後に」で挿入メニューがその位置で開き、選んだものが後ろに入る', async ({ page }) => {
    const before = await getEditorText(page);
    await selectAction(page, 6);
    await page.locator('#ac-insert-after').click();
    await expect(page.locator('#act-modal')).toBeVisible();
    await expect(page.locator('#act-pick-target')).toContainText('の後');
    await page.locator('#act-pick-action').click();
    await page.locator('#act-mod-text').fill('通知する');
    await page.locator('#act-mod-confirm').click();
    await page.waitForTimeout(800);
    const after = (await getEditorText(page)).split('\n');
    expect(after.length).toBe(before.split('\n').length + 1);
    expect(after[6].trim()).toBe(':通知する;');
  });

  test('「↑ 前に」は同じ位置の前に入る', async ({ page }) => {
    await selectAction(page, 6);
    await page.locator('#ac-insert-before').click();
    await expect(page.locator('#act-pick-target')).toContainText('の前');
    await page.locator('#act-pick-action').click();
    await page.locator('#act-mod-text').fill('前処理する');
    await page.locator('#act-mod-confirm').click();
    await page.waitForTimeout(800);
    const after = (await getEditorText(page)).split('\n');
    expect(after[5].trim()).toBe(':前処理する;');
    expect(after[6].trim()).toBe(':保存する;');
  });
});
