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
