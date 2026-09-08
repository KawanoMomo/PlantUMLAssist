// @ts-check
// junior 台本 手順5: Export メニューから資料に貼る画像を書き出す。
// 状態遷移図は「SVGとして保存」、他の図種は「PNG(透過背景)」。
//
// BLK-junior-20260908-2303-wish: 形式の決まりを利用者が覚えて選ぶのをやめ、
// 「資料化」で部品と図種を選ぶだけで、形式・題名の (資料用)・保存・庫までを 1 回で行う。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順5(状態遷移図) SVG として書き出せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, S.GPIO_STATE);
  await S.renameActive(page, 'gpio_state_doc');

  const download = await (await S.exportVia(page, 'exp-svg'));
  // 到達条件: SVG が 1 本書き出される。
  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.svg$/);
});

test('手順5(他の図種) PNG(透過背景)も同じメニューから選べる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, S.GPIO_SEQ);
  await S.renameActive(page, 'gpio_seq_doc');

  const download = await (await S.exportVia(page, 'exp-png-transparent'));
  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.png$/);
});

// 「資料化」— 部品と図種を選ぶだけで、正しい形式が自動で決まる。
test('手順5 資料化: 状態遷移図を選ぶと SVG で出て、(資料用) が付いて保存フォルダにも入る', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'GPIOドライバ状態遷移', S.GPIO_STATE);
  await S.putDoc(page, DIR, 'GPIOドライバ初期化シーケンス', S.GPIO_SEQ);
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

  // 押す前に、形式と出力名が読める (覚えていなくてよい)。
  const plan = await page.locator('#mexp-plan').textContent();
  expect(plan).toContain('SVG');
  expect(plan).toContain('(資料用)');

  const dl = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await page.locator('#mexp-run').click();
  const download = await dl;

  // 到達条件: 図種に決まった形式 (SVG) で、(資料用) の名前の 1 枚が出る。
  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toBe('GPIOドライバ状態遷移(資料用).svg');

  // 保存フォルダにも資料用の版が残る (次の周に開き直せる)。
  await page.waitForTimeout(1200);
  const saved = await S.readDoc(page, DIR, 'GPIOドライバ状態遷移(資料用)');
  expect(saved).not.toBeNull();
  expect(saved).toContain('(資料用)');
});

test('手順5 資料化: シーケンス図を選ぶと PNG(透過背景)に切り替わる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'GPIOドライバ状態遷移', S.GPIO_STATE);
  await S.putDoc(page, DIR, 'GPIOドライバ初期化シーケンス', S.GPIO_SEQ);
  await page.reload();
  await page.waitForTimeout(800);

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-material').click();
  await page.waitForSelector('#mexp-modal', { state: 'visible' });
  await page.waitForTimeout(600);

  await page.locator('#mexp-component').selectOption('GPIOドライバ');
  await page.locator('#mexp-kind').selectOption('シーケンス図');
  await page.waitForTimeout(200);
  expect(await page.locator('#mexp-plan').textContent()).toContain('PNG');

  const dl = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await page.locator('#mexp-run').click();
  const download = await dl;

  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toBe('GPIOドライバ初期化シーケンス(資料用).png');
});
