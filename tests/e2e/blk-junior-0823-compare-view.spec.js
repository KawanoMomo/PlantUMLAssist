// @ts-check
// BLK-junior-20260907-0823-wish: 先輩の図と自分の図を並べて見比べる。
// 従来は「先輩のタブを開いて記憶 → 自分のタブに切り替えて打ち込む」の往復しかなかった。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const SENIOR = [
  '@startuml',
  'class Driver_Common {',
  '  + init() : void',
  '}',
  '@enduml',
].join('\n');

const MINE = [
  '@startuml',
  'class UartDrv',
  '@enduml',
].join('\n');

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(1500);
}

// 先輩の図のタブ + 自分の図のタブ、の 2 枚を用意する
async function twoTabs(page) {
  await gotoApp(page);
  await typeDsl(page, SENIOR);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(600);
  await typeDsl(page, MINE);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
});

test('「⇔ 並べて見る」で参照ペインが開き、もう 1 枚の図が描かれる', async ({ page }) => {
  await twoTabs(page);
  await expect(page.locator('#compare-pane')).toBeHidden();

  await page.locator('#btn-tab-compare').click();
  await expect(page.locator('#compare-pane')).toBeVisible();
  await expect(page.locator('#compare-svg svg')).toBeVisible({ timeout: 15000 });
  // 参照側には先輩の図が出る (自分の図ではない)
  await expect(page.locator('#compare-svg')).toContainText('Driver_Common');
});

test('参照ペインを開いたまま自分の図を編集し続けられる', async ({ page }) => {
  await twoTabs(page);
  await page.locator('#btn-tab-compare').click();
  await expect(page.locator('#compare-svg svg')).toBeVisible({ timeout: 15000 });

  // タブは 1 回も切り替えずに、参照を見ながら書き足す
  await typeDsl(page, MINE.replace('class UartDrv', 'class UartDrv {\n  + init() : void\n}'));

  expect(await getEditorText(page)).toContain('+ init() : void');
  await expect(page.locator('#compare-pane')).toBeVisible();
  await expect(page.locator('#compare-svg')).toContainText('Driver_Common');
});

test('編集中のタブは参照の候補に出ない', async ({ page }) => {
  await twoTabs(page);
  await page.locator('#btn-tab-compare').click();
  await expect(page.locator('#compare-svg svg')).toBeVisible({ timeout: 15000 });

  const opts = page.locator('#compare-select option');
  await expect(opts).toHaveCount(1);   // 2 枚のうち編集中の 1 枚を除いた残り

  // 先輩のタブに移ると、候補は自分の図に入れ替わる
  await page.locator('#tab-bar .tab').first().click();
  await page.waitForTimeout(2000);
  await expect(page.locator('#compare-select option')).toHaveCount(1);
  await expect(page.locator('#compare-svg')).toContainText('UartDrv', { timeout: 15000 });
});

test('参照ペインは主プレビューと別にスクロールする', async ({ page }) => {
  await twoTabs(page);
  await page.locator('#btn-tab-compare').click();
  await expect(page.locator('#compare-svg svg')).toBeVisible({ timeout: 15000 });

  const independent = await page.evaluate(() => {
    const a = document.getElementById('preview-container');
    const b = document.getElementById('compare-container');
    return !!a && !!b && a !== b && getComputedStyle(b).overflow !== 'visible';
  });
  expect(independent).toBe(true);
});

test('✕ で参照ペインを閉じられる', async ({ page }) => {
  await twoTabs(page);
  await page.locator('#btn-tab-compare').click();
  await expect(page.locator('#compare-pane')).toBeVisible();
  await page.locator('#btn-compare-close').click();
  await expect(page.locator('#compare-pane')).toBeHidden();
});

test('タブが 1 枚のときは並べる図が無いと知らせる', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, MINE);
  await page.locator('#btn-tab-compare').click();
  await expect(page.locator('#compare-pane')).toBeVisible();
  await expect(page.locator('#compare-empty')).toContainText('並べる図がありません');
});
