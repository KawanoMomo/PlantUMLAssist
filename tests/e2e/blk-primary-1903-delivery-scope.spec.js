// @ts-check
// BLK-primary-20260908-1903 「納品パッケージの対象がタブを開いた図だけになる」。
// 保存フォルダに 6 枚あってもタブが 1 枚なら、対象に 1 枚しか入らず残りが黙って
// zip から落ちていた。的は保存フォルダ全体。落ちるときは枚数で警告する。
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('./helpers');

const SAVE_DIR = saveDirFor(__filename);
const ABS_DIR = path.join(__dirname, '..', '..', SAVE_DIR);

const SEQ = (t) => ['@startuml', 'title ' + t, 'participant App', 'participant Drv',
  'App -> Drv : Init', '@enduml'].join('\n');
const ST = (t) => ['@startuml', 'title ' + t, '[*] --> Idle', 'state Idle', 'state Busy',
  'Idle --> Busy : Init', '@enduml'].join('\n');

// 保存フォルダ側に 6 枚。うち spi_init_sequence だけをタブで開く。
const FILES = {
  spi_init_sequence: SEQ('SPI 初期化'),
  spi_state: ST('SPI 状態'),
  dma_state: ST('DMA 状態'),
  dma_transfer_sequence: SEQ('DMA 転送'),
  adc_init_sequence: SEQ('ADC 初期化'),
  uart_state: ST('UART 状態'),
};

function writeFolder() {
  // 前のテストが自動保存で足したファイルを持ち越さない (枚数がそのまま的になる)。
  try { fs.rmSync(ABS_DIR, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(ABS_DIR, { recursive: true });
  Object.keys(FILES).forEach((n) => {
    fs.writeFileSync(path.join(ABS_DIR, n + '.puml'), FILES[n], 'utf8');
  });
}

async function openWithFolder(page) {
  await page.addInitScript((dir) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config', JSON.stringify({
        // 自動保存は切る。的はフォルダの中身そのものなので、テスト中に
        // アプリが枚数を増やすと「何枚あるか」の検証にならない。
        enabled: false, debounceMs: 200, restoreMode: 'manual', backend: 'file', fileDir: dir,
      }));
    } catch (e) {}
  }, SAVE_DIR);
  await gotoApp(page);
  // タブは 1 枚だけ。フォルダの 1 枚と同名にして「同名はタブが勝つ」も通す。
  await page.evaluate((dsl) => {
    var ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), 'spi_init_sequence');
    var ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = dsl;
    ed.dispatchEvent(new Event('input'));
  }, FILES.spi_init_sequence);
  await page.waitForTimeout(700);
  // フォルダは起動が済んでから作る。起動時に置かれる diagram1.puml を持ち越すと
  // 「フォルダに何枚あるか」の的がテストのたびに動く。
  writeFolder();
}

test.describe('BLK-primary-1903 納品パッケージの対象は保存フォルダ全体', () => {

  test('タブが 1 枚でも、対象の既定はフォルダの 6 枚になる', async ({ page }) => {
    await openWithFolder(page);
    await page.locator('#btn-tab-delivery').click();
    await expect(page.locator('#dp-modal')).toBeVisible();
    // フォルダを読み終えるまで待つ (読み終えたら描き直される)
    await expect(page.locator('#dp-count')).toHaveText('6 / 6 枚');
    await expect(page.locator('#dp-list')).toContainText('dma_state');
    await expect(page.locator('#dp-list')).toContainText('uart_state');
    // 開いていない図はその旨が出る
    await expect(page.locator('#dp-list')).toContainText('未オープン');
    await expect(page.locator('#dp-coverage')).toHaveAttribute('data-warn', '0');
    await expect(page.locator('#dp-coverage')).toHaveAttribute('data-total', '6');
  });

  test('開いているタブは「未オープン」にならない (同名はタブが勝つ)', async ({ page }) => {
    await openWithFolder(page);
    await page.locator('#btn-tab-delivery').click();
    await expect(page.locator('#dp-count')).toHaveText('6 / 6 枚');
    await expect(page.locator('.dp-item[data-open="1"]')).toHaveCount(1);
    await expect(page.locator('.dp-item[data-open="0"]')).toHaveCount(5);
  });

  test('対象から外すと「何枚が落ちるか」を警告として出す', async ({ page }) => {
    await openWithFolder(page);
    await page.locator('#btn-tab-delivery').click();
    await expect(page.locator('#dp-count')).toHaveText('6 / 6 枚');
    await page.locator('#dp-none').click();
    await page.locator('.dp-pick[data-name="spi_init_sequence"]').check();
    await expect(page.locator('#dp-count')).toHaveText('1 / 6 枚');
    const cov = page.locator('#dp-coverage');
    await expect(cov).toHaveAttribute('data-warn', '1');
    await expect(cov).toHaveAttribute('data-missing', '5');
    await expect(cov).toHaveAttribute('data-unopened', '5');
    await expect(cov).toContainText('5 枚が対象から外れています');
    await expect(cov).toContainText('タブを開いていない図');
  });

  test('「全部」で戻せる', async ({ page }) => {
    await openWithFolder(page);
    await page.locator('#btn-tab-delivery').click();
    await expect(page.locator('#dp-count')).toHaveText('6 / 6 枚');
    await page.locator('#dp-none').click();
    await expect(page.locator('#dp-count')).toHaveText('0 / 6 枚');
    await page.locator('#dp-all').click();
    await expect(page.locator('#dp-count')).toHaveText('6 / 6 枚');
    await expect(page.locator('#dp-coverage')).toHaveAttribute('data-warn', '0');
  });

  test('作った zip は開いていない図も含む (書き出しの結果に枚数が出る)', async ({ page }) => {
    await openWithFolder(page);
    await page.locator('#btn-tab-delivery').click();
    await expect(page.locator('#dp-count')).toHaveText('6 / 6 枚');
    const dl = page.waitForEvent('download');
    await page.locator('#dp-build').click();
    const download = await dl;
    expect(download.suggestedFilename()).toMatch(/^delivery-\d{8}-\d{4}\.zip$/);
    await expect(page.locator('#dp-status')).toContainText('6 / 6 枚');
    await expect(page.locator('#dp-status')).not.toContainText('対象外');
  });
});
