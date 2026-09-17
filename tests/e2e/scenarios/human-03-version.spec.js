// @ts-check
// BLK-human-20260916-0902 — 人間の台本「不具合を報告するとき、どの版で起きたかを伝える」。
//
// GUI のどこにも版が無く、package.json は 0.1.0 のまま git tag と食い違っていた。
// 到達条件は「⚙設定 → 情報 に v{major}.{minor} 形式の版・コミット・日付が出て、1 クリックで複製できる」こと。
const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const path = require('path');
const { gotoApp } = require('../helpers');

test('人間 手順 3 — 設定を開くと版の文字列が見え、複製できる', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await gotoApp(page);
  await page.click('#rail-config');
  await page.click('#cfg-tab-about');
  const ver = page.locator('#cfg-version');
  await expect(ver).toBeVisible();
  await expect(ver).toHaveText(/^PlantUMLAssist v\d+\.\d+/);
  const text = (await ver.textContent()) || '';

  // 正本は git tag: 手元の最新タグと一致する
  const root = path.join(__dirname, '..', '..', '..');
  let tag = '';
  try { tag = execSync('git describe --tags --abbrev=0', { cwd: root }).toString().trim(); } catch (e) {}
  if (tag) expect(text.startsWith('PlantUMLAssist ' + tag + ' ')).toBe(true);
  expect(text).toMatch(/\([0-9a-f]{7,}, \d{4}-\d{2}-\d{2}\)$/);

  await page.click('#cfg-version-copy');
  await expect(page.locator('#cfg-version-status')).toHaveText('複製しました');
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
  if (clip !== null) expect(clip).toBe(text);
});

// BLK-human-20260917-0900 — 新しい版に気付く。押したときだけ確かめ、落とさない・実行しない。
// GitHub へは出ない: /update-check と /open-url を差し替えて画面の振る舞いだけを見る。
test('人間 手順 3 — 更新を確認を押すと新しい版と変更点・インストーラ取得が出る (既定で自動確認は切)', async ({ page }) => {
  let checks = 0;
  const opened = [];
  await page.route('**/update-check', async (route) => {
    checks++;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      current: { version: 'v2.10' },
      release: { tag_name: 'v99.0', html_url: 'https://github.com/KawanoMomo/PlantUMLAssist/releases/tag/v99.0',
        assets: [{ name: 'PlantUMLAssist-99.0-setup.exe',
          browser_download_url: 'https://github.com/KawanoMomo/PlantUMLAssist/releases/download/v99.0/PlantUMLAssist-99.0-setup.exe' }] } }) });
  });
  await page.route('**/open-url', async (route) => {
    opened.push(JSON.parse(route.request().postData() || '{}').url);
    await route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
  });
  await gotoApp(page);
  await page.click('#rail-config');
  await page.click('#cfg-tab-about');
  expect(checks).toBe(0); // 起動しただけでは通信しない
  await expect(page.locator('#cfg-update-auto')).not.toBeChecked();
  await expect(page.locator('#cfg-update-result')).toBeHidden();

  await page.click('#cfg-update-check');
  await expect(page.locator('#cfg-update-status')).toContainText('v99.0');
  await expect(page.locator('#cfg-update-result')).toBeVisible();
  expect(checks).toBe(1);
  await page.click('#cfg-update-notes');
  await page.click('#cfg-update-get');
  await expect.poll(() => opened.length).toBe(2);
  expect(opened[0]).toContain('/releases/tag/v99.0');
  expect(opened[1]).toMatch(/setup\.exe$/);
});
