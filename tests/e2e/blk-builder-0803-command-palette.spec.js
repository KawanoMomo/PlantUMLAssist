// @ts-check
// BLK-builder-20260907-0803-1: design「リデザイン案」1a のコマンドパレット。
// Ctrl+K でコマンド・要素を名前で検索して実行できることを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(300);
}

const SEQ = '@startuml\nactor User\nparticipant "注文サービス" as OrderSvc\ndatabase DB\nUser -> OrderSvc : Request\n@enduml';

test.describe('BLK-builder-0803 コマンドパレット', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('ツールバーに検索入口があり Ctrl+K の表示が出ている', async ({ page }) => {
    await gotoApp(page);
    const btn = page.locator('#btn-command-palette');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('コマンド・要素を検索');
    await expect(btn).toContainText('Ctrl+K');
  });

  test('Ctrl+K で開き Esc で閉じる', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('#cp-modal')).toBeHidden();
    await page.keyboard.press('Control+k');
    await expect(page.locator('#cp-modal')).toBeVisible();
    await expect(page.locator('#cp-input')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#cp-modal')).toBeHidden();
  });

  test('検索入口のクリックでも開く', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#btn-command-palette').click();
    await expect(page.locator('#cp-modal')).toBeVisible();
  });

  test('打った文字でコマンドが絞り込まれる', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+k');
    const before = await page.locator('#cp-list .cp-item').count();
    expect(before).toBeGreaterThan(10);
    await page.locator('#cp-input').fill('zoom');
    const items = page.locator('#cp-list .cp-item');
    await expect(items).toHaveCount(3);
    await expect(items.first()).toHaveClass(/active/);
  });

  test('該当が無ければその旨を出す', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('zzzzz');
    await expect(page.locator('#cp-list .cp-item')).toHaveCount(0);
    await expect(page.locator('#cp-empty')).toBeVisible();
  });

  test('Enter で図種を切り替えられる (ツールバーを探さずに実行できる)', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('#diagram-type')).toHaveValue('plantuml-sequence');
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('状態遷移');
    await page.keyboard.press('Enter');
    await expect(page.locator('#cp-modal')).toBeHidden();
    await expect(page.locator('#diagram-type')).toHaveValue('plantuml-state');
  });

  test('↑↓ で候補を選んで Enter で実行する', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('レンダリング:');
    const items = page.locator('#cp-list .cp-item');
    await expect(items).toHaveCount(2);
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toHaveClass(/active/);
    await page.keyboard.press('Enter');
    await expect(page.locator('#render-mode')).toHaveValue('online');
  });

  test('DSL の要素も同じ窓で探せ、選ぶとその行へ飛ぶ', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SEQ);
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('注文');
    const items = page.locator('#cp-list .cp-item');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('注文サービス');
    await expect(items.first()).toContainText('L3');
    await page.keyboard.press('Enter');
    const sel = await page.evaluate(() => {
      const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      return ed.value.slice(ed.selectionStart, ed.selectionEnd);
    });
    expect(sel).toBe('participant "注文サービス" as OrderSvc');
  });

  test('クリックでも実行できる', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('クラス図');
    await page.locator('#cp-list .cp-item').first().click();
    await expect(page.locator('#cp-modal')).toBeHidden();
    await expect(page.locator('#diagram-type')).toHaveValue('plantuml-class');
  });

  test('背景のクリックで閉じる', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+k');
    await page.locator('#cp-modal').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#cp-modal')).toBeHidden();
  });
});
