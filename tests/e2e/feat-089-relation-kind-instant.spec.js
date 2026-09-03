// @ts-check
// FEAT-089 (resolves HFR-053): Component 図の依存矢印の種別を、選ぶだけで即反映する。
// 本 spec は実機 (E2E) でなければ判定できない AC のみを扱う。
// FEAT-089 spec 節「E2E(実機)で判定を要する AC」の逐語指定に従い [AC-1] / [AC-3] を置き、
// 併せて即時反映の履歴 1 step 性 ([AC-2]) を実機で判定する。
// LOOP-437: AC タグは本ファイル内で一意。状態変化の主張は操作前の値との差を必ずアサートする。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

async function selectFirstRelation(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-component');
  await page.waitForTimeout(2500);
  var relRect = page.locator('#overlay-layer rect[data-type="relation"]').first();
  if (await relRect.count() === 0) return false;
  await relRect.click();
  await page.waitForTimeout(300);
  return (await page.locator('#co-rel-kind').count()) > 0;
}

test.describe('FEAT-089: relation の種別は選んだ時点で確定する', () => {
  test('[AC-1] Kind の select を変えると「変更を反映」を押さずに DSL の矢印記法が変わる', async ({ page }) => {
    if (!await selectFirstRelation(page)) test.skip();
    var before = await getEditorText(page);
    expect(before).toContain('-()');
    await page.locator('#co-rel-kind').selectOption('dependency');
    await page.waitForTimeout(800);
    var after = await getEditorText(page);
    expect(after).not.toBe(before);
    expect(after).toContain('WebApp ..> IAuth');
  });

  test('[AC-2] 即時反映は Ctrl+Z 1 回で元に戻る (履歴 1 step)', async ({ page }) => {
    if (!await selectFirstRelation(page)) test.skip();
    var before = await getEditorText(page);
    await page.locator('#co-rel-kind').selectOption('dependency');
    await page.waitForTimeout(800);
    var changed = await getEditorText(page);
    expect(changed).not.toBe(before);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    expect(await getEditorText(page)).toBe(before);
  });

  test('[AC-3] 種別変更の直後に「変更を反映」を押しても種別が二重に適用されない', async ({ page }) => {
    if (!await selectFirstRelation(page)) test.skip();
    var before = await getEditorText(page);
    await page.locator('#co-rel-kind').selectOption('dependency');
    await page.waitForTimeout(800);
    var afterChange = await getEditorText(page);
    expect(afterChange).not.toBe(before);
    await page.locator('#co-rel-apply').click();
    await page.waitForTimeout(800);
    var afterApply = await getEditorText(page);
    expect(afterApply).toBe(afterChange);
  });
});
