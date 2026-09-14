// @ts-check
// BLK-junior-20260908-0003-wish: 指摘 1 件を観点として全図に当て、同じ抜けが
// ある図だけを一覧できること。これが無い間は、GpioDrv を直したあと UART / CAN
// の対応する図に同じ抜けがあるかを、1 枚ずつ開いて目で確かめるしかなかった。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const CLS_GPIO = [
  '@startuml',
  'class GpioDrv {',
  '  +GpioDrv()',
  '  +Gpio_Write(ch, v)',
  '}',
  '@enduml',
].join('\n');

const CLS_UART = [
  '@startuml',
  'class UartDrv {',
  '  +Uart_Send(buf)',
  '}',
  '@enduml',
].join('\n');

const CLS_CAN = [
  '@startuml',
  'class CanDrv {',
  '  +Can_Send(msg)',
  '}',
  '@enduml',
].join('\n');

async function freshWorkspace(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'localStorage', fileDir: './test-results/autosave/blk-junior-0003-wish-pattern-check/e2e-blk-j0003w' }));
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

async function setupThreeDocs(page) {
  await gotoApp(page);
  await typeDsl(page, CLS_GPIO);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, CLS_UART);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, CLS_CAN);
  await expect(page.locator('#tab-bar .tab')).toHaveCount(3);
}

async function openPattern(page) {
  await page.locator('#btn-tab-pattern').click();
  await expect(page.locator('#pattern-panel')).toHaveClass(/open/);
}

test.describe('BLK-junior-0003 同種指摘の一括チェック', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('指摘を貼ると観点が選ばれ、欠けている図だけが出る', async ({ page }) => {
    await setupThreeDocs(page);
    await openPattern(page);

    // 指摘文をそのまま貼る。観点は自動で選ばれる。
    await page.locator('#pattern-note').fill('GpioDrv クラスにコンストラクタが無い');
    await page.waitForTimeout(200);
    await expect(page.locator('#pattern-kind')).toHaveValue('class-ctor');

    // 直した gpio は出ず、まだ直していない 2 枚だけが残る。
    const docs = page.locator('#pattern-results .pat-doc');
    await expect(docs).toHaveCount(2);
    await expect(docs.nth(0).locator('.pat-miss')).toHaveText(/UartDrv/);
    await expect(docs.nth(1).locator('.pat-miss')).toHaveText(/CanDrv/);
    await expect(page.locator('#pattern-head')).toHaveAttribute('data-missing', '2');
    await expect(page.locator('#pattern-head')).toContainText('3 図中 2 図で欠けています');

    // 欠けているクラス名と行が出るので、開く前に何を直すかが決まる。
    await expect(docs.nth(0).locator('.pat-miss')).toHaveText(/UartDrv/);
  });

  test('欠けた行を押すとその図のその行へ移る', async ({ page }) => {
    await setupThreeDocs(page);
    await openPattern(page);
    await page.locator('#pattern-note').fill('コンストラクタが無い');
    await page.waitForTimeout(200);

    await page.locator('#pattern-results .pat-doc').nth(0).locator('.pat-miss').first().click();
    await page.waitForTimeout(400);
    const dsl = await page.locator('#editor').inputValue();
    expect(dsl).toContain('UartDrv');
  });

  test('観点を切り替えると当たる図種が変わり、対象外は分けて数える', async ({ page }) => {
    await setupThreeDocs(page);
    await openPattern(page);
    await page.locator('#pattern-kind').selectOption('state-return');
    await page.waitForTimeout(200);
    // クラス図しか開いていないので、状態遷移図の観点は当たる図が無い。
    // 「欠けている図なし」ではなく「当たる図がありません」と出す。
    await expect(page.locator('#pattern-head')).toContainText('当たる図がありません');
    await expect(page.locator('#pattern-results .pat-doc')).toHaveCount(0);
  });
});
