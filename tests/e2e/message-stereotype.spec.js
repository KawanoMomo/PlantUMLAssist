// @ts-check
// userissue v1.2.7: 各メッセージごとにプロパティ上で Stereotype を入力できる
// ようにする。 ライムグリーンの <<X>> がメッセージ上段に表示される canonical
// 形式 <color:#32CD32><<X>></color>\n<plain> で DSL に書き戻す。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');
const path = require('path');

async function setEditor(page, text) {
  await page.evaluate((t) => {
    var ed = document.getElementById('editor');
    ed.value = t;
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  await page.waitForTimeout(800);
}

const FIXTURE = [
  '@startuml',
  'title Stereotype Test',
  'actor User',
  'participant System',
  '',
  'User -> System : doLogin',
  'System --> User : ack',
  '@enduml',
].join('\n');

test.describe('per-message stereotype (userissue v1.2.7)', () => {
  test('selecting a message shows Stereotype input field', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await gotoApp(page);
    await setEditor(page, FIXTURE);
    // Click a message overlay rect
    await page.evaluate(() => {
      var r = document.querySelector('#overlay-layer rect[data-type="message"]');
      r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    const stereoEl = page.locator('#seq-edit-stereotype');
    await expect(stereoEl).toBeVisible();
    await expect(stereoEl).toHaveValue('');
  });

  test('typing stereotype updates DSL with lime green color tag', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await gotoApp(page);
    await setEditor(page, FIXTURE);
    await page.evaluate(() => {
      var rects = document.querySelectorAll('#overlay-layer rect[data-type="message"]');
      rects[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    const stereoEl = page.locator('#seq-edit-stereotype');
    await stereoEl.fill('async');
    await stereoEl.press('Tab');  // trigger change event
    await page.waitForTimeout(500);
    var t = await getEditorText(page);
    // Canonical form should appear in the DSL on the message line
    expect(t).toContain('<color:#32CD32><<async>></color>\\ndoLogin');
    // Original message components preserved
    expect(t).toContain('User -> System');
  });

  test('removing stereotype restores plain label', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await gotoApp(page);
    // Pre-load DSL that already has a stereotype
    await setEditor(page, [
      '@startuml',
      'actor User',
      'participant System',
      'User -> System : <color:#32CD32><<sync>></color>\\nfoo',
      '@enduml',
    ].join('\n'));
    await page.evaluate(() => {
      var r = document.querySelector('#overlay-layer rect[data-type="message"]');
      r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    const stereoEl = page.locator('#seq-edit-stereotype');
    await expect(stereoEl).toHaveValue('sync');
    await stereoEl.fill('');
    await stereoEl.press('Tab');
    await page.waitForTimeout(500);
    var t = await getEditorText(page);
    expect(t).not.toContain('<color:');
    expect(t).not.toContain('<<sync>>');
    expect(t).toContain('User -> System : foo');
  });

  test('stereotype permissive: << >> wrappers stripped on input', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await gotoApp(page);
    await setEditor(page, FIXTURE);
    await page.evaluate(() => {
      var rects = document.querySelectorAll('#overlay-layer rect[data-type="message"]');
      rects[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    await page.locator('#seq-edit-stereotype').fill('<<important>>');
    await page.locator('#seq-edit-stereotype').press('Tab');
    await page.waitForTimeout(500);
    var t = await getEditorText(page);
    expect(t).toContain('<color:#32CD32><<important>></color>\\ndoLogin');
    expect(t).not.toContain('<<<<');
    expect(t).not.toContain('>>>>');
  });

  test('「ここに挿入」 modal includes Stereotype field and emits canonical DSL', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await gotoApp(page);
    await setEditor(page, FIXTURE);
    // Open the insert-after modal from the action bar of an existing message
    await page.evaluate(() => {
      var rects = document.querySelectorAll('#overlay-layer rect[data-type="message"]');
      rects[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    await page.locator('.seq-insert-msg-after').first().click();
    await page.waitForTimeout(300);
    // Modal must show stereotype input
    const modStereo = page.locator('#seq-mod-stereotype');
    await expect(modStereo).toBeVisible();
    // Fill it + label and confirm
    await modStereo.fill('callback');
    // Use the rich-label editor (textarea inside #seq-mod-label-rle)
    await page.locator('#seq-mod-label-rle textarea').fill('handleResponse');
    await page.locator('#seq-mod-confirm').click();
    await page.waitForTimeout(800);
    var t = await getEditorText(page);
    expect(t).toContain('<color:#32CD32><<callback>></color>\\nhandleResponse');
  });

  test('末尾に追加 form includes Stereotype field and emits canonical DSL', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await gotoApp(page);
    await setEditor(page, FIXTURE);
    // No selection — ensure tail-add panel is shown (clear any selection)
    await page.evaluate(() => { window.MA.selection.clearSelection(); });
    await page.waitForTimeout(200);
    // Default kind is 'message', the stereotype input is rendered
    const tailStereo = page.locator('#seq-tail-stereotype');
    await expect(tailStereo).toBeVisible();
    await tailStereo.fill('retry');
    await page.locator('#seq-tail-from').selectOption('User');
    await page.locator('#seq-tail-to').selectOption('System');
    await page.locator('#seq-tail-label-rle textarea').fill('refetch');
    await page.locator('#seq-tail-add').click();
    await page.waitForTimeout(800);
    var t = await getEditorText(page);
    expect(t).toContain('<color:#32CD32><<retry>></color>\\nrefetch');
    expect(t).toContain('User -> System');
  });

  test('VISUAL: stereotype rendered above message in lime green', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await gotoApp(page);
    await setEditor(page, FIXTURE);
    // Apply <<async>> stereotype to first message
    await page.evaluate(() => {
      var rects = document.querySelectorAll('#overlay-layer rect[data-type="message"]');
      rects[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(__dirname, '../../.investigation/stereotype-01-empty-field.png'),
      fullPage: true,
    });
    await page.locator('#seq-edit-stereotype').fill('async');
    await page.locator('#seq-edit-stereotype').press('Tab');
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: path.join(__dirname, '../../.investigation/stereotype-02-applied.png'),
      fullPage: true,
    });
  });
});
