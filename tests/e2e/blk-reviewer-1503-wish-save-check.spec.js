// @ts-check
// BLK-reviewer-20260908-1503-wish 「保存時チェック」。
// これまで、保存した図の食い違い (架空の遷移ラベル・未使用 participant・表記揺れ)
// は reviewer が次の tick で突合ボードを開くまで誰も知らなかった。
// 保存を押したその場で同じ突合が走り、新しく生えた不一致がその図の上に出ること、
// 直さずに保存し直すと「そのまま N 回」と数が積み上がること、直すと帯が消えること。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('./helpers');

const DIR = saveDirFor(__filename);

// 未使用 participant (Unused) を 1 つ持つシーケンス図。
const DIRTY = [
  '@startuml', 'participant Gpio_Driver', 'participant Gpio_Hw', 'participant Unused',
  'Gpio_Driver -> Gpio_Hw : Gpio_Init', '@enduml',
].join('\n');

// Unused を消した版。
const CLEAN = [
  '@startuml', 'participant Gpio_Driver', 'participant Gpio_Hw',
  'Gpio_Driver -> Gpio_Hw : Gpio_Init', '@enduml',
].join('\n');

async function setup(page) {
  await gotoApp(page);
  await page.evaluate((dir) => {
    try {
      Object.keys(localStorage).forEach(function(k) {
        if (k.indexOf('pua.savecheck:') === 0) localStorage.removeItem(k);
      });
    } catch (e) {}
    window.MA.autoSave.setConfig({
      enabled: true, debounceMs: 500, restoreMode: 'none',
      backend: 'file', fileDir: dir,
    });
    window.MA.workspace.rename(window.MA.workspace.getActiveId(), 'Gpio_Seq');
  }, DIR);
}

async function setDsl(page, text) {
  await page.locator('#editor').fill(text);
  await page.waitForTimeout(800);
}

// Save は design 1a で上部バーから外れ、DOM だけに残っている
// (コマンドパレットが叩く経路と同じところを押す)。
async function pressSave(page) {
  await page.locator('#btn-save').dispatchEvent('click');
  await page.waitForTimeout(700);
}

test('保存したその場で、この図に新しく生えた不一致が図の上に出る', async ({ page }) => {
  await setup(page);
  await setDsl(page, DIRTY);
  await expect(page.locator('#save-check-overlay')).toBeHidden();

  await pressSave(page);
  await expect(page.locator('#save-check-overlay')).toBeVisible();
  await expect(page.locator('#sck-summary')).toContainText('新しい不一致');
  const first = page.locator('#sck-list li').first();
  await expect(first).toHaveClass(/sck-new/);
  await expect(first).toContainText('Unused');
});

test('直さずに保存し直すと「そのまま N 回」として数が積み上がる', async ({ page }) => {
  await setup(page);
  await setDsl(page, DIRTY);
  await pressSave(page);
  await expect(page.locator('#sck-summary')).toContainText('新しい不一致');

  await pressSave(page);
  await expect(page.locator('#sck-summary')).toContainText('未解消');
  await expect(page.locator('#sck-list li').first()).toContainText('そのまま 1 回');

  await pressSave(page);
  await expect(page.locator('#sck-list li').first()).toContainText('そのまま 2 回');
  await expect(page.locator('#sck-summary')).toContainText('2 回そのまま保存');
});

test('直して保存すると帯は消え、解消したことが分かる', async ({ page }) => {
  await setup(page);
  await setDsl(page, DIRTY);
  await pressSave(page);
  await expect(page.locator('#save-check-overlay')).toBeVisible();

  await setDsl(page, CLEAN);
  await pressSave(page);
  await expect(page.locator('#save-check-overlay')).toBeHidden();
  await expect(page.locator('#status-save-result')).toContainText('解消');
});

test('帯は閉じられ、突合ボードへ移れる', async ({ page }) => {
  await setup(page);
  await setDsl(page, DIRTY);
  await pressSave(page);

  await page.locator('#btn-sck-board').click();
  await expect(page.locator('#ab-modal')).toBeVisible();
  await page.locator('#ab-close').click();

  await page.locator('#btn-sck-close').click();
  await expect(page.locator('#save-check-overlay')).toBeHidden();
});
