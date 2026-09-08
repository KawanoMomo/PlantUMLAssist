// @ts-check
// BLK-primary-20260907-1703: 横断作業で 14 枚を 1 枚ずつ開くと 28 クリックかかっていた。
// 一覧を開いたまま印を付け、まとめてタブで開けるようにする。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

const DIR = saveDirFor(__filename);

// 横断作業の 14 枚。
const NAMES = [
  'P1703_CanDrv_state', 'P1703_CanDrv_class', 'P1703_CanDrv_seq',
  'P1703_SpiDrv_state', 'P1703_SpiDrv_class', 'P1703_SpiDrv_seq',
  'P1703_UartDrv_state', 'P1703_UartDrv_class', 'P1703_UartDrv_seq',
  'P1703_Gpio_state', 'P1703_Gpio_class', 'P1703_Adc_state',
  'P1703_Adc_class', 'P1703_Pwm_state',
];

const DSL = '@startuml\n[*] --> Idle\nIdle --> Busy\n@enduml';

async function bootWithDir(page) {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
  await gotoApp(page);
}

async function putFile(page, name) {
  await page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl: DSL, dir: DIR });
}

async function clearDir(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

async function openFolder(page) {
  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open .folder-item');
}

test.describe('BLK-primary-1703: 一覧から複数の図をまとめて開く', () => {
  test.beforeEach(async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    for (const n of NAMES) await putFile(page, n);
    await page.waitForTimeout(300);
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
  });

  test('14 枚を「全部選ぶ → 開く」の 3 クリックでタブにできる', async ({ page }) => {
    let clicks = 0;
    page.on('console', () => {});
    const before = await page.locator('#tab-bar .tab').count();

    await page.locator('#btn-tab-folder').click(); clicks++;
    await page.waitForSelector('#folder-panel.open .folder-item');
    // 一覧には編集中の図 (diagram1) も並ぶので、枚数は画面から数える。
    const listed = await page.locator('#folder-panel .folder-item').count();
    expect(listed).toBeGreaterThanOrEqual(NAMES.length);
    await page.locator('#folder-panel .folder-pick-all').click(); clicks++;
    await expect(page.locator('#folder-panel .folder-open-many'))
      .toContainText('選んだ ' + listed + ' 枚を');
    await page.locator('#folder-panel .folder-open-many').click(); clicks++;
    await page.waitForTimeout(2500);

    expect(clicks).toBeLessThanOrEqual(10);
    const after = await page.locator('#tab-bar .tab').count();
    expect(after - before).toBeGreaterThanOrEqual(13);
    for (const n of NAMES) {
      await expect(page.locator('#tab-bar .tab[data-doc-name="' + n + '"]')).toHaveCount(1);
    }
  });

  test('印を付けてもパネルは閉じない (1 枚ごとに開き直さない)', async ({ page }) => {
    await openFolder(page);
    await page.locator('#folder-panel .folder-pick[data-pick-name="P1703_Adc_state"]').click();
    await page.locator('#folder-panel .folder-pick[data-pick-name="P1703_Pwm_state"]').click();
    await expect(page.locator('#folder-panel')).toHaveClass(/open/);
    await expect(page.locator('#folder-panel .folder-open-many')).toHaveText('選んだ 2 枚をタブで開く');
  });

  test('印を付けた図だけが開く', async ({ page }) => {
    await openFolder(page);
    await page.locator('#folder-panel .folder-pick[data-pick-name="P1703_Gpio_class"]').click();
    await page.locator('#folder-panel .folder-open-many').click();
    await page.waitForTimeout(1200);
    await expect(page.locator('#tab-bar .tab[data-doc-name="P1703_Gpio_class"]')).toHaveCount(1);
    await expect(page.locator('#tab-bar .tab[data-doc-name="P1703_Pwm_state"]')).toHaveCount(0);
  });

  test('「全部選ぶ」は 2 度目で全部外れ、開くボタンは押せなくなる', async ({ page }) => {
    await openFolder(page);
    const listed = await page.locator('#folder-panel .folder-item').count();
    const all = page.locator('#folder-panel .folder-pick-all');
    await all.click();
    await expect(all).toHaveText('印を全部外す');
    await all.click();
    await expect(all).toHaveText('全部選ぶ（' + listed + ' 枚）');
    await expect(page.locator('#folder-panel .folder-open-many')).toBeDisabled();
  });

  test('名前を押せば今までどおり 1 枚だけ開く', async ({ page }) => {
    await openFolder(page);
    await page.locator('#folder-panel .folder-item[data-file-name="P1703_Adc_class"]').click();
    await page.waitForTimeout(1200);
    await expect(page.locator('#folder-panel')).not.toHaveClass(/open/);
    await expect(page.locator('#tab-bar .tab[data-doc-name="P1703_Adc_class"]')).toHaveCount(1);
    await expect(page.locator('#tab-bar .tab[data-doc-name="P1703_Gpio_state"]')).toHaveCount(0);
  });
});
