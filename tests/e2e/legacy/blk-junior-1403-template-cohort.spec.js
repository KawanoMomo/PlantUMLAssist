// @ts-check
// BLK-junior-20260908-1403: 台本の手順 2「後で作った方にだけある要素を見つける」は、
// UART 版と CAN 版の 2 枚比べだと「片方にだけある要素は無い」で行き止まりになる。
// ⇔ 並べて見る の「🧩 系統ぜんぶと比べる」で、開いている図をまとめて突き合わせ、
// 1 枚にだけある行 (取り込み候補) が出ること / 無いなら無いと言い切ることを実機で見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor, openCompareTabs } = require('../helpers');

const DIR = saveDirFor(__filename);

const GPIO = [
  '@startuml',
  'start',
  ':GPIOクロックを有効化;',
  ':GPIO_Configureを呼ぶ;',
  ':GPIO割込みを有効化;',
  'stop',
  '@enduml',
].join('\n');

const UART = GPIO.split('GPIO').join('UART');
const CAN = GPIO.split('GPIO').join('CAN');
// 後発版にだけある行を 1 本足した CAN 版。
const CAN_PLUS = CAN.replace(':CAN割込みを有効化;',
  ':CAN割込みを有効化;\n:CANビットレートを設定;');

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(1200);
}

// 自動保存の書き込み先をこの spec 専用にする (成果物リポジトリ直下を汚さない)。
async function setSaveDir(page) {
  await page.evaluate((dir) => {
    window.MA.autoSave.setConfig({
      enabled: true, debounceMs: 500, restoreMode: 'none', backend: 'file', fileDir: dir,
    });
  }, DIR);
}

// 図を 3 枚 (GPIO / UART / CAN) 開き、最後の 1 枚を編集中にして比較ペインを開く。
async function openCohort(page, canDsl) {
  await gotoApp(page);
  await setSaveDir(page);
  await page.evaluate(() => {
    window.MA.workspace.rename(window.MA.workspace.getActiveId(), 'gpio');
  });
  await typeDsl(page, GPIO);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.MA.workspace.rename(window.MA.workspace.getActiveId(), 'uart');
  });
  await typeDsl(page, UART);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.MA.workspace.rename(window.MA.workspace.getActiveId(), 'can');
  });
  await typeDsl(page, canDsl);
  await openCompareTabs(page);
  await expect(page.locator('#compare-pane')).toBeVisible();
}

test.describe('系統ぜんぶと比べる (BLK-junior-20260908-1403)', () => {

  test('後で作った方にだけある行が「1 枚だけ」で出て、取り込む対象だと分かる', async ({ page }) => {
    await openCohort(page, CAN_PLUS);
    await page.locator('#btn-tc-run').click();
    await expect(page.locator('#tc-list')).toBeVisible();

    const only = page.locator('.tc-row[data-tc-kind="only"]');
    await expect(only).toHaveCount(1);
    await expect(only.first()).toContainText(':CANビットレートを設定;');
    await expect(only.first()).toContainText('can');
    await expect(page.locator('#tc-verdict')).toContainText('取り込む対象');
    await expect(page.locator('#tcoh-summary')).toContainText('1 枚にだけある行 1');
  });

  test('固有の行が無い 3 枚は「同じ雛形の複製」と言い切る', async ({ page }) => {
    await openCohort(page, CAN);
    await page.locator('#btn-tc-run').click();
    await expect(page.locator('#tc-list')).toBeVisible();

    await expect(page.locator('.tc-row[data-tc-kind="only"]')).toHaveCount(0);
    await expect(page.locator('#tcoh-summary')).toContainText('3 枚は同じ雛形の複製です');
    await expect(page.locator('#tc-verdict')).toContainText('取り込む対象はありません');
  });

  test('共通の行はどの図にあるかを「3 枚すべて」と出し、題材語も言う', async ({ page }) => {
    await openCohort(page, CAN);
    await page.locator('#btn-tc-run').click();
    await expect(page.locator('#tc-list')).toBeVisible();

    const all = page.locator('.tc-row[data-tc-kind="all"]').first();
    await expect(all).toContainText('3 枚すべて');
    await expect(page.locator('#tc-note')).toContainText('題材語');
    await expect(page.locator('#tc-note')).toContainText('can: CAN');
  });

  test('一部の図にしかない行は欠けている図を名指しする', async ({ page }) => {
    const uartPlus = UART.replace(':UART割込みを有効化;',
      ':UART割込みを有効化;\n:統計を記録;');
    await gotoApp(page);
    await setSaveDir(page);
    await page.evaluate(() => {
      window.MA.workspace.rename(window.MA.workspace.getActiveId(), 'gpio');
    });
    await typeDsl(page, GPIO);
    await page.locator('#btn-tab-new').click();
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.MA.workspace.rename(window.MA.workspace.getActiveId(), 'uart');
    });
    await typeDsl(page, uartPlus);
    await page.locator('#btn-tab-new').click();
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.MA.workspace.rename(window.MA.workspace.getActiveId(), 'can');
    });
    await typeDsl(page, CAN.replace(':CAN割込みを有効化;', ':CAN割込みを有効化;\n:統計を記録;'));
    await openCompareTabs(page);
    await page.locator('#btn-tc-run').click();
    await expect(page.locator('#tc-list')).toBeVisible();

    const some = page.locator('.tc-row[data-tc-kind="some"]');
    await expect(some).toHaveCount(1);
    await expect(some.first()).toContainText('無: gpio');
  });

  test('図が 1 枚しかなければ、比べられないことをその場で言う', async ({ page }) => {
    await gotoApp(page);
    await setSaveDir(page);
    await typeDsl(page, CAN);
    await openCompareTabs(page);
    await page.locator('#btn-tc-run').click();
    await expect(page.locator('#tcoh-summary')).toContainText('1 枚しかありません');
    await expect(page.locator('#tc-empty')).toBeVisible();
  });

});
