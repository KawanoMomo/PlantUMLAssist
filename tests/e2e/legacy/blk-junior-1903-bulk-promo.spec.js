// @ts-check
// BLK-junior-20260907-1903: コンポーネント図 (4 部品 + 依存 6 本) を作るのに
// 「末尾に追加」の種類プルダウンで Component → Relation を 1 件ずつ選び直し、
// 10 回繰り返した。あとで「一括 (複数行)」が同じ並びの最後にあると気付いた。
// 種別の列とは別に「まとめて入れる」呼び込みを常に出し、どの種別を選んでいても
// 1 クリックで一括欄に入れることを確かめる。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

// 先輩の図 (GPIO 版)。骨格は Drv 本体 + Reg_Access / Clock_Ctrl / Irq_Ctrl の 4 部品。
const GPIO_CMP = [
  '@startuml',
  'title GPIO Driver',
  'component GpioDrv',
  'component Reg_Access',
  'component Clock_Ctrl',
  'component Irq_Ctrl',
  'GpioDrv ..> Reg_Access',
  'GpioDrv ..> Clock_Ctrl',
  'GpioDrv ..> Irq_Ctrl',
  'Reg_Access ..> Clock_Ctrl',
  'Irq_Ctrl ..> Reg_Access',
  'Clock_Ctrl ..> Irq_Ctrl : notify',
  '@enduml',
].join('\n');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(400);
}

async function componentPane(page) {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-component');
  await page.waitForTimeout(400);
  await setDsl(page, GPIO_CMP);
  await page.locator('#btn-tab-new').click();
  await expect(page.locator('#tab-bar .tab')).toHaveCount(2);
  await page.locator('#diagram-type').selectOption('plantuml-component');
  await page.waitForTimeout(400);
  await setDsl(page, '@startuml\n@enduml');
  await expect(page.locator('#co-tail-kind')).toBeVisible();
}

test.describe('BLK-junior-1903 一括入力の呼び込み', () => {
  test('既定の Component 選択のまま「まとめて入れる」が見えている', async ({ page }) => {
    await componentPane(page);
    await expect(page.locator('#co-tail-kind')).toHaveValue('component');
    const promo = page.locator('#co-tail-kind-bulk-promo');
    await expect(promo).toBeVisible();
    await expect(promo).toContainText('まとめて入れる');
    await expect(promo).toContainText('1 行 1 件');
    // 種別チップの列より上に出る。
    await expect(page.locator('#co-tail-kind-bulk-promo + #co-tail-kind-chips')).toHaveCount(1);
  });

  test('1 クリックで一括欄が開き、呼び込みは「選択中」になる', async ({ page }) => {
    await componentPane(page);
    await page.locator('#co-tail-kind-bulk-promo').click();
    await expect(page.locator('#co-tail-bulk')).toBeVisible();
    await expect(page.locator('#co-tail-kind')).toHaveValue('bulk');
    await expect(page.locator('#co-tail-kind-bulk-promo')).toContainText('選択中');
  });

  test('Relation など別の種別を選んでいても呼び込みは残る', async ({ page }) => {
    await componentPane(page);
    await page.locator('#co-tail-kind').selectOption('relation');
    await expect(page.locator('#co-tail-rkind')).toBeVisible();
    const promo = page.locator('#co-tail-kind-bulk-promo');
    await expect(promo).toBeVisible();
    await expect(promo).not.toContainText('選択中');
    await promo.click();
    await expect(page.locator('#co-tail-bulk')).toBeVisible();
  });

  test('他の図種 (Sequence) でも同じ呼び込みが出る', async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-sequence');
    await page.waitForTimeout(400);
    await setDsl(page, '@startuml\n@enduml');
    await expect(page.locator('#seq-tail-kind-bulk-promo')).toBeVisible();
    await page.locator('#seq-tail-kind-bulk-promo').click();
    await expect(page.locator('#seq-tail-bulk')).toBeVisible();
  });

  test('実測 — 手順3 の骨格 (4 部品 + 6 依存) をクリック 10 以下・キー 50 以下で入れる', async ({ page }) => {
    await componentPane(page);
    let clicks = 0, keys = 0;
    const click = async (sel) => { clicks++; await page.locator(sel).click(); };
    const type = async (sel, s) => { keys += s.length; await page.locator(sel).fill(s); };

    // 1. まとめて入れる (種別の並びを読み下さない)
    await click('#co-tail-kind-bulk-promo');
    await expect(page.locator('#co-tail-bulk')).toBeVisible();

    // 2. 先輩の GPIO 図から骨格の行を取り込む (打鍵 0)
    await click('#co-tail-reuse');
    await expect(page.locator('#reuse-modal')).toBeVisible();
    await click('#reuse-all');
    await click('#reuse-confirm');
    await expect(page.locator('#reuse-modal')).toBeHidden();

    // 3. まとめて末尾に追加 (プルダウンの往復 10 回はここで無くなる)
    await click('#co-tail-add');
    await page.waitForTimeout(400);

    // 4. 中心コンポーネント名だけを CAN 版に直す (この図だけ・既定)
    await click('#btn-tab-rename');
    await type('#rename-from', 'GpioDrv');
    await type('#rename-to', 'CanDrv');
    await click('#btn-rename-apply');
    await page.waitForTimeout(400);

    const dsl = await getEditorText(page);
    expect(dsl).toContain('component CanDrv');
    expect(dsl).toContain('component Reg_Access');
    expect(dsl).toContain('component Clock_Ctrl');
    expect(dsl).toContain('component Irq_Ctrl');
    expect(dsl).toContain('CanDrv ..> Reg_Access');
    expect(dsl).toContain('Clock_Ctrl ..> Irq_Ctrl : notify');
    expect(dsl).not.toContain('GpioDrv');

    console.log('MEASURE clicks=' + clicks + ' keys=' + keys);
    expect(clicks).toBeLessThanOrEqual(10);
    expect(keys).toBeLessThanOrEqual(50);
  });
});
