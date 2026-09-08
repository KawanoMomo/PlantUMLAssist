// @ts-check
// BLK-junior-20260907-0943-wish: 先輩の図の流用は「⧉ 取り込み」と「⇄ 一括置換」を
// 手で組み合わせるしかなく、2 操作の間に無関係な宣言行まで壊れる余地があった
// (BLK-junior-20260907-0943: 置換元の名前を含まない interface 宣言が壊れた)。
// テンプレート画面の対応表に部品を全部並べ、1 画面で埋めてから複製する。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

// junior が流用した先輩の GPIO ドライバ構成図。
// interface "GPIO制御" as IGpio が「置換元の名前 GpioDrv を含まない宣言」。
const GPIO = [
  '@startuml',
  'component GpioDrv',
  'interface "GPIO制御" as IGpio',
  'component "GPIO HAL" as GpioHal',
  'component CommonLog',
  'GpioDrv - IGpio',
  'GpioDrv --> GpioHal',
  'GpioDrv --> CommonLog',
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

function editorText(page) {
  return page.evaluate(() =>
    /** @type {HTMLTextAreaElement} */ (document.getElementById('editor')).value);
}

async function openTemplate(page) {
  await page.locator('#btn-tab-template').click();
  await expect(page.locator('#tpl-source')).toBeVisible();
}

test.describe('BLK-junior-0943-wish テンプレートの対応表', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('宣言されている部品が全部 1 つの対応表に並ぶ', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, GPIO);
    await openTemplate(page);
    await page.locator('#tpl-from').fill('Gpio');
    await page.locator('#tpl-to').fill('Uart');

    // GpioDrv / IGpio / GpioHal / CommonLog の 4 部品
    await expect(page.locator('.tpl-map-row')).toHaveCount(4);
    await expect(page.locator('#tpl-remaining-head')).toHaveAttribute('data-map-rows', '4');
    // 系統の置換で決まった行は新しい名前が入っている
    await expect(page.locator('[data-map-input="GpioDrv"]')).toHaveValue('UartDrv');
    await expect(page.locator('[data-map-input="GpioHal"]')).toHaveValue('UartHal');
    // 系統の置換は語の頭でしか当たらないので、IGpio と CommonLog は決まらない。
    // 決まらなかった行だけが「残っている」扱いになり、対応表で埋める
    await expect(page.locator('[data-map-input="IGpio"]')).toHaveValue('');
    await expect(page.locator('[data-map-input="CommonLog"]')).toHaveValue('');
    await expect(page.locator('.tpl-remaining-row')).toHaveCount(2);
  });

  test('対応表を 1 画面で埋めるだけで UART 題材の図が 1 枚できる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, GPIO);
    await openTemplate(page);
    await page.locator('#tpl-from').fill('Gpio');
    await page.locator('#tpl-to').fill('Uart');
    await page.locator('[data-map-input="IGpio"]').fill('IUart');
    await page.locator('[data-map-input="CommonLog"]').fill('UartLog');
    await expect(page.locator('#tpl-blocked')).toHaveAttribute('data-unresolved', '0');
    await page.locator('#btn-tpl-create').click();

    await expect(page.locator('#tab-bar .tab')).toHaveCount(2);
    const out = await editorText(page);
    expect(out).toContain('component UartDrv');
    expect(out).toContain('as IUart');
    expect(out).toContain('as UartHal');
    expect(out).toContain('component UartLog');
    expect(out).not.toContain('CommonLog');
  });

  test('置換元の名前を含まない interface 宣言が壊れない', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, GPIO);
    await openTemplate(page);
    // 系統の置換は使わず、対応表だけで GpioDrv → UartDrv を当てる
    await page.locator('#tpl-from').fill('GpioDrv');
    await page.locator('#tpl-to').fill('UartDrv');
    await page.locator('[data-map-input="IGpio"]').fill('IUart');
    await page.locator('[data-map-input="GpioHal"]').fill('UartHal');
    await page.locator('[data-remaining-keep="CommonLog"]').check();
    await page.locator('#btn-tpl-create').click();

    const out = await editorText(page);
    // ラベルはそのまま、別名だけが付け替わる (二重引用符も C1 も生まれない)
    expect(out).toContain('interface "GPIO制御" as IUart');
    expect(out).not.toContain('""');
    expect(out).not.toContain('as C1');
    // 行数は元のまま
    expect(out.split('\n').length).toBe(GPIO.split('\n').length);
  });

  test('対応表に入れた名前だけが動き、無関係な部品は元のまま残る', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, GPIO);
    await openTemplate(page);
    await page.locator('#tpl-from').fill('GpioDrv');
    await page.locator('#tpl-to').fill('UartDrv');
    await page.locator('[data-remaining-keep="IGpio"]').check();
    await page.locator('[data-remaining-keep="GpioHal"]').check();
    await page.locator('[data-remaining-keep="CommonLog"]').check();
    await page.locator('#btn-tpl-create').click();

    const out = await editorText(page);
    expect(out).toContain('interface "GPIO制御" as IGpio');
    expect(out).toContain('component "GPIO HAL" as GpioHal');
    expect(out).toContain('component CommonLog');
    expect(out).toContain('component UartDrv');
  });

  test('対応表に入れた行は確定前のプレビューに出る', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, GPIO);
    await openTemplate(page);
    await page.locator('#tpl-from').fill('Gpio');
    await page.locator('#tpl-to').fill('Uart');
    const before = Number(await page.locator('#tpl-summary').getAttribute('data-changed'));
    await page.locator('[data-map-input="CommonLog"]').fill('UartLog');
    await expect(page.locator('#tpl-summary')).not.toHaveAttribute('data-changed', String(before));
    await expect(page.locator('#tpl-preview')).toContainText('UartLog');
  });

  test('系統の置換で決まった名前も対応表で上書きできる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, GPIO);
    await openTemplate(page);
    await page.locator('#tpl-from').fill('Gpio');
    await page.locator('#tpl-to').fill('Uart');
    await page.locator('[data-map-input="GpioHal"]').fill('Uart_HalPort');
    await page.locator('[data-map-input="IGpio"]').fill('IUart');
    await page.locator('[data-map-input="CommonLog"]').fill('UartLog');
    await page.locator('#btn-tpl-create').click();

    const out = await editorText(page);
    expect(out).toContain('as Uart_HalPort');
    expect(out).not.toContain('UartHal');
  });

  test('⧉ 取り込み + ⇄ 一括置換 の 2 操作が 1 画面に収まる (クリック 10 以下・キー 50 以下)', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, GPIO);
    let clicks = 0, keys = 0;

    await page.locator('#btn-tab-template').click(); clicks++;
    await expect(page.locator('#tpl-source')).toBeVisible();
    await page.locator('#tpl-from').click(); clicks++;
    await page.locator('#tpl-from').fill('Gpio'); keys += 'Gpio'.length;
    await page.locator('#tpl-to').click(); clicks++;
    await page.locator('#tpl-to').fill('Uart'); keys += 'Uart'.length;
    await page.locator('[data-map-input="IGpio"]').click(); clicks++;
    await page.locator('[data-map-input="IGpio"]').fill('IUart'); keys += 'IUart'.length;
    await page.locator('[data-map-input="CommonLog"]').click(); clicks++;
    await page.locator('[data-map-input="CommonLog"]').fill('UartLog'); keys += 'UartLog'.length;
    await page.locator('#btn-tpl-create').click(); clicks++;

    await expect(page.locator('#tab-bar .tab')).toHaveCount(2);
    expect(clicks).toBeLessThan(11);
    expect(keys).toBeLessThan(51);
  });
});
