// @ts-check
// BLK-junior-20260906-2343(追記): CanDrv 中心の CAN コンポーネント図(コンポーネント 4 つ・
// 依存関係 6 本)を新規作成する。1 要素ずつの「末尾に追加」だと 30 手を超え、DSL 直書きに
// 逃げていた。種類=一括 のテキスト欄で、入力 1 回 + クリック 1 回で 10 行入ることを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const CAN_BULK = [
  'CanDrv',
  'CanIf',
  'PduR',
  'Com',
  'CanDrv -- CanIf',
  'CanIf -- PduR',
  'PduR -- Com',
  'CanDrv ..> CanIf : 送信要求',
  'PduR ..> CanIf',
  'Com ..> PduR',
].join('\n');

async function newComponent(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-component');
  await page.waitForTimeout(500);
  await expect(page.locator('#co-tail-kind')).toBeVisible();
  await page.locator('#co-tail-kind').selectOption('bulk');
  await expect(page.locator('#co-tail-bulk')).toBeVisible();
}

test.describe('BLK-junior-2343 コンポーネントと関係の一括末尾追加', () => {
  test('4 コンポーネント + 6 関係が 1 回の確定でまとめて入る', async ({ page }) => {
    await newComponent(page);
    await page.locator('#co-tail-bulk').fill(CAN_BULK);
    await page.locator('#co-tail-add').click();
    await expect
      .poll(async () => await getEditorText(page))
      .toContain([
        'component CanDrv',
        'component CanIf',
        'component PduR',
        'component Com',
        'CanDrv -- CanIf',
        'CanIf -- PduR',
        'PduR -- Com',
        'CanDrv ..> CanIf : 送信要求',
        'PduR ..> CanIf',
        'Com ..> PduR',
      ].join('\n'));
  });

  test('interface 行と provides 関係も同じ一括入力で入る', async ({ page }) => {
    await newComponent(page);
    await page.locator('#co-tail-bulk').fill('CanDrv\ninterface ICan : CAN 送受信\nCanDrv -() ICan');
    await page.locator('#co-tail-add').click();
    await expect.poll(async () => await getEditorText(page)).toContain('interface "CAN 送受信" as ICan');
    expect(await getEditorText(page)).toContain('CanDrv -() ICan');
  });

  test('宣言は関係より前に並ぶ', async ({ page }) => {
    await newComponent(page);
    await page.locator('#co-tail-bulk').fill('A -- B\nA\nB');
    await page.locator('#co-tail-add').click();
    await expect.poll(async () => await getEditorText(page)).toContain('A -- B');
    const t = await getEditorText(page);
    expect(t.indexOf('component A')).toBeLessThan(t.indexOf('A -- B'));
    expect(t.indexOf('component B')).toBeLessThan(t.indexOf('A -- B'));
  });

  test('undo で一括追加した行がまとめて消える', async ({ page }) => {
    await newComponent(page);
    const before = await getEditorText(page);
    await page.locator('#co-tail-bulk').fill(CAN_BULK);
    await page.locator('#co-tail-add').click();
    await expect.poll(async () => await getEditorText(page)).toContain('Com ..> PduR');
    await page.locator('#editor').press('Control+z');
    await expect.poll(async () => await getEditorText(page)).toBe(before);
  });

  test('一括追加した要素は SVG 上に描画される', async ({ page }) => {
    await newComponent(page);
    await page.locator('#co-tail-bulk').fill('CanDrv\nCanIf\nCanDrv -- CanIf');
    await page.locator('#co-tail-add').click();
    await expect
      .poll(async () => await page.locator('#preview-svg').innerHTML(), { timeout: 20000 })
      .toContain('CanDrv');
  });
});
