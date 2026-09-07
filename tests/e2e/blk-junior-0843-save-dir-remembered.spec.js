// @ts-check
// BLK-junior-20260907-0843: 保存先ディレクトリが新しいタブで既定へ戻り、
// 図種を変えるたびに ⚙設定 → ファイル → パス再入力 → OK を打ち直していた。
// 保存先は server 側 (/prefs) に覚え、localStorage が空のタブでも引き継ぐ。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const SAVE_DIR = './autosave-e2e-blk-j0843';

async function openSettings(page) {
  await page.locator('#rail-config').click();
  await expect(page.locator('#cfg-modal')).toBeVisible();
  const tab = page.locator('#cfg-tab-autosave');
  if (await tab.count()) await tab.click();
  await expect(page.locator('#cfg-pane-autosave')).toBeVisible();
}

// 各テストが前のテストの /prefs を引きずらないよう、最初に server 側を空に戻す。
test.beforeEach(async ({ request }) => {
  await request.post('/prefs', { data: { backend: '', fileDir: '' } });
});

test.describe('保存先ディレクトリを覚える (BLK-junior-20260907-0843)', () => {
  test('/prefs は保存先だけを覚え、それ以外は持ち帰らない', async ({ request }) => {
    const res = await request.post('/prefs', {
      data: { backend: 'file', fileDir: SAVE_DIR, debounceMs: 5000, enabled: false },
    });
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toEqual({ backend: 'file', fileDir: SAVE_DIR });
    const got = await request.get('/prefs');
    expect(await got.json()).toEqual({ backend: 'file', fileDir: SAVE_DIR });
  });

  test('設定で保存先を決めると server 側にも残る', async ({ page, request }) => {
    await gotoApp(page);
    await openSettings(page);
    await page.locator('#cfg-backend-cards input[value="file"]').check();
    await expect(page.locator('#cfg-file-dir-row')).toBeVisible();
    await page.locator('#cfg-file-dir').fill(SAVE_DIR);
    await page.locator('#cfg-ok').click();
    await expect(page.locator('#cfg-modal')).toBeHidden();

    await expect.poll(async () => (await (await request.get('/prefs')).json()).fileDir)
      .toBe(SAVE_DIR);
  });

  test('新しいタブ (localStorage 空) でも保存先が入ったまま開く', async ({ page, request, context }) => {
    // 前の run で決めた保存先が server にある状態を作る。
    await request.post('/prefs', { data: { backend: 'file', fileDir: SAVE_DIR } });

    // localStorage を引き継がない新しいページ = ペルソナが毎回開く条件。
    const fresh = await context.newPage();
    await fresh.goto('/');
    await fresh.evaluate(() => window.localStorage.clear());
    await gotoApp(fresh);

    // 設定を開き直さなくても、保存先は既に効いている。
    await expect.poll(async () => fresh.evaluate(() => window.MA.autoSave.getConfig().fileDir))
      .toBe(SAVE_DIR);
    expect(await fresh.evaluate(() => window.MA.autoSave.getConfig().backend)).toBe('file');

    // 設定画面を開けば、その値がそのまま入っている (打ち直しが要らない)。
    await openSettings(fresh);
    await expect(fresh.locator('#cfg-backend-cards input[value="file"]')).toBeChecked();
    await expect(fresh.locator('#cfg-file-dir')).toHaveValue(SAVE_DIR);
    await fresh.close();
  });

  test('このブラウザで別の保存先を決めていれば server の値で上書きされない', async ({ page, request }) => {
    await gotoApp(page);
    await page.evaluate((dir) => {
      window.MA.autoSave.setConfig({ backend: 'file', fileDir: dir });
    }, './autosave-e2e-blk-j0843-local');
    await request.post('/prefs', { data: { backend: 'file', fileDir: SAVE_DIR } });

    await page.reload();
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    await expect.poll(async () => page.evaluate(() => window.MA.autoSave.getConfig().fileDir))
      .toBe('./autosave-e2e-blk-j0843-local');
  });
});
