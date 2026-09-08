// @ts-check
// primary 台本 手順7: レビュー指摘 2 があれば反映する。
// 指摘 2 は「新規の部品はシーケンス・状態遷移・クラスの 3 枚を揃える」型の指摘。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順7 指摘 2(部品の 3 枚が揃っていない)を、図を足して埋められる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // ADC はシーケンスしかなく、状態遷移が無い = 指摘 2。
  await S.putDoc(page, DIR, 'adc_init_sequence', S.docFor('adc_init_sequence'));
  expect(await S.listDir(page, DIR)).not.toContain('adc_state');

  await S.typeDsl(page, S.docFor('adc_state'));
  await S.renameActive(page, 'adc_state');
  await S.runCommand(page, 'ファイルを保存');
  await page.waitForTimeout(1000);

  // 到達条件: 足りなかった図が保存先に増え、部品名が既存図と揃っている。
  const names = await S.listDir(page, DIR);
  expect(names).toContain('adc_state');
  expect(await S.readDoc(page, DIR, 'adc_state')).toContain('Adc_Driver');
});
