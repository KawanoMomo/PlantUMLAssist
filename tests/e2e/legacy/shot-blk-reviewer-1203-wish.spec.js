const fs = require('fs');
const path = require('path');
const { test } = require('@playwright/test');
const { gotoApp, saveDirFor, shotOut } = require('../helpers');

// BLK-reviewer-20260908-1203-wish の画面写真。📂一覧で「SVG の中身を確かめる」を押した後、
// 食い違った図の中身 (欠落した状態・遷移と、SVG に残る古い名前) と指摘文を撮る。
const DIR = saveDirFor(__filename);
const OUT = shotOut('shot-blk-reviewer-1203-wish.png');
const ABS = path.join(__dirname, '..', '..', '..', DIR);

const NOW = '@startuml\n[*] --> Idle\nIdle --> Configured : Init\nConfigured --> Driving : Set\n@enduml';
const OLD = '@startuml\n[*] --> Idle\nIdle --> Ready : Init\nReady --> Driving : Set\n@enduml';

async function put(page, name, dsl) {
  await page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl, dir: DIR });
}

async function putSvgOf(page, name, dsl) {
  const svg = await page.evaluate(async (d) => {
    const r = await fetch('/render', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: d, mode: 'local' }),
    });
    return r.text();
  }, dsl);
  fs.writeFileSync(path.join(ABS, name + '.svg'), svg, 'utf-8');
}

test('shot: 食い違った SVG の中身と指摘文', async ({ page }) => {
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

  await put(page, 'gpio_state', NOW);
  await putSvgOf(page, 'gpio_state', NOW);        // 中身まで一致
  await put(page, 'adc_state', NOW);
  await putSvgOf(page, 'adc_state', OLD);         // 旧 Ready が残り、Configured が無い

  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open .folder-item');
  const btn = page.locator('#folder-svg-verify');
  if (await btn.count() && await btn.isEnabled()) {
    await btn.click();
    await page.waitForSelector('#folder-svg-diff-report', { timeout: 120000 });
  }
  await page.waitForTimeout(300);
  await page.locator('#folder-panel').screenshot({ path: OUT });
});
