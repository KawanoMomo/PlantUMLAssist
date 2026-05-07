// @ts-check
// userissue v1.2.4: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z で MA.history.undo/redo に
// ルーティング。 旧来は document-level keybinding が無く、 textarea のネイティブ
// undo は setMmdText の programmatic 上書きで壊れていたため Ctrl+Z が効かなかった。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

async function tailAddActor(page, alias) {
  await page.locator('#seq-tail-kind').selectOption('participant');
  await page.locator('#seq-tail-ptype').selectOption('actor');
  await page.locator('#seq-tail-alias').fill(alias);
  await page.locator('#seq-tail-add').click();
  await page.waitForTimeout(400);
}

test.describe('Ctrl+Z / Ctrl+Y keybindings (userissue v1.2.4)', () => {
  test('Ctrl+Z after tail-add restores prior DSL', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await gotoApp(page);
    const before = await getEditorText(page);
    await tailAddActor(page, 'Bob');
    const after = await getEditorText(page);
    expect(after).toContain('actor Bob');
    await page.locator('body').press('Control+z');
    await page.waitForTimeout(400);
    const undone = await getEditorText(page);
    expect(undone).toBe(before);
  });

  test('Ctrl+Y after Ctrl+Z restores tail-add result', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await gotoApp(page);
    await tailAddActor(page, 'Carol');
    const after = await getEditorText(page);
    await page.locator('body').press('Control+z');
    await page.waitForTimeout(400);
    await page.locator('body').press('Control+y');
    await page.waitForTimeout(400);
    const redone = await getEditorText(page);
    expect(redone).toBe(after);
  });

  test('Ctrl+Shift+Z works as redo', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await gotoApp(page);
    await tailAddActor(page, 'Dave');
    const after = await getEditorText(page);
    await page.locator('body').press('Control+z');
    await page.waitForTimeout(400);
    await page.locator('body').press('Control+Shift+z');
    await page.waitForTimeout(400);
    const redone = await getEditorText(page);
    expect(redone).toBe(after);
  });

  test('multiple Ctrl+Z undoes multiple operations', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await gotoApp(page);
    const before = await getEditorText(page);
    await tailAddActor(page, 'E1');
    const step1 = await getEditorText(page);
    await tailAddActor(page, 'E2');
    const step2 = await getEditorText(page);
    expect(step2).toContain('actor E1');
    expect(step2).toContain('actor E2');
    // Undo: step2 → step1
    await page.locator('body').press('Control+z');
    await page.waitForTimeout(400);
    expect(await getEditorText(page)).toBe(step1);
    // Undo: step1 → before
    await page.locator('body').press('Control+z');
    await page.waitForTimeout(400);
    expect(await getEditorText(page)).toBe(before);
  });

  test('Ctrl+Z is suppressed while typing in property panel input', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await gotoApp(page);
    // Focus the Title field (#seq-title) in the property panel — this is an
    // input element where browser-native undo should be preserved.
    const title = page.locator('#seq-title');
    await title.fill('My Title');
    await title.press('Control+z');
    await page.waitForTimeout(200);
    // Browser native: textarea/input gets cleared (or partially undone),
    // and the editor textarea must NOT have been touched by our handler.
    const ed = await getEditorText(page);
    expect(ed).toContain('@startuml');
    expect(ed).toContain('actor User');  // sample template still present
  });
});
