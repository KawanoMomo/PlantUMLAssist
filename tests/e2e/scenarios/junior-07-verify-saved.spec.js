// @ts-check
// junior 台本 手順7: 書き出した画像が保存先に保存されたことを確認する。
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);
const ABS = S.absDirFor(__filename);

test('手順7 書き出した画像が保存先に置かれたことを確かめられる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.typeDsl(page, S.GPIO_STATE);
  await S.renameActive(page, 'gpio_state_doc');

  const download = await (await S.exportVia(page, 'exp-svg'));
  expect(download).not.toBeNull();
  fs.mkdirSync(ABS, { recursive: true });
  const out = path.join(ABS, 'gpio_state_doc.svg');
  await download.saveAs(out);

  // 到達条件: 保存先にファイルが実在し、中身が自分の図である。
  expect(fs.existsSync(out)).toBe(true);
  const svg = fs.readFileSync(out, 'utf8');
  expect(svg).toContain('<svg');
  expect(svg).toContain('Ready');
});

// BLK-junior-20260915-0106: 手順7 が求めるのは「指摘の内容が反映されているか」で、
// 置けたこと (BLK-junior-20260915-0007) だけでは足りない。資料化したその場で
// 保存先の本文を読み直して出し、モーダルを閉じて📂一覧 → フィルタ入力 → 行クリック、
// という同じ確認をもう一度たどらずに済ませる。
test('手順7 資料化した本文を、モーダルを閉じずに保存先から読み直して確かめられる', async ({ page }) => {
  const NOTE = '指摘2 への回答: ClockCtrl は意図的に割愛';
  const DSL = [
    '@startuml',
    'title GPIOドライバ状態遷移',
    '[*] --> Uninit',
    'Uninit --> Ready : Gpio_Init',
    'note "' + NOTE + '" as N1',
    '@enduml',
  ].join('\n');

  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'GPIOドライバ状態遷移', DSL);
  await page.reload();
  await page.waitForTimeout(800);

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-material').click();
  await page.waitForSelector('#mexp-modal', { state: 'visible' });
  await page.waitForTimeout(600);

  await page.locator('#mexp-component').selectOption('GPIOドライバ');
  await page.locator('#mexp-kind').selectOption('状態遷移図');
  await page.waitForTimeout(200);

  const dl = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await page.locator('#mexp-run').click();
  await dl;

  // 到達条件: モーダルは開いたまま、保存先から読み直した本文がその場に出る。
  await expect(page.locator('#mexp-readback')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#mexp-modal')).toBeVisible();
  await expect(page.locator('#mexp-readback-text')).toContainText('読み直しました');
  await expect(page.locator('#mexp-readback-text')).toContainText('同じです');

  // 指摘の内容 (note) が、開き直さずにそのまま読める。
  const body = await page.locator('#mexp-readback-body').textContent();
  expect(body).toContain(NOTE);
  expect(body).toContain('(資料用)');

  // 探している言葉は打ち込めば当たる (長い本文でも目で追わなくてよい)。
  await page.locator('#mexp-readback-find').fill('note');
  await page.waitForTimeout(200);
  await expect(page.locator('#mexp-readback-body .mexp-rb-hit')).toHaveCount(1);
});
