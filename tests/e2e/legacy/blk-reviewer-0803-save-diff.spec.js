// @ts-check
// BLK-reviewer-20260907-0803: 前回保存した時点から変わった図があるかを画面が示す。
// レビューは「毎回全図を控えと diff」から「バッジを見て読む図だけ開く」に変わる。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const SPI = '@startuml\nparticipant Spi_Driver\nSpi_Driver -> Hal : Spi_Init()\n@enduml';
const CAN = '@startuml\nparticipant Can_Driver\nCan_Driver -> Hal : Can_Init()\n@enduml';

async function freshWorkspace(page) {
  await page.addInitScript(() => {
    // reload をまたぐテストがあるので、初回ロードのときだけ掃除する
    try {
      if (!window.sessionStorage.getItem('__diff_spec_init')) {
        window.sessionStorage.setItem('__diff_spec_init', '1');
        window.localStorage.clear();
      }
    } catch (e) {}
  });
}

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(250);
}

test.describe('BLK-reviewer-0803 前回保存時点との差分', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('基準を取る前は「基準なし」、取ると「変更なし」になる', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, SPI);
    const badge = page.locator('#btn-tab-diff');
    await expect(badge).toContainText('基準なし');

    await badge.click();
    await expect(page.locator('#diff-panel')).toHaveClass(/open/);
    await page.locator('#diff-mark-all').click();
    await expect(badge).toContainText('変更なし');
    await expect(badge).not.toHaveClass(/has-change/);
  });

  test('基準を取った後に編集すると変更件数が出る', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, SPI);
    await page.locator('#btn-tab-diff').click();
    await page.locator('#diff-mark-all').click();
    await page.keyboard.press('Escape');
    await page.locator('body').click({ position: { x: 5, y: 5 } });

    await typeDsl(page, SPI.replace('Spi_Init()', 'Spi_Transmit()'));
    const badge = page.locator('#btn-tab-diff');
    await expect(badge).toContainText('変更 1/1');
    await expect(badge).toHaveClass(/has-change/);
  });

  test('変わったタブにだけ印が付く', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, SPI);
    await page.locator('#btn-tab-new').click();
    await typeDsl(page, CAN);
    await page.locator('#btn-tab-diff').click();
    await page.locator('#diff-mark-all').click();
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#tab-bar .tab.dirty')).toHaveCount(0);

    // 2 枚目 (アクティブ) だけを書き換える
    await typeDsl(page, CAN.replace('Can_Init()', 'Can_Start()'));
    await expect(page.locator('#tab-bar .tab.dirty')).toHaveCount(1);
    await expect(page.locator('#tab-bar .tab.dirty .tab-dot')).toHaveAttribute('data-diff-status', 'changed');
  });

  test('一覧は図ごとの変更有無と増減行数を出し、行クリックでその図へ移る', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, SPI);
    await page.locator('#btn-tab-new').click();
    await typeDsl(page, CAN);
    await page.locator('#btn-tab-diff').click();
    await page.locator('#diff-mark-all').click();
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await typeDsl(page, CAN + '\nnote right : review');

    await page.locator('#btn-tab-diff').click();
    const rows = page.locator('#diff-panel .diff-row');
    await expect(rows).toHaveCount(2);
    await expect(page.locator('#diff-panel .diff-row.changed')).toHaveCount(1);
    await expect(page.locator('#diff-panel .diff-row.changed')).toContainText('+1');

    // 変更なしの図の行を押すとその図に移動する (読むべき図へ 1 クリック)
    const same = page.locator('#diff-panel .diff-row:not(.changed)').first();
    const name = (await same.innerText()).split('\n')[0].trim();
    await same.click();
    await expect(page.locator('#tab-bar .tab.active')).toHaveAttribute('data-doc-name', name);
  });

  test('基準はリロードをまたいで残る', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, SPI);
    await page.locator('#btn-tab-diff').click();
    await page.locator('#diff-mark-all').click();
    await expect(page.locator('#btn-tab-diff')).toContainText('変更なし');

    await page.reload();
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    await expect(page.locator('#btn-tab-diff')).toContainText('変更なし');
  });
});
