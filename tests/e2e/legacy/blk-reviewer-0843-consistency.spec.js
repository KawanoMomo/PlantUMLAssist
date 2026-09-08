// @ts-check
// BLK-reviewer-20260907-0843: 整合性チェックのパネルを常時出す。
// 命名規約の逸脱・未使用 participant・メソッド不一致・粒度不一致を 1 本の
// 一覧にし、ステータスバーの件数を見るだけで手順 2〜4.9 が済むことを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const CLS = '@startuml\nclass Adc_Driver {\n  + read(ch) : int\n  + start() : void\n}\nclass Can_Driver\n@enduml';
const SEQ = '@startuml\nparticipant Drv\nparticipant Adc_Driver\nparticipant GpioDrv\n'
  + 'Drv -> Adc_Driver : read\nDrv -> Adc_Driver : stop\n@enduml';
const CLEAN = '@startuml\nparticipant A\nparticipant B\nA -> B : go\n@enduml';

async function freshWorkspace(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'localStorage', fileDir: './autosave' }));
    } catch (e) {}
  });
}

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(200);
}

async function renameActive(page, name) {
  await page.evaluate((n) => {
    const ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), n);
  }, name);
}

async function setupTwoDocs(page) {
  await gotoApp(page);
  await typeDsl(page, CLS);
  await renameActive(page, 'Model_Class');
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, SEQ);
  await renameActive(page, 'Model_Seq');
}

test.describe('BLK-reviewer-0843 整合性チェック', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('ステータスバーに警告件数が常時出て、内訳が title に入る', async ({ page }) => {
    await setupTwoDocs(page);
    const badge = page.locator('#status-consistency');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('⚠ 3');
    await expect(badge).toHaveClass(/has-warning/);
    await expect(badge).toHaveAttribute('title', /命名 1 .* 未使用 1 .* メソッド 1/);
  });

  test('逸脱の無い図では「整合 OK」と言い切る', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, CLEAN);
    const badge = page.locator('#status-consistency');
    await expect(badge).toHaveText('整合 OK');
    await expect(badge).not.toHaveClass(/has-warning/);
  });

  test('バッジを押すと 4 種の警告が 1 つのパネルに並ぶ', async ({ page }) => {
    await setupTwoDocs(page);
    await page.locator('#status-consistency').click();
    await expect(page.locator('#ck-modal')).toBeVisible();
    const sum = page.locator('#ck-summary');
    await expect(sum).toHaveAttribute('data-count', '3');
    await expect(sum).toHaveAttribute('data-naming', '1');
    await expect(sum).toHaveAttribute('data-unused', '1');
    await expect(sum).toHaveAttribute('data-methods', '1');
    // 命名規約: GpioDrv は多数派の _Driver から外れている
    await expect(page.locator('#ck-naming')).toContainText('GpioDrv');
    await expect(page.locator('#ck-naming')).toContainText('driver');
    // 未使用: 宣言だけで矢印に出てこない GpioDrv
    await expect(page.locator('#ck-unused')).toContainText('GpioDrv');
    // メソッド不一致: Adc_Driver に stop は無い
    await expect(page.locator('#ck-methods')).toContainText('Adc_Driver.stop');
  });

  test('警告が消えるとバッジも一覧も追随する', async ({ page }) => {
    await setupTwoDocs(page);
    await expect(page.locator('#status-consistency')).toHaveText('⚠ 3');
    // stop を read に直し、GpioDrv を Gpio_Driver に改めて矢印にも出す
    await typeDsl(page, '@startuml\nparticipant Drv\nparticipant Adc_Driver\nparticipant Gpio_Driver\n'
      + 'Drv -> Adc_Driver : read\nDrv -> Gpio_Driver : read\n@enduml');
    await expect(page.locator('#status-consistency')).toHaveText('整合 OK');
    await page.locator('#status-consistency').click();
    await expect(page.locator('#ck-naming-none')).toBeVisible();
    await expect(page.locator('#ck-methods-none')).toBeVisible();
    await expect(page.locator('#ck-unused-none')).toBeVisible();
  });

  test('コマンドパレットからも開ける', async ({ page }) => {
    await setupTwoDocs(page);
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('整合性');
    await page.keyboard.press('Enter');
    await expect(page.locator('#ck-modal')).toBeVisible();
  });
});
