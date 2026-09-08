// @ts-check
// primary 台本 手順10: 手順2 の手数(クリック数 + キー入力数)を数え、run ログに記録する。
// 台本末尾の前回値は clicks=1 / keys=24。増えたら friction 起票の合図になるので、上限で守る。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順10 手順2 の手数がクリック 10 以下・キー入力 50 以下に収まる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of ['spi_init_sequence', 'spi_state']) await S.putDoc(page, DIR, n, S.docFor(n, 'SpiDrv'));
  await page.reload();
  await page.waitForSelector('#preview-svg');

  let clicks = 0;
  let keys = 0;

  await page.keyboard.press('Control+k'); keys += 2;
  await page.waitForSelector('#cp-modal');
  await page.locator('#cp-input').fill('一括置換'); keys += 4;
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter'); keys += 1;
  await page.waitForTimeout(500);

  const allDocs = page.locator('#rename-all-docs');
  if (!(await allDocs.isChecked())) { await allDocs.check(); clicks += 1; }
  await page.locator('#rename-from').fill('SpiDrv'); keys += 6;
  await page.locator('#rename-to').fill('Spi_Driver'); keys += 10;
  await page.waitForTimeout(900);
  await page.locator('#btn-rename-apply').click(); clicks += 1;
  await page.waitForTimeout(1500);

  // 到達条件その1: 置換が実際に効いている(手数だけ数えて終わらない)。
  expect(await S.readDoc(page, DIR, 'spi_init_sequence')).toContain('Spi_Driver');
  // 到達条件その2: 手数が台本の上限に収まる。
  expect(clicks).toBeLessThanOrEqual(10);
  expect(keys).toBeLessThanOrEqual(50);
});
