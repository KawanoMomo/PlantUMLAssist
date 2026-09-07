// @ts-check
// BLK-primary-20260907-0923-design: design「1a 設定と網羅」5a の
// 設定「レンダリング」。local / online を速度と外部送信の 2 点で比べられ、
// Java の検出結果がその場に出ることを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

async function openRenderTab(page) {
  await page.locator('#rail-config').click();
  await expect(page.locator('#cfg-modal')).toBeVisible();
  await page.locator('#cfg-tab-render').click();
  await expect(page.locator('#cfg-pane-render')).toBeVisible();
}

test.describe('BLK-primary-0923-design 設定「レンダリング」', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('サーバが Java の検出結果を答える', async ({ page }) => {
    await gotoApp(page);
    const env = await page.evaluate(() => fetch('/env').then((r) => r.json()));
    expect(env).toHaveProperty('java');
    expect(typeof env.java.found).toBe('boolean');
    expect(typeof env.jar).toBe('boolean');
    if (env.java.found) expect(typeof env.java.major).toBe('number');
  });

  test('描画方法が 3 枚のカードで出て、3 枚目は選べない「将来対応」', async ({ page }) => {
    await gotoApp(page);
    await openRenderTab(page);
    const cards = page.locator('#cfg-render-modes .cfg-mode-card');
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toContainText('local（Java）');
    await expect(cards.nth(1)).toContainText('online（plantuml.com）');
    await expect(cards.nth(2)).toContainText('同梱エンジン');
    await expect(cards.nth(2)).toContainText('将来対応');
    await expect(cards.nth(2).locator('input')).toBeDisabled();
  });

  test('速度と外部送信の 2 点が各カードに並ぶ', async ({ page }) => {
    await gotoApp(page);
    await openRenderTab(page);
    const local = page.locator('#cfg-render-modes .cfg-mode-card[data-mode-id="local"]');
    await expect(local.locator('.cfg-mode-speed')).toContainText('10〜30ms');
    await expect(local.locator('.cfg-mode-privacy')).toContainText('DSL は外部に出ません');
    const online = page.locator('#cfg-render-modes .cfg-mode-card[data-mode-id="online"]');
    await expect(online.locator('.cfg-mode-speed')).toContainText('200ms〜');
    await expect(online.locator('.cfg-mode-privacy')).toContainText('外部サーバに送信されます');
  });

  test('local カードに Java の検出結果が出る', async ({ page }) => {
    await gotoApp(page);
    await openRenderTab(page);
    const badge = page.locator('#cfg-render-modes .cfg-mode-card[data-mode-id="local"] .cfg-mode-badge');
    await expect(badge).toHaveText(/Java (\d+ )?(検出|未検出)/);
    // Java の有無は「判定中」のまま止まらない。
    await expect(badge).not.toHaveText('Java 判定中…');
  });

  test('この環境の実測 ms がカードに出る (どちらが速いか設定画面で比べられる)', async ({ page }) => {
    await gotoApp(page);
    // 一度 local で描いてから開く。
    await page.evaluate(() => {
      const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      ed.value = '@startuml\nactor User\nparticipant System\nUser -> System : Request\n@enduml';
      ed.dispatchEvent(new Event('input'));
    });
    await page.waitForTimeout(1500);
    await openRenderTab(page);
    await expect(page.locator('#cfg-render-modes .cfg-mode-card[data-mode-id="local"] .cfg-mode-speed'))
      .toContainText('この環境の前回:');
  });

  test('カードを選ぶと注記が切り替わり、保存でツールバーのモードも変わる', async ({ page }) => {
    await gotoApp(page);
    await openRenderTab(page);
    await expect(page.locator('#render-mode')).toHaveValue('local');
    await page.locator('#cfg-render-modes .cfg-mode-card[data-mode-id="online"] input').check();
    await expect(page.locator('#cfg-render-note')).toContainText('plantuml.com');
    await page.locator('#cfg-ok').click();
    await expect(page.locator('#cfg-modal')).toBeHidden();
    await expect(page.locator('#render-mode')).toHaveValue('online');
  });

  test('「入力を止めてから描画するまで」が 即時 / 300ms / 1s の 3 択で、保存すると残る', async ({ page }) => {
    await gotoApp(page);
    await openRenderTab(page);
    const segs = page.locator('#cfg-render-debounce .cfg-seg');
    await expect(segs).toHaveCount(3);
    await expect(segs.nth(0)).toHaveText('即時');
    await expect(segs.nth(1)).toHaveText('300ms');
    await expect(segs.nth(2)).toHaveText('1s');
    await segs.nth(2).click();
    await expect(segs.nth(2)).toHaveClass(/active/);
    await page.locator('#cfg-ok').click();
    const saved = await page.evaluate(() => window.localStorage.getItem('plantuml-render-debounce'));
    expect(saved).toBe('1000');
    // 開き直しても選択が残る。
    await openRenderTab(page);
    await expect(page.locator('#cfg-render-debounce .cfg-seg').nth(2)).toHaveClass(/active/);
  });
});
