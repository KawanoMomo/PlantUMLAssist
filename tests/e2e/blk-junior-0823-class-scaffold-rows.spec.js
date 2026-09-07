// @ts-check
// BLK-junior-20260907-0823: 派生クラス図 (親 1 + 子 3 + 子どうしの関連 3) を
// 「⌗ クラス構成をまとめて追加」で作るときの手数。
// 関連の行を最初から 3 行出し、元 / 先はこの構成にある名前からの選択にした。
const { test, expect } = require('@playwright/test');
const { getEditorText } = require('./helpers');

async function openClassDiagram(page) {
  await page.goto('/');
  await page.waitForSelector('#preview-svg', { timeout: 5000 });
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await page.waitForTimeout(500);
}

test.describe('BLK-junior-20260907-0823 クラス構成の一括追加の手数', () => {
  test('関連の行は最初から 3 行あり「＋ 関連を追加」を押さずに済む', async ({ page }) => {
    await openClassDiagram(page);
    await page.locator('#cl-scaffold-open').click();
    await expect(page.locator('#cl-sc-modal')).toBeVisible();
    await expect(page.locator('.cl-sc-row')).toHaveCount(3);
    await expect(page.locator('.cl-sc-rel-row')).toHaveCount(3);
  });

  test('関連の元 / 先は打ち込みではなく選択で、いま作っている名前が出る', async ({ page }) => {
    await openClassDiagram(page);
    await page.locator('#cl-scaffold-open').click();
    await page.locator('#cl-sc-parent').fill('UartDrv');
    await page.locator('#cl-sc-name-0').fill('UartDrvLin');
    await page.waitForTimeout(100);

    // select なので自由入力の余地がない (未定義の相手を作れない)。
    expect(await page.locator('#cl-sc-rfrom-0').evaluate((el) => el.tagName)).toBe('SELECT');
    const opts = await page.locator('#cl-sc-rfrom-0 option').allTextContents();
    expect(opts).toContain('UartDrv');
    expect(opts).toContain('UartDrvLin');
  });

  test('名前を打ち直すと選択肢も追従し、選んだ相手は残る', async ({ page }) => {
    await openClassDiagram(page);
    await page.locator('#cl-scaffold-open').click();
    await page.locator('#cl-sc-parent').fill('UartDrv');
    await page.locator('#cl-sc-name-0').fill('UartDrvLin');
    await page.locator('#cl-sc-name-1').fill('UartDrvSci');
    await page.waitForTimeout(100);
    await page.locator('#cl-sc-rfrom-0').selectOption('UartDrvLin');
    await page.locator('#cl-sc-rto-0').selectOption('UartDrvSci');

    // 3 つ目の名前を後から入れても、選び済みの 2 つはそのまま。
    await page.locator('#cl-sc-name-2').fill('UartDrvDma');
    await page.waitForTimeout(100);
    await expect(page.locator('#cl-sc-rfrom-0')).toHaveValue('UartDrvLin');
    await expect(page.locator('#cl-sc-rto-0')).toHaveValue('UartDrvSci');
    const opts = await page.locator('#cl-sc-rto-0 option').allTextContents();
    expect(opts).toContain('UartDrvDma');
  });

  test('起票者の手順 (親 1・子 3・関連 3) がクリック 10 以下 / キー入力 50 以下で終わる', async ({ page }) => {
    await openClassDiagram(page);

    // 実測: locator.click() の回数と、fill / selectOption で打つ文字数を数える。
    let clicks = 0;
    let keys = 0;
    const click = async (sel) => { clicks++; await page.locator(sel).click(); };
    const fill = async (sel, v) => { clicks++; keys += v.length; await page.locator(sel).fill(v); };
    const pick = async (sel, v) => { clicks++; await page.locator(sel).selectOption(v); };

    await click('#cl-scaffold-open');
    // 開いた直後は親クラス名にフォーカスが載っているので、そこへ置きに行く
    // クリックは要らない (打つだけ)。
    await expect(page.locator('#cl-sc-parent')).toBeFocused();
    keys += 'UartDrv'.length;
    await page.keyboard.type('UartDrv');
    await fill('#cl-sc-pmembers', '+init()');
    await fill('#cl-sc-name-0', 'UartDrvLin');
    await fill('#cl-sc-name-1', 'UartDrvSci');
    await fill('#cl-sc-name-2', 'UartDrvDma');
    await page.waitForTimeout(150);
    await pick('#cl-sc-rfrom-0', 'UartDrvLin');
    await pick('#cl-sc-rto-0', 'UartDrvSci');
    await pick('#cl-sc-rfrom-1', 'UartDrvSci');
    await pick('#cl-sc-rto-1', 'UartDrvDma');
    await click('#cl-sc-confirm');
    await page.waitForTimeout(300);

    const t = await getEditorText(page);
    expect(t).toContain('UartDrv <|-- UartDrvLin');
    expect(t).toContain('UartDrv <|-- UartDrvSci');
    expect(t).toContain('UartDrv <|-- UartDrvDma');
    expect(t).toContain('UartDrvLin -- UartDrvSci');
    expect(t).toContain('UartDrvSci -- UartDrvDma');

    expect(clicks).toBeLessThanOrEqual(10);
    expect(keys).toBeLessThanOrEqual(50);
  });
});
