// @ts-check
// BLK-junior-20260907-0803-wish: 既存の図をテンプレートにして、部品名を 1 回
// 指定するだけで同じ構成の図を新しいタブに作れること。
// 「先輩の図を見ながら打ち直す (模写)」が「選ぶ→1 語入れる→確定」に変わる。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const TPL = [
  '@startuml',
  'title UART 受信ドライバ',
  '[*] --> Uart_Idle',
  'state Uart_Idle',
  'state Uart_Busy',
  'Uart_Idle --> Uart_Busy : UART_START',
  'Uart_Busy --> Uart_Idle : uart_done',
  'note right of Uart_Busy : UartDrv が転送中',
  '@enduml',
].join('\n');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(350);
}

async function openTemplate(page) {
  await page.locator('#btn-tab-template').click();
  await expect(page.locator('#tpl-modal')).toBeVisible();
  await expect(page.locator('#tpl-source')).toBeVisible();
}

test.describe('BLK-junior-0803-wish テンプレートから新規作成', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('タブバーに入口があり、開くと今のタブがテンプレート候補に出る', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, TPL);
    await openTemplate(page);
    await expect(page.locator('#tpl-source option').first()).toContainText('開いている図');
  });

  test('置換元が部品名の一族の頭で自動的に埋まる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, TPL);
    await openTemplate(page);
    await expect(page.locator('#tpl-from')).toHaveValue('Uart');
  });

  test('置換先を入れると変わる行が確定前に出る', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, TPL);
    await openTemplate(page);
    await page.locator('#tpl-to').fill('Gpio');
    await expect(page.locator('#tpl-summary')).toHaveAttribute('data-changed', '7');
    const rows = page.locator('#tpl-preview .tpl-row');
    await expect(rows).toHaveCount(7);
    await expect(rows.first()).toContainText('title UART 受信ドライバ');
    await expect(rows.first()).toContainText('title GPIO 受信ドライバ');
  });

  test('新しい図の名前が置換先から自動で埋まる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, TPL);
    await openTemplate(page);
    await page.locator('#tpl-to').fill('Gpio');
    await expect(page.locator('#tpl-name')).toHaveValue(/Gpio/);
  });

  test('確定すると新しいタブが増え、部品名だけが替わった図になる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, TPL);
    const before = await page.locator('#tab-bar .tab').count();
    await openTemplate(page);
    await page.locator('#tpl-to').fill('Gpio');
    await page.locator('#btn-tpl-create').click();
    await expect(page.locator('#tpl-modal')).toBeHidden();
    await expect(page.locator('#tab-bar .tab')).toHaveCount(before + 1);
    const dsl = await page.evaluate(() =>
      /** @type {HTMLTextAreaElement} */ (document.getElementById('editor')).value);
    expect(dsl).toContain('title GPIO 受信ドライバ');
    expect(dsl).toContain('state Gpio_Idle');
    expect(dsl).toContain(': GPIO_START');
    expect(dsl).toContain(': gpio_done');
    expect(dsl).toContain('GpioDrv が転送中');
    expect(dsl).not.toContain('Uart');
    expect(dsl.split('\n').length).toBe(TPL.split('\n').length);
  });

  test('元のタブは書き換わらない (テンプレートは残る)', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, TPL);
    await openTemplate(page);
    await page.locator('#tpl-to').fill('Gpio');
    await page.locator('#btn-tpl-create').click();
    await page.locator('#tab-bar .tab').first().click();
    await page.waitForTimeout(300);
    const dsl = await page.evaluate(() =>
      /** @type {HTMLTextAreaElement} */ (document.getElementById('editor')).value);
    expect(dsl).toBe(TPL);
  });

  test('置換元がテンプレートに無ければ作らせない', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, TPL);
    await openTemplate(page);
    await page.locator('#tpl-from').fill('Spi');
    await page.locator('#tpl-to').fill('Gpio');
    await expect(page.locator('#tpl-summary')).toContainText('出てきません');
    await expect(page.locator('#btn-tpl-create')).toBeDisabled();
  });

  test('Esc で閉じ、図は増えない', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, TPL);
    const before = await page.locator('#tab-bar .tab').count();
    await openTemplate(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#tpl-modal')).toBeHidden();
    await expect(page.locator('#tab-bar .tab')).toHaveCount(before);
  });

  test('模写せずに済む手数: 選ぶ→1 語入れる→確定 の 3 手で 1 枚できる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, TPL);
    let clicks = 0;
    await page.locator('#btn-tab-template').click(); clicks++;
    await expect(page.locator('#tpl-source')).toBeVisible();
    await page.locator('#tpl-to').click(); clicks++;
    await page.keyboard.type('Gpio');          // キー入力 4
    await page.locator('#btn-tpl-create').click(); clicks++;
    expect(clicks).toBeLessThan(10);
    const dsl = await page.evaluate(() =>
      /** @type {HTMLTextAreaElement} */ (document.getElementById('editor')).value);
    expect(dsl).toContain('state Gpio_Idle');
  });
});
