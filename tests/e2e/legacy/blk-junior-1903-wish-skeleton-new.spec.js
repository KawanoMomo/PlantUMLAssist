// @ts-check
// BLK-junior-20260907-1903-wish: 同じ骨格のコンポーネント図 (本体 1 + 周辺 3 +
// 依存 6 本) を題材ごとにゼロから組み直していた。同じ図種の図を土台に選び、
// 題材名を 1 か所打つだけで骨格ごと新しい図になることを確かめる。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const GPIO = [
  '@startuml',
  'title GPIO ドライバ構成',
  'component "GpioDrv" as GpioDrv',
  'component "Reg_Access" as Reg_Access',
  'component "Clock_Ctrl" as Clock_Ctrl',
  'component "Irq_Ctrl" as Irq_Ctrl',
  'GpioDrv ..> Reg_Access',
  'GpioDrv ..> Clock_Ctrl',
  'GpioDrv ..> Irq_Ctrl',
  'Reg_Access ..> Clock_Ctrl',
  'Clock_Ctrl ..> Irq_Ctrl',
  'Irq_Ctrl ..> GpioDrv : notify',
  '@enduml',
].join('\n');

async function setType(page, type) {
  await page.evaluate((t) => {
    const sel = /** @type {HTMLSelectElement} */ (document.getElementById('diagram-type'));
    sel.value = t;
    sel.dispatchEvent(new Event('change'));
  }, type);
  await page.waitForTimeout(300);
}

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(350);
}

async function openSkeleton(page) {
  // BLK-owner-20260924-2337-prune: 入口は「既存の図や雛形から新しい図を起こす…」1 つ。窓の上端で「組み込みの骨格」を選ぶ。
  await page.locator('#btn-tab-template').click();
  await expect(page.locator('#tpl-modal')).toBeVisible();
  await page.locator('#tpl-kinds .tpl-kind[data-kind="skeleton"]').click();
}

test.describe('BLK-junior-1903-wish 骨格から新規作成', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
    await gotoApp(page);
    await setType(page, 'plantuml-component');
    await setDsl(page, GPIO);
  });

  test('タブバーに入口があり、土台の候補に今の図と骨格の大きさが出る', async ({ page }) => {
    await openSkeleton(page);
    const opt = page.locator('#skel-source option').first();
    await expect(opt).toContainText('中心 Gpio');
    await expect(opt).toContainText('要素 4・関係 6');
  });

  test('題材名を 1 か所入れるだけで、何行がどう変わるかが出る', async ({ page }) => {
    await openSkeleton(page);
    await expect(page.locator('#btn-skel-create')).toBeDisabled();
    await page.locator('#skel-subject').fill('Can');
    await expect(page.locator('#skel-summary')).toHaveAttribute('data-ok', '1');
    await expect(page.locator('#skel-summary')).toContainText('Gpio → Can');
    await expect(page.locator('#btn-skel-create')).toBeEnabled();
  });

  test('作ると骨格そのままの図が新しいタブに出来る', async ({ page }) => {
    await openSkeleton(page);
    await page.locator('#skel-subject').fill('Can');
    await page.locator('#btn-skel-create').click();
    await expect(page.locator('#tpl-modal')).toBeHidden();

    const text = await page.locator('#editor').inputValue();
    expect(text).toContain('component "CanDrv" as CanDrv');
    expect(text).toContain('title CAN ドライバ構成');
    expect(text).toContain('Irq_Ctrl ..> CanDrv : notify');
    expect(text).toContain('Reg_Access');
    expect(text).not.toContain('Gpio');
    // 骨格 (行数) は土台のまま。要素を 1 件ずつ足し直していない。
    expect(text.split('\n').length).toBe(GPIO.split('\n').length);
  });

  test('新しいタブの名前も土台の名前から決まる (打つのは題材名だけ)', async ({ page }) => {
    await page.evaluate(() => { window.MA.workspace.rename(window.MA.workspace.getActiveId(), 'gpio-component'); });
    await openSkeleton(page);
    await page.locator('#skel-subject').fill('Can');
    await page.locator('#btn-skel-create').click();
    await expect(page.locator('#tab-bar')).toContainText('can-component');
  });

  test('土台と同じ題材名では作らせない', async ({ page }) => {
    await openSkeleton(page);
    await page.locator('#skel-subject').fill('Gpio');
    await expect(page.locator('#skel-summary')).toHaveAttribute('data-ok', '0');
    await expect(page.locator('#btn-skel-create')).toBeDisabled();
  });
});
