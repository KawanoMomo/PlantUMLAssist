// @ts-check
// primary 台本 手順11: design/README.md の「対象の仕様」を上から 1 ファイル開き、
// 仕様に描かれていて現状の GUI に無い操作・画面を 1 つ選んで BLK にする。
// spec 側で見るのは「仕様書が読める場所にあり、GUI と突き合わせられる」ことまで。
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DESIGN = path.join('E:', '01_Loop', 'loop', 'design');
const DIR = S.dirFor(__filename);

test('手順11 仕様の「対象の仕様」を読み、GUI と突き合わせられる', async ({ page }) => {
  const readme = path.join(DESIGN, 'README.md');
  test.skip(!fs.existsSync(readme), 'design/README.md が無い環境では突き合わせができない');

  const text = fs.readFileSync(readme, 'utf8');
  // 到達条件その1: 「対象の仕様」の一覧が読め、そこに挙がったファイルが実在する。
  expect(text).toContain('対象の仕様');
  const files = (text.match(/[^`\n]+\.dc\.html/g) || []).map((f) => f.replace(/^`/, ''));
  expect(files.length).toBeGreaterThan(0);
  const present = files.filter((f) => fs.existsSync(path.join(DESIGN, f)));
  expect(present.length).toBeGreaterThan(0);

  // 到達条件その2: 突き合わせる相手の GUI が実際に立ち上がる。
  await S.bootWithSaveDir(page, DIR);
  await expect(page.locator('#preview-svg')).toBeVisible();
  await expect(page.locator('#btn-tab-folder')).toBeVisible();
});
