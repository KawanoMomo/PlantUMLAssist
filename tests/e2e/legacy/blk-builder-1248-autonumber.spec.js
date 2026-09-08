// @ts-check
// BLK-builder-20260907-1248-2 / design 5b の網羅表「Sequence のその他パレット: autonumber」。
// 右パネル「図の設定」タブで、シーケンス図のメッセージに通し番号を振る。
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText } = require('../helpers');

async function openSettings(page) {
  await page.locator('#props-tab-settings').click();
  await page.waitForTimeout(400);
}

test.describe('BLK-builder-1248 メッセージの通し番号 (design 5b)', () => {
  test('シーケンス図では「図の設定」に通し番号の欄が出る', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1200);
    await openSettings(page);
    await expect(page.locator('#ds-autonumber-group')).toBeVisible();
    await expect(page.locator('#ds-autonumber-on')).not.toBeChecked();
    await expect(page.locator('#ds-autonumber-line')).toContainText('番号なし');
  });

  test('チェックすると `autonumber` が @startuml の直後に入る', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1200);
    await openSettings(page);
    await page.locator('#ds-autonumber-on').check();
    await page.waitForTimeout(700);
    const lines = (await getEditorText(page)).split('\n');
    expect(lines[0]).toBe('@startuml');
    expect(lines[1]).toBe('autonumber');
  });

  test('開始番号と増分を変えると行が書き換わる (行は増えない)', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1200);
    await openSettings(page);
    await page.locator('#ds-autonumber-on').check();
    await page.waitForTimeout(700);
    const before = (await getEditorText(page)).split('\n').length;
    await page.locator('#ds-autonumber-start').fill('10');
    await page.locator('#ds-autonumber-start').press('Tab');
    await page.waitForTimeout(700);
    await page.locator('#ds-autonumber-step').fill('5');
    await page.locator('#ds-autonumber-step').press('Tab');
    await page.waitForTimeout(700);
    const text = await getEditorText(page);
    expect(text.split('\n')[1]).toBe('autonumber 10 5');
    expect(text.split('\n').length).toBe(before);
  });

  test('外すと行が消える', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1200);
    await openSettings(page);
    await page.locator('#ds-autonumber-on').check();
    await page.waitForTimeout(700);
    await page.locator('#ds-autonumber-on').uncheck();
    await page.waitForTimeout(700);
    expect(await getEditorText(page)).not.toContain('autonumber');
  });

  test('シーケンス図でなければ通し番号の欄は出ない', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-class');
    await page.waitForTimeout(1200);
    await openSettings(page);
    await expect(page.locator('#ds-autonumber-group')).toHaveCount(0);
  });

  test('通し番号の付け外しは Ctrl+Z 1 回で戻る', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1200);
    const before = await getEditorText(page);
    await openSettings(page);
    await page.locator('#ds-autonumber-on').check();
    await page.waitForTimeout(700);
    await page.locator('#editor').press('Control+z');
    await page.waitForTimeout(600);
    expect(await getEditorText(page)).toBe(before);
  });
});
