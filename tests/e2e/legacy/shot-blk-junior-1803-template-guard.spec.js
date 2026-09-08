// @ts-check
// BLK-junior-20260908-1803 の画面写真。
// テンプレ宣言のある図を開いて打った直後。テンプレは書き換わらず、その旨が下に出る。
const { test } = require('@playwright/test');
const { gotoApp, shotOut, saveDirFor } = require('../helpers');

const DIR = saveDirFor(__filename);
const OUT = shotOut('shot-blk-junior-1803-template-guard.png');

test('shot: テンプレには自動保存しない', async ({ page }) => {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 100, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
  await gotoApp(page);
  await page.evaluate(async (a) => {
    await fetch('/autosave?dir=' + encodeURIComponent(a.dir), { method: 'DELETE' });
    await fetch('/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'plantuml-usecase', dir: a.dir, dsl: a.dsl }),
    });
  }, { dir: DIR, dsl: '@startuml\nleft to right direction\nactor User\nUser --> (UC1)\n@enduml' });

  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open .folder-item');
  const btn = page.locator('#folder-panel button.folder-role[data-role-name="plantuml-usecase"]');
  await btn.click();
  await btn.click();   // テンプレ
  await page.locator('#folder-panel .folder-item[data-file-name="plantuml-usecase"]').click();
  await page.waitForTimeout(6200);   // 「開きました」の通知が消えるまで待つ
  await page.locator('#editor').click();
  await page.keyboard.type('\nUser --> (UC5)');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT });
});
