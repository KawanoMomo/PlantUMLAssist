// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText, clickOverlayByLine } = require('./helpers');

// sequence-basic.puml:
//   L1: @startuml
//   L2: actor User
//   L3: participant System
//   L4: database DB
//   L5: (blank)
//   L6: User -> System : Login
//   L7: System -> DB : Query
//   ...
test.describe('UC-16: Undo coverage', () => {
  test('participant alias edit can be undone', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);

    // parser line 2 = actor User
    await clickOverlayByLine(page, 2);
    await page.waitForTimeout(400);
    const originalText = await getEditorText(page);

    await page.locator('#seq-edit-alias').fill('Customer');
    await page.locator('#seq-edit-alias').blur();
    await page.waitForTimeout(500);
    const changedText = await getEditorText(page);
    expect(changedText).toContain('Customer');
    expect(changedText).not.toBe(originalText);

    await page.locator('#btn-undo').click();
    await page.waitForTimeout(500);
    expect(await getEditorText(page)).toBe(originalText);
  });

  test('message label edit can be undone', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);

    // parser line 6 = first message (User -> System : Login)
    await clickOverlayByLine(page, 6);
    await page.waitForTimeout(400);
    const originalText = await getEditorText(page);

    const ta = page.locator('#seq-edit-msg-label-rle .rle-textarea');
    await ta.fill('AuthRequest');
    await ta.blur();
    await page.waitForTimeout(500);
    expect(await getEditorText(page)).toContain('AuthRequest');

    await page.locator('#btn-undo').click();
    await page.waitForTimeout(500);
    expect(await getEditorText(page)).toBe(originalText);
  });
});
