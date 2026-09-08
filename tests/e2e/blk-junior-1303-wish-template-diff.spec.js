// @ts-check
// BLK-junior-20260908-1303-wish: 参照ペインの「🧩 雛形との差分」で、参照図を雛形として
// 題材語 (GPIO / UART) を伏せて突き合わせ、「この図だけ / 雛形だけ」の行が出ること。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const TEMPLATE = [
  '@startuml',
  'start',
  ':GPIOクロックを有効化;',
  ':GPIO_Configureを呼ぶ;',
  ':GPIO割込みを有効化;',
  'stop',
  '@enduml',
].join('\n');

const SAME = TEMPLATE.split('GPIO').join('UART');
const DIFFERENT = SAME.replace(':UART割込みを有効化;', ':UART割込みを有効化;\n:UARTボーレートを設定;');

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(1500);
}

async function openDiff(page, mine) {
  await gotoApp(page);
  await typeDsl(page, TEMPLATE);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(600);
  await typeDsl(page, mine);
  await page.locator('#btn-tab-compare').click();
  await expect(page.locator('#compare-pane')).toBeVisible();
  await page.locator('#btn-td-run').click();
  await expect(page.locator('#td-list')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
});

test('題材語だけが違う派生図は「雛形どおり」と言い切る', async ({ page }) => {
  await openDiff(page, SAME);
  await expect(page.locator('#td-summary')).toContainText('雛形どおり');
  await expect(page.locator('.td-row[data-td-kind="added"]')).toHaveCount(0);
  await expect(page.locator('.td-row[data-td-kind="removed"]')).toHaveCount(0);
});

test('伏せた題材語を画面で言う (推測が外れても気づける)', async ({ page }) => {
  await openDiff(page, SAME);
  await expect(page.locator('#td-note')).toContainText('雛形 GPIO');
  await expect(page.locator('#td-note')).toContainText('この図 UART');
});

test('派生図にだけある手順が「この図だけ」で先頭に出る', async ({ page }) => {
  await openDiff(page, DIFFERENT);
  await expect(page.locator('#td-summary')).toContainText('追加 1');
  const first = page.locator('.td-row').first();
  await expect(first).toHaveAttribute('data-td-kind', 'added');
  await expect(first).toContainText(':UARTボーレートを設定;');
});

test('雛形にだけある手順は「雛形だけ」に出る', async ({ page }) => {
  await openDiff(page, SAME.replace(':UART割込みを有効化;\n', ''));
  await expect(page.locator('.td-row[data-td-kind="removed"]')).toHaveCount(1);
  await expect(page.locator('.td-row[data-td-kind="removed"]')).toContainText('割込みを有効化');
});

test('参照図を選ばずに押すと、選ぶように言う', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, SAME);
  await page.locator('#btn-tab-compare').click();
  await page.locator('#btn-td-run').click();
  await expect(page.locator('#td-summary')).toContainText('参照図を選んでください');
});
