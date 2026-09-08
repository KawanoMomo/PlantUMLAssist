const { test } = require('@playwright/test');
const { gotoApp, saveDirFor, shotOut } = require('./helpers');

// BLK-reviewer-20260908-1203 の画面写真。印だけで「内容ずれ」と分かった図を
// 「食い違いの中身を調べる」で開き、欠落と旧名、そして指摘文が出ているところを撮る。
const DIR = saveDirFor(__filename);
const OUT = shotOut('shot-blk-reviewer-1203.png');

const OLD = '@startuml\n[*] --> Idle\nIdle --> Ready : Init\nReady --> Driving : Set\n@enduml';
const NOW = '@startuml\n[*] --> Idle\nIdle --> Configured : Init\nConfigured --> Driving : Set\n@enduml';

async function put(page, name, dsl) {
  await page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl, dir: DIR });
}

async function exportSvg(page, name, dsl) {
  await page.evaluate(async (a) => {
    const r = await fetch('/render', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: a.dsl, mode: 'local' }),
    });
    const svg = await r.text();
    await fetch('/autosave-svg', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, svg: svg }),
    });
  }, { name, dsl, dir: DIR });
}

test('shot: 内容ずれの中身を調べる', async ({ page }) => {
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

  await put(page, 'spi_state', OLD);
  await exportSvg(page, 'spi_state', OLD);   // 旧内容のまま印つきで残る
  await put(page, 'spi_state', NOW);
  await put(page, 'gpio_state', NOW);
  await exportSvg(page, 'gpio_state', NOW);

  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open .folder-item');
  const scan = page.locator('#folder-svg-diff-scan');
  if (await scan.count() && await scan.isEnabled()) {
    await scan.click();
    await page.waitForSelector('#folder-svg-diff-report', { timeout: 120000 });
  }
  await page.waitForTimeout(300);
  await page.locator('#folder-panel').screenshot({ path: OUT });
});
