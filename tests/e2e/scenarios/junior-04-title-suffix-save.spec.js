// @ts-check
// junior 台本 手順4: 日本語タイトルの末尾に「(資料用)」を付け足し、図(.puml)をこの名前で保存する。
// BLK-junior-20260909-0003: 付け足す先が「タイトル / Title」と「図名 / File name」の 2 か所に
// 分かれていて、毎回両方を書き換えていた。末尾の付け足しは片方だけで済む。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);
const BASE = 'GPIOドライバ状態遷移';
const NAME = BASE + '(資料用)';

// 図の設定タブを開き、タイトル欄の末尾に付け足す (書き換えるのはここ 1 か所だけ)。
async function appendToTitle(page, suffix) {
  await page.locator('#props-tab-settings').click();
  const title = page.locator('#ds-title');
  await title.fill((await title.inputValue()) + suffix);
  await title.dispatchEvent('change');
  await page.waitForTimeout(500);
}

test('手順4 タイトル末尾に (資料用) を付けて、その名前で保存フォルダに書ける', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.typeDsl(page, S.GPIO_STATE);

  // 前周までの図を開いた状態 = タイトルと図名が base で揃っている。
  await S.renameActive(page, BASE);
  await page.locator('#props-tab-settings').click();
  await page.locator('#ds-title').fill(BASE);
  await page.locator('#ds-title').dispatchEvent('change');
  await page.waitForTimeout(500);

  // 末尾を足すのはタイトル欄だけ。図名は連動して付く。
  await appendToTitle(page, '(資料用)');
  expect(await page.locator('#editor').inputValue()).toContain('(資料用)');
  expect(await page.locator('#ds-docname').inputValue()).toBe(NAME);
  await expect(page.locator('#ds-link-notice')).toContainText('図名 / File name');

  await S.runCommand(page, 'ファイルを保存');
  await page.waitForTimeout(1000);

  // 到達条件: その名前の .puml が保存先にある。
  const saved = await S.readDoc(page, DIR, NAME);
  expect(saved).not.toBeNull();
  expect(saved).toContain('(資料用)');
});

test('手順4 図名の末尾を足してもタイトルが追いつく (逆向き)', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.typeDsl(page, S.GPIO_STATE);

  await S.renameActive(page, BASE);
  await page.locator('#props-tab-settings').click();
  await page.locator('#ds-title').fill(BASE);
  await page.locator('#ds-title').dispatchEvent('change');
  await page.waitForTimeout(500);

  const name = page.locator('#ds-docname');
  await name.fill(NAME);
  await name.dispatchEvent('change');
  await page.waitForTimeout(600);

  expect(await page.locator('#ds-title').inputValue()).toBe(NAME);
  expect(await page.locator('#editor').inputValue()).toContain('(資料用)');
});

// BLK-junior-20260909-0103: 新規タブ (図名が既定名 diagram2 … のまま) にタイトルを書いたとき、
// 末尾だけの連動では図名が「既定名 + (資料用)」になり、意図したファイル名にならなかった。
test('手順4 新規タブでもタイトルを書けば図名がその名前になる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);

  // 新しいタブを開く = 図名は既定名 (diagram2 など)、タイトルは空。
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(400);
  await S.typeDsl(page, S.GPIO_STATE);
  await page.locator('#props-tab-settings').click();
  const auto = await page.locator('#ds-docname').inputValue();
  expect(auto).toMatch(/^diagram/);

  // 書くのはタイトル 1 か所だけ。
  const title = page.locator('#ds-title');
  await title.fill(NAME);
  await title.dispatchEvent('change');
  await page.waitForTimeout(600);

  expect(await page.locator('#ds-docname').inputValue()).toBe(NAME);
  expect(auto === NAME).toBe(false);

  await S.runCommand(page, 'ファイルを保存');
  await page.waitForTimeout(1000);
  const saved = await S.readDoc(page, DIR, NAME);
  expect(saved).not.toBeNull();
  expect(saved).toContain('(資料用)');
});
