// @ts-check
const { test, expect } = require('@playwright/test');

// Helper: wait for initial render cycle to complete (status != 'Idle' and != 'Rendering…')
async function waitForInitialCycle(page) {
  await page.goto('/');
  await page.waitForSelector('#preview-svg', { timeout: 5000 });
  await page.waitForTimeout(1500);
}

test.describe('Sequence: Boot', () => {
  test('loads template on boot', async ({ page }) => {
    await waitForInitialCycle(page);
    const editor = await page.locator('#editor').inputValue();
    expect(editor).toContain('@startuml');
    expect(editor).toContain('@enduml');
  });

  // Sprint 6 で UC E2E に置き換え予定 (Task 3.2: tail-add コンパクトメニュー化により旧 selectors 廃止)
  test.skip('property panel shows Sequence UI', async ({ page }) => {
    await waitForInitialCycle(page);
    await expect(page.locator('#seq-add-part-btn')).toBeVisible();
    await expect(page.locator('#seq-add-msg-btn')).toBeVisible();
    await expect(page.locator('#seq-set-title')).toBeVisible();
  });

  test('toolbar has render-mode and diagram-type selects', async ({ page }) => {
    await waitForInitialCycle(page);
    await expect(page.locator('#render-mode')).toBeVisible();
    await expect(page.locator('#diagram-type')).toBeVisible();
  });

  test('status bar reports element count', async ({ page }) => {
    await waitForInitialCycle(page);
    const statusInfo = await page.locator('#status-info').textContent();
    // Template has 3 participants + 4 messages
    expect(statusInfo).toContain('elements');
    expect(statusInfo).toContain('relations');
  });
});

test.describe('Sequence Operations', () => {
  test('set title updates editor text', async ({ page }) => {
    await waitForInitialCycle(page);
    await page.locator('#seq-title').fill('New Title');
    await page.locator('#seq-set-title').click();
    await page.waitForTimeout(400);
    const t = await page.locator('#editor').inputValue();
    expect(t).toContain('title New Title');
  });

  // Sprint 6 で UC E2E (#seq-tail-* selectors) に置き換え予定 (Task 3.2: tail-add コンパクトメニュー化)
  test.skip('add participant updates editor text', async ({ page }) => {
    await waitForInitialCycle(page);
    await page.locator('#seq-add-ptype').selectOption('actor');
    await page.locator('#seq-add-alias').fill('NewActor');
    await page.locator('#seq-add-label').fill('New Actor');
    await page.locator('#seq-add-part-btn').click();
    await page.waitForTimeout(400);
    const t = await page.locator('#editor').inputValue();
    expect(t).toContain('actor "New Actor" as NewActor');
  });

  // Sprint 6 で UC E2E (#seq-tail-* selectors) に置き換え予定 (Task 3.2: tail-add コンパクトメニュー化)
  test.skip('add message between existing participants', async ({ page }) => {
    await waitForInitialCycle(page);
    await page.locator('#seq-add-from').selectOption('User');
    await page.locator('#seq-add-to').selectOption('DB');
    await page.locator('#seq-add-arrow').selectOption('-->');
    await page.locator('#seq-add-msg-label').fill('hello');
    await page.locator('#seq-add-msg-btn').click();
    await page.waitForTimeout(400);
    const t = await page.locator('#editor').inputValue();
    expect(t).toContain('User --> DB : hello');
  });

  test('Tab key indents by 2 spaces in editor', async ({ page }) => {
    await waitForInitialCycle(page);
    await page.locator('#editor').click();
    await page.locator('#editor').evaluate((e) => {
      e.value = 'xyz';
      e.dispatchEvent(new Event('input'));
      e.setSelectionRange(0, 0);
    });
    await page.locator('#editor').focus();
    await page.keyboard.press('Tab');
    const t = await page.locator('#editor').inputValue();
    expect(t.startsWith('  xyz')).toBe(true);
  });

  test('render-mode toggle persists to localStorage', async ({ page }) => {
    await waitForInitialCycle(page);
    await page.locator('#render-mode').selectOption('online');
    await page.waitForTimeout(300);
    const stored = await page.evaluate(() => localStorage.getItem('plantuml-render-mode'));
    expect(stored).toBe('online');
  });

  // v1.1.2: Japanese participant alias normalizes to ASCII alias (P1, P2..)
  // so subsequent message arrows can match MSG_RE's ASCII identifier
  // requirement.
  test('UC-bug-jp v1.1.2: Japanese-named participant is selectable', async ({ page }) => {
    await waitForInitialCycle(page);
    // Switch to online for deterministic SVG render even without Java
    await page.locator('#render-mode').selectOption('online');
    await page.waitForTimeout(500);
    // Clear existing template, then add Japanese participant via tail-add
    await page.locator('#editor').fill('@startuml\n@enduml');
    await page.waitForTimeout(800);
    await page.locator('#seq-tail-kind').selectOption('participant');
    await page.locator('#seq-tail-alias').fill('利用者');
    await page.locator('#seq-tail-add').click();
    await page.waitForTimeout(2500);
    const t = await page.locator('#editor').inputValue();
    expect(t).toContain('participant "利用者" as P1');
  });
});
