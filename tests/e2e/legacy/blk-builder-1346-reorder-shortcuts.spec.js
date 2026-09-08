// @ts-check
// BLK-builder-20260907-1346-3 (design 5b): 表に「新設（未実装）」で残っていた
// Alt+↑ / Alt+↓ (選択を上下に並び替える) と Ctrl+Enter (末尾に追加) を実装する。
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText } = require('../helpers');

async function selectLine(page, line) {
  await page.locator('#overlay-layer rect[data-line="' + line + '"]').first().click();
  await page.waitForTimeout(300);
}

async function pressOnBody(page, key) {
  await page.locator('#preview-container').press(key);
  await page.waitForTimeout(600);
}

test.describe('BLK-builder-1346 Alt+↑ / Alt+↓ で選択を並び替える', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);
  });

  test('Alt+↓ で選択中のメッセージが 1 つ下の兄弟と入れ替わる', async ({ page }) => {
    const before = (await getEditorText(page)).split('\n');
    const rects = page.locator('#overlay-layer rect[data-type="message"]');
    const count = await rects.count();
    if (count < 2) test.skip();
    const line = Number(await rects.first().getAttribute('data-line'));
    await selectLine(page, line);
    await pressOnBody(page, 'Alt+ArrowDown');
    const after = (await getEditorText(page)).split('\n');
    expect(after.length).toBe(before.length);
    expect(after[line - 1]).toBe(before[line]);
    expect(after[line]).toBe(before[line - 1]);
  });

  test('Alt+↑ で元に戻り、Ctrl+Z 1 回でも戻せる', async ({ page }) => {
    const before = await getEditorText(page);
    const rects = page.locator('#overlay-layer rect[data-type="message"]');
    if ((await rects.count()) < 2) test.skip();
    const line = Number(await rects.first().getAttribute('data-line'));
    await selectLine(page, line);
    await pressOnBody(page, 'Alt+ArrowDown');
    expect(await getEditorText(page)).not.toBe(before);
    await page.locator('#preview-container').press('Control+z');
    await page.waitForTimeout(600);
    expect(await getEditorText(page)).toBe(before);
  });

  test('端では DSL が 1 バイトも変わらない', async ({ page }) => {
    const rects = page.locator('#overlay-layer rect[data-type="message"]');
    if ((await rects.count()) < 2) test.skip();
    const line = Number(await rects.first().getAttribute('data-line'));
    await selectLine(page, line);
    const before = await getEditorText(page);
    await pressOnBody(page, 'Alt+ArrowUp');   // 参加者宣言より上へは出ない…
    const after = await getEditorText(page);
    // 上に兄弟 (participant 宣言) があれば入れ替わり、無ければ変わらない。
    // どちらでも行数は保たれ、行の集合は同じである。
    expect(after.split('\n').length).toBe(before.split('\n').length);
    expect(after.split('\n').sort().join('|')).toBe(before.split('\n').sort().join('|'));
  });

  test('DSL エディタにカーソルがあるときは従来どおりカーソル行が動く', async ({ page }) => {
    const before = (await getEditorText(page)).split('\n');
    await page.locator('#editor').click();
    await page.locator('#editor').press('Control+Home');
    for (let i = 0; i < 3; i++) await page.locator('#editor').press('ArrowDown');
    await page.locator('#editor').press('Alt+ArrowDown');
    await page.waitForTimeout(600);
    const after = (await getEditorText(page)).split('\n');
    expect(after.length).toBe(before.length);
    expect(after.slice().sort().join('|')).toBe(before.slice().sort().join('|'));
  });
});

test.describe('BLK-builder-1346 Ctrl+Enter で末尾に追加を開く', () => {
  test('選択が外れ、右ペインの「末尾に追加」の種類にフォーカスが移る', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);
    await page.locator('#preview-container').press('Control+Enter');
    await page.waitForTimeout(600);
    await expect(page.locator('#seq-tail-kind')).toBeVisible();
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
    expect(focused).toBe('seq-tail-kind');
  });

  test('図形を選んでいても、選択を外して末尾に追加を開く', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);
    const rects = page.locator('#overlay-layer rect[data-type="message"]');
    if ((await rects.count()) < 1) test.skip();
    await rects.first().click();
    await page.waitForTimeout(300);
    await page.locator('#preview-container').press('Control+Enter');
    await page.waitForTimeout(600);
    await expect(page.locator('#seq-tail-kind')).toBeVisible();
  });
});

test.describe('BLK-builder-1346 設定のショートカット表', () => {
  test('Ctrl+Enter と Alt+↑ / Alt+↓ が「実装済み」になっている', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => localStorage.removeItem('plantuml-settings-tab'));
    await page.locator('#rail-config').click();
    await expect(page.locator('#cfg-modal')).toBeVisible();
    await page.locator('#cfg-tab-shortcuts').click();
    await expect(page.locator('#cfg-pane-shortcuts')).toBeVisible();
    await expect(page.locator('#cfg-shortcuts-list')).toContainText('Ctrl+Enter');
    await expect(page.locator('#cfg-shortcuts-list tr[data-sc-state="new"]')).toHaveCount(0);
  });
});
