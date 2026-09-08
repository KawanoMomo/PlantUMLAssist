// @ts-check
// BLK-builder-20260907-1403-4 — design 5b「行をクリックすると割り当てを変更」と「既定に戻す」。
// 表の行を押してキーを取り直せ、衝突は保存させず、差し替えたキーで実際に操作が起きる。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

async function openShortcuts(page) {
  await gotoApp(page);
  await page.evaluate(() => {
    localStorage.removeItem('plantuml-settings-tab');
    localStorage.removeItem('plantuml-assist-shortcuts');
  });
  await page.locator('#rail-config').click();
  await expect(page.locator('#cfg-modal')).toBeVisible();
  await page.locator('#cfg-tab-shortcuts').click();
  await expect(page.locator('#cfg-pane-shortcuts')).toBeVisible();
}

function row(page, id) {
  return page.locator('#cfg-shortcuts-list tr[data-sc-id="' + id + '"]');
}

test.describe('ショートカットの割り当て変更 (design 5b)', () => {
  test('差し替えできる行だけが押せる形になっている', async ({ page }) => {
    await openShortcuts(page);
    await expect(row(page, 'render')).toHaveAttribute('data-sc-remap', '1');
    await expect(row(page, 'render')).toHaveAttribute('role', 'button');
    // 範囲の割り当て (Ctrl+1 … Ctrl+6) は 1 つのキーで表せないので押せない
    await expect(row(page, 'view-type')).toHaveAttribute('data-sc-remap', '0');
    expect(await row(page, 'view-type').getAttribute('role')).toBeNull();
  });

  test('行を押してキーを取り直すと、表のキー表示が変わって「変更」が付く', async ({ page }) => {
    await openShortcuts(page);
    await expect(row(page, 'render').locator('kbd')).toHaveText('Ctrl+R');
    await row(page, 'render').click();
    await expect(page.locator('#cfg-shortcuts-list .cfg-sc-capture-hint')).toBeVisible();
    await page.keyboard.press('Control+Alt+R');
    await expect(row(page, 'render').locator('kbd')).toHaveText('Ctrl+Alt+R');
    await expect(row(page, 'render').locator('.cfg-sc-changed')).toBeVisible();
    await expect(page.locator('#cfg-sc-note')).toContainText('Ctrl+Alt+R に変更しました');
  });

  test('Esc でキー待ちを取り消すと割り当ては変わらない', async ({ page }) => {
    await openShortcuts(page);
    await row(page, 'save').click();
    await expect(page.locator('#cfg-shortcuts-list .cfg-sc-capture-hint')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#cfg-shortcuts-list .cfg-sc-capture-hint')).toHaveCount(0);
    await expect(row(page, 'save').locator('kbd')).toHaveText('Ctrl+S');
    await expect(page.locator('#cfg-modal')).toBeVisible();   // モーダルは閉じない
  });

  test('既に使われているキーは保存せず、衝突相手の操作名を出す', async ({ page }) => {
    await openShortcuts(page);
    await row(page, 'render').click();
    await page.keyboard.press('Control+K');
    await expect(page.locator('#cfg-sc-note')).toContainText('コマンドパレットを開く');
    await expect(page.locator('#cfg-sc-note')).toHaveAttribute('data-sc-note', 'bad');
    // キー待ちのまま (行はまだ「キーを押してください」を出している)
    await expect(row(page, 'render')).toHaveClass(/cfg-sc-capturing/);
    // 別のキーで取り直せる
    await page.keyboard.press('Control+Alt+K');
    await expect(row(page, 'render').locator('kbd')).toHaveText('Ctrl+Alt+K');
  });

  test('差し替えたキーで実際に操作が起きる (Ctrl+K のコマンドパレット)', async ({ page }) => {
    await openShortcuts(page);
    await row(page, 'palette').click();
    await page.keyboard.press('Control+Alt+P');
    await expect(row(page, 'palette').locator('kbd')).toHaveText('Ctrl+Alt+P');
    await page.locator('#cfg-cancel').click();
    await expect(page.locator('#cfg-modal')).toBeHidden();

    // 古い Ctrl+K では開かない
    await page.keyboard.press('Control+K');
    await expect(page.locator('#cp-modal')).not.toHaveClass(/open/);
    // 新しい割り当てで開く
    await page.keyboard.press('Control+Alt+P');
    await expect(page.locator('#cp-modal')).toHaveClass(/open/);
  });

  test('差し替えたキーで実際に保存が起きる (Ctrl+S)', async ({ page }) => {
    await openShortcuts(page);
    await row(page, 'save').click();
    await page.keyboard.press('Control+Alt+W');
    await page.locator('#cfg-cancel').click();
    await expect(page.locator('#cfg-modal')).toBeHidden();
    const dl = page.waitForEvent('download', { timeout: 10000 });
    await page.keyboard.press('Control+Alt+W');
    const file = await dl;
    expect(file.suggestedFilename()).toMatch(/\.puml$/);
  });

  test('差し替えは再読み込みしても残る', async ({ page }) => {
    await openShortcuts(page);
    await row(page, 'render').click();
    await page.keyboard.press('Control+Alt+R');
    await expect(row(page, 'render').locator('kbd')).toHaveText('Ctrl+Alt+R');
    await page.reload();
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    await page.locator('#rail-config').click();
    await page.locator('#cfg-tab-shortcuts').click();
    await expect(row(page, 'render').locator('kbd')).toHaveText('Ctrl+Alt+R');
  });

  test('「既定に戻す」で全部の行が既定に戻る', async ({ page }) => {
    await openShortcuts(page);
    await row(page, 'render').click();
    await page.keyboard.press('Control+Alt+R');
    await row(page, 'save').click();
    await page.keyboard.press('Control+Alt+W');
    expect(await page.locator('#cfg-shortcuts-list .cfg-sc-changed').count()).toBe(2);

    await page.locator('#cfg-sc-reset').click();
    await expect(page.locator('#cfg-sc-note')).toContainText('既定に戻しました');
    expect(await page.locator('#cfg-shortcuts-list .cfg-sc-changed').count()).toBe(0);
    await expect(row(page, 'render').locator('kbd')).toHaveText('Ctrl+R');
    await expect(row(page, 'save').locator('kbd')).toHaveText('Ctrl+S');
  });
});
