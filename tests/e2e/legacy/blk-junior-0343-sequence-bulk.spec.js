// @ts-check
// BLK-junior-20260907-0343: GPIO ドライバ初期化のシーケンス図(actor 1・participant 4・
// message 6)を新規作成する。1 件ずつの挿入フォームだと 11 件で手数が 10 を大きく超え、
// DSL 直書きに逃げていた。種類=一括 のテキスト欄で、入力 1 回 + クリック 1 回で
// 11 件入ることを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

const GPIO_BULK = [
  'actor Dev',
  'participant "GPIO ドライバ" as GpioDrv',
  'participant Port',
  'participant Pin',
  'participant Hal',
  'Dev -> GpioDrv : Gpio_Init()',
  'GpioDrv -> Port : Port_Config()',
  'Port --> GpioDrv : E_OK',
  'GpioDrv -> Pin : Pin_SetMode()',
  'Pin --> GpioDrv : E_OK',
  'GpioDrv --> Dev : E_OK',
].join('\n');

async function newSequence(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-sequence');
  await page.waitForTimeout(500);
  await expect(page.locator('#seq-tail-kind')).toBeVisible();
  await page.locator('#seq-tail-kind').selectOption('bulk');
  await expect(page.locator('#seq-tail-bulk')).toBeVisible();
}

test.describe('BLK-junior-0343 シーケンス図の一括末尾追加', () => {
  test('actor 1 + participant 4 + message 6 が 1 回の確定でまとめて入る', async ({ page }) => {
    await newSequence(page);
    await page.locator('#seq-tail-bulk').fill(GPIO_BULK);
    await page.locator('#seq-tail-add').click();
    await expect.poll(async () => await getEditorText(page)).toContain('actor Dev');
    const out = await getEditorText(page);
    for (const line of [
      'participant "GPIO ドライバ" as GpioDrv',
      'participant Port',
      'participant Pin',
      'participant Hal',
      'Dev -> GpioDrv : Gpio_Init()',
      'GpioDrv -> Port : Port_Config()',
      'Port --> GpioDrv : E_OK',
      'GpioDrv -> Pin : Pin_SetMode()',
      'GpioDrv --> Dev : E_OK',
    ]) {
      expect(out).toContain(line);
    }
  });

  test('確定 1 回は history 1 件なので Ctrl+Z 1 手で全部戻る', async ({ page }) => {
    await newSequence(page);
    const before = await getEditorText(page);
    await page.locator('#seq-tail-bulk').fill(GPIO_BULK);
    await page.locator('#seq-tail-add').click();
    await expect.poll(async () => await getEditorText(page)).toContain('participant Hal');
    await page.locator('#editor').press('Control+z');
    await expect.poll(async () => await getEditorText(page)).toBe(before);
  });
});
