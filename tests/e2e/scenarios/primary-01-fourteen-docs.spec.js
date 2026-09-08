// @ts-check
// primary 台本 手順1: 横断対象の 14 枚を用意する(無ければ作る)。保存先は persona-data\primary。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順1 14 枚が保存先に揃い、一覧から数えられる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // 用意されていない図は作る、が台本。ここでは 13 枚だけ置いて 1 枚足りない状態から始める。
  const missing = S.PRIMARY_DOCS[S.PRIMARY_DOCS.length - 1];
  for (const n of S.PRIMARY_DOCS.slice(0, -1)) await S.putDoc(page, DIR, n, S.docFor(n));
  expect((await S.listDir(page, DIR)).length).toBe(13);

  // 足りない 1 枚 (ADC 状態遷移) を作って保存する。
  await S.putDoc(page, DIR, missing, S.docFor(missing));

  // 到達条件: 14 枚すべてが保存先にあり、一覧に名前で並ぶ。
  const names = await S.listDir(page, DIR);
  expect(names.length).toBe(14);
  for (const n of S.PRIMARY_DOCS) expect(names).toContain(n);

  await S.openFolder(page);
  await expect(page.locator('#folder-panel .folder-item[data-file-name="adc_state"]')).toBeVisible();
});
