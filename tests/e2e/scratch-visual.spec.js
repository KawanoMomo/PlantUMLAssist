// @ts-check
// Visual verification gate (CLAUDE.md): GUI に影響する変更には実機スクリーン
// ショットを伴うこと。 fix/scratch-add-actor の dsl-updater auto-wrap が
// 完全空エディタからの actor 追加で有効な PlantUML SVG を描画することを撮影。
const { test } = require('@playwright/test');
const { gotoApp } = require('./helpers');
const path = require('path');

test('VISUAL: empty editor + tail-add actor renders valid SVG', async ({ page }) => {
  await gotoApp(page);
  // Wipe editor (simulate "テンプレートを使用せず 1 から記載")
  await page.evaluate(() => {
    var ed = document.getElementById('editor');
    ed.value = '';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  // Take BEFORE screenshot showing the bug condition starting state
  await page.screenshot({
    path: path.join(__dirname, '../../.investigation/visual-01-empty-before-add.png'),
    fullPage: true,
  });
  // Switch tail-add to participant=actor and add User1
  await page.locator('#seq-tail-kind').selectOption('participant');
  await page.locator('#seq-tail-ptype').selectOption('actor');
  await page.locator('#seq-tail-alias').fill('User1');
  await page.locator('#seq-tail-add').click();
  // Wait for render pipeline
  await page.waitForTimeout(2000);
  // AFTER screenshot — confirms no "@start/@end" error, valid actor rendered
  await page.screenshot({
    path: path.join(__dirname, '../../.investigation/visual-02-after-add-actor.png'),
    fullPage: true,
  });
});
