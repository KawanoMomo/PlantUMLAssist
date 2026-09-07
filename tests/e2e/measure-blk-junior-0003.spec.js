// @ts-check
// BLK-junior-20260908-0003 の実測。起票者の手順 6 (タブをダブルクリックして
// 名前の末尾に「(レビュー反映)」を付ける) を、説明文を読んだだけで迷わず
// 完了できるか。クリックとキー入力を数える。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const SUFFIX = '(レビュー反映)';

test('measure: 手順 6 を試し打ちなしで完了する', async ({ page }) => {
  let clicks = 0;
  let keys = 0;
  await gotoApp(page);

  /** @type {string} */
  let promptText = '';
  page.on('dialog', async (d) => {
    promptText = d.message();
    const base = 'GPIOドライバ派生クラス';
    keys += (base + SUFFIX).length + 1;   // 打鍵 + Enter (accept)
    await d.accept(base + SUFFIX);
  });

  await page.locator('#tab-bar .tab').first().dblclick();
  clicks += 2;
  await page.waitForTimeout(400);

  // 文言が受理規則と合っているので「一度試す」往復が要らない。
  expect(promptText).toContain('括弧');
  expect(promptText).not.toContain('英数字');
  await expect(page.locator('#tab-bar .tab').first()).toContainText(SUFFIX);

  console.log('BLK-junior-20260908-0003 実測: クリック ' + clicks + ' / キー入力 ' + keys);
  expect(clicks).toBeLessThanOrEqual(10);
  expect(keys).toBeLessThanOrEqual(50);
});
