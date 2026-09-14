// @ts-check
// BLK-reviewer-20260908-0103-wish: 22 枚の DSL を「どの図がどの図の相手か」ごと
// 1 プロジェクトとして管理する画面。系統を宣言すると、その組だけを確認すれば済み、
// 対応が崩れたら赤くなる。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const SPI_SEQ = [
  '@startuml',
  'participant Drv',
  'participant Spi',
  'Drv -> Spi : Configure Channel',
  'Drv -> Spi : Enable Clock',
  '@enduml',
].join('\n');

const SPI_STATE_OK = [
  '@startuml',
  '[*] -> Idle',
  'Idle -> Ready : configure_channel',
  'Ready -> Running : enable_clock',
  '@enduml',
].join('\n');

const SPI_STATE_BROKEN = [
  '@startuml',
  '[*] -> Idle',
  'Idle -> Ready : configure_channel',
  'Ready -> Halted : shutdown',
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

// spi_init_sequence と spi_state の 2 枚を開いた状態を作る。
async function twoDrivers(page, stateDsl) {
  // localStorage は毎テスト新しい context なので空。addInitScript で消すと
  // reload のたびに宣言まで消えてしまうので、ここでは消さない。
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-sequence');
  await page.waitForTimeout(300);
  await setDsl(page, SPI_SEQ);
  await page.evaluate(() => {
    const ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), 'spi_init_sequence');
  });
  await page.locator('#btn-tab-new').click();
  await expect(page.locator('#tab-bar .tab')).toHaveCount(2);
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(300);
  await setDsl(page, stateDsl);
  await page.evaluate(() => {
    const ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), 'spi_state');
  });
  await page.waitForTimeout(300);
}

test.describe('BLK-reviewer-20260908-0103-wish: 系統マップ', () => {
  test('タブ列に 🧩 系統マップ があり、押すと画面が開く', async ({ page }) => {
    await twoDrivers(page, SPI_STATE_OK);
    await expect(page.locator('#btn-tab-drivermap')).toBeVisible();
    await page.locator('#btn-tab-drivermap').click();
    await expect(page.locator('#dm-modal')).toBeVisible();
    await expect(page.locator('#dm-summary')).toContainText('宣言されていません');
  });

  test('「宣言を作り直す」で開いている図から系統が宣言される', async ({ page }) => {
    await twoDrivers(page, SPI_STATE_OK);
    await page.locator('#btn-tab-drivermap').click();
    await page.locator('#dm-rebuild').click();
    await page.waitForTimeout(300);

    await expect(page.locator('.dm-family')).toHaveCount(1);
    await expect(page.locator('.dm-family')).toContainText('SPI');
    await expect(page.locator('.dm-member')).toHaveCount(2);
    await expect(page.locator('#dm-summary')).toContainText('揃っています');
    await expect(page.locator('.dm-family.red')).toHaveCount(0);
  });

  test('対応が崩れている系統は赤くなり、どの図に無い動作名かを出す', async ({ page }) => {
    await twoDrivers(page, SPI_STATE_BROKEN);
    await page.locator('#btn-tab-drivermap').click();
    await page.locator('#dm-rebuild').click();
    await page.waitForTimeout(300);

    await expect(page.locator('.dm-family.red')).toHaveCount(1);
    await expect(page.locator('#dm-summary')).toContainText('対応が崩れています');
    const rows = page.locator('.dm-row');
    await expect(rows).toHaveCount(2);
    await expect(page.locator('#dm-families')).toContainText('Enable Clock');
    await expect(page.locator('#dm-families')).toContainText('spi_state に無し');
  });

  test('赤い行を押すと、その図のその行へ移る', async ({ page }) => {
    await twoDrivers(page, SPI_STATE_BROKEN);
    await page.locator('#btn-tab-drivermap').click();
    await page.locator('#dm-rebuild').click();
    await page.waitForTimeout(300);
    await page.locator('.dm-row', { hasText: 'Enable Clock' }).click();
    await page.waitForTimeout(500);

    await expect(page.locator('#dm-modal')).toBeHidden();
    await expect(page.locator('#tab-bar .tab.active')).toContainText('spi_init_sequence');
    const sel = await page.evaluate(() => {
      const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      return ed.value.slice(ed.selectionStart, ed.selectionEnd);
    });
    expect(sel).toContain('Enable Clock');
  });

  test('「⇔ 相手を並べる」で宣言された相手が右に並ぶ', async ({ page }) => {
    await twoDrivers(page, SPI_STATE_OK);
    await page.locator('#btn-tab-drivermap').click();
    await page.locator('#dm-rebuild').click();
    await page.waitForTimeout(300);
    await page.locator('.dm-pair').first().click();
    await page.waitForTimeout(800);

    await expect(page.locator('#compare-pane')).toBeVisible();
    await expect(page.locator('#tab-bar .tab.active')).toContainText('spi_init_sequence');
    const ref = await page.locator('#compare-select').inputValue();
    const stateId = await page.evaluate(() => {
      const d = window.MA.workspace.findByName('spi_state');
      return d ? String(d.id) : '';
    });
    expect(ref).toBe(stateId);
  });

  test('宣言は開き直しても残り、崩れている数がタブのボタンに出る', async ({ page }) => {
    await twoDrivers(page, SPI_STATE_BROKEN);
    await page.locator('#btn-tab-drivermap').click();
    await page.locator('#dm-rebuild').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#btn-tab-drivermap')).toHaveText(/系統マップ 1/);
    await expect(page.locator('#btn-tab-drivermap')).toHaveClass(/has-red/);

    await page.reload();
    await page.waitForSelector('#preview-svg');
    await page.waitForTimeout(1200);
    await page.locator('#btn-tab-drivermap').click();
    await expect(page.locator('.dm-family')).toHaveCount(1);
    await expect(page.locator('.dm-member')).toHaveCount(2);
  });

  test('「宣言を消す」で空に戻る', async ({ page }) => {
    await twoDrivers(page, SPI_STATE_OK);
    await page.locator('#btn-tab-drivermap').click();
    await page.locator('#dm-rebuild').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.dm-family')).toHaveCount(1);
    await page.locator('#dm-clear').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.dm-family')).toHaveCount(0);
    await expect(page.locator('#dm-summary')).toContainText('宣言されていません');
  });
});
