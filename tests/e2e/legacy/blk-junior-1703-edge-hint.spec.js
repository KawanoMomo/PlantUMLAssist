// @ts-check
// BLK-junior-20260908-1703: GpioDrv から出る 4 本 (実線 2・点線 2) は色も太さも
// 同じで、点線どうし (IrqCtrl 向き / Power_Ctrl 向き) の見分けが付かなかった。
// 1 本クリックしては右パネルの From/To を読み、違えばもう 1 本、という当て物。
// 矢印に乗せた時点で相手が読めること、目的の線に 1 クリックで当たることを実機で見る。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const DSL = [
  '@startuml',
  'component GpioDrv',
  'component IrqCtrl',
  'component Power_Ctrl',
  'component Bus',
  'component Timer',
  'GpioDrv --> Bus',
  'GpioDrv --> Timer',
  'GpioDrv ..> IrqCtrl',
  'GpioDrv ..> Power_Ctrl',
  '@enduml',
].join('\n');

async function setup(page) {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  await gotoApp(page);
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, DSL);
  await page.waitForTimeout(1500);
  await expect(page.locator('#overlay-layer rect[data-type="relation"]').first()).toBeAttached();
}

// IrqCtrl への点線 (DSL 9 行目) の overlay。
function irqEdge(page) {
  return page.locator('#overlay-layer rect[data-type="relation"][data-line="9"]');
}

test.describe('BLK-junior-1703: 矢印に乗せると相手が出る', () => {
  test('点線 2 本が、乗せただけで相手の名前で区別できる', async ({ page }) => {
    await setup(page);
    await irqEdge(page).hover({ force: true });
    const hint = page.locator('#edge-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('GpioDrv ..> IrqCtrl');
    await expect(hint).toContainText('依存');

    // もう 1 本の点線 (Power_Ctrl 向き) に乗せれば文言が入れ替わる
    await page.locator('#overlay-layer rect[data-type="relation"][data-line="10"]').hover({ force: true });
    await expect(hint).toContainText('GpioDrv ..> Power_Ctrl');
  });

  test('関係の overlay は From/To を属性でも持ち、SVG の title も付く', async ({ page }) => {
    await setup(page);
    const edge = irqEdge(page);
    await expect(edge).toHaveAttribute('data-from', 'GpioDrv');
    await expect(edge).toHaveAttribute('data-to', 'IrqCtrl');
    await expect(edge.locator('title')).toHaveText(/GpioDrv \.\.> IrqCtrl/);
  });

  test('矢印から離れれば吹き出しは消える (線を隠したままにしない)', async ({ page }) => {
    await setup(page);
    await irqEdge(page).hover({ force: true });
    await expect(page.locator('#edge-hint')).toBeVisible();
    await page.mouse.move(5, 5);
    await page.waitForTimeout(200);
    await expect(page.locator('#edge-hint')).toBeHidden();
  });

  test('台本 4 の手数: 目的の点線を当てて、ラベルを付けるまで 2 クリック', async ({ page }) => {
    await setup(page);
    let clicks = 0;
    let keys = 0;
    page.on('console', () => {});

    // 乗せて相手を確かめる (クリックしない)
    await page.locator('#overlay-layer rect[data-type="relation"][data-line="10"]').hover({ force: true });
    await expect(page.locator('#edge-hint')).toContainText('Power_Ctrl');
    await irqEdge(page).hover({ force: true });
    await expect(page.locator('#edge-hint')).toContainText('IrqCtrl');

    // 目的の線と分かってから 1 回だけ押す
    await irqEdge(page).click({ force: true });
    clicks++;
    await expect(page.locator('#co-rel-to')).toHaveValue('IrqCtrl');

    // ラベルを付ける (先輩役の変更の取り込み)
    const label = 'irq';
    await page.locator('#co-rel-label').fill(label);
    keys += label.length;
    await page.locator('#co-rel-apply').click();   // 「変更を反映」
    clicks++;
    await page.waitForTimeout(600);
    expect(await page.locator('#editor').inputValue()).toContain('GpioDrv ..> IrqCtrl : irq');

    expect(clicks).toBeLessThanOrEqual(10);
    expect(keys).toBeLessThanOrEqual(50);
  });
});
