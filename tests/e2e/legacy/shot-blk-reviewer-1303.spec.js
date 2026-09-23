const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

// 保存先の節は既定で開いている (design 10a)。開いていれば畳んでから開き直し、
// 一覧を今の中身で描き直す (直に押すと、開いていたときに畳んでしまう)。
async function openFolder(page) {
  if (await page.locator('#folder-panel.open').count()) await page.locator('#btn-tab-folder').click();
  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open');
}

// BLK-reviewer-20260908-1303 の「できるようになったこと」の画。
const DIR = saveDirFor(__filename);
const ABS = path.join(__dirname, '..', '..', '..', DIR);
const OUT = process.env.SHOT_OUT || path.join(__dirname, '..', '..', '..', 'test-results', 'BLK-reviewer-20260908-1303.png');

const NOW = [
  '@startuml',
  'participant "受注サービス"',
  'participant "倉庫サービス"',
  '"受注サービス" -> "倉庫サービス": 在庫を引き当てる',
  '"倉庫サービス" -> "受注サービス": 引き当て結果',
  '@enduml',
].join('\n');
const OLD_ORDER = [
  '@startuml',
  'participant "倉庫サービス"',
  'participant "受注サービス"',
  '"受注サービス" -> "倉庫サービス": 在庫を引き当てる',
  '"倉庫サービス" -> "受注サービス": 引き当て結果',
  '@enduml',
].join('\n');

test('shot: 文字に現れない食い違いを構造として出す', async ({ page }) => {
  test.setTimeout(180000);
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
  await gotoApp(page);
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
  await page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'S1303_order', dir: a.dir, dsl: a.dsl }),
    });
  }, { dir: DIR, dsl: NOW });
  const svg = await page.evaluate(async (d) => {
    const r = await fetch('/render', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: d, mode: 'local' }),
    });
    return r.ok ? r.text() : null;
  }, OLD_ORDER);
  expect(svg).not.toBeNull();
  fs.writeFileSync(path.join(ABS, 'S1303_order.svg'), svg, 'utf-8');

  await openFolder(page);
  await page.waitForSelector('#folder-panel.open .folder-item');
  await page.locator('#folder-svg-verify').click();
  await expect(page.locator('#folder-svg-content')).toContainText('ずれ 1 枚', { timeout: 120000 });
  await expect(page.locator('[data-svg-diff="S1303_order"] .diff-structural')).not.toHaveCount(0);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await page.locator('#folder-panel').screenshot({ path: OUT });
});
