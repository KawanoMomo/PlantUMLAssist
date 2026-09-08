const fs = require('fs');
const path = require('path');
const { test } = require('@playwright/test');
const { gotoApp, saveDirFor, shotOut } = require('./helpers');

// BLK-reviewer-20260908-1103-wish の画面写真。📂一覧で「SVG の中身を確かめる」を押した後、
// 中身が食い違う図だけが名前で並んでいるところを撮る。
const DIR = saveDirFor(__filename);
const OUT = shotOut('shot-blk-reviewer-1103-wish.png');
const ABS = path.join(__dirname, '..', '..', DIR);

const NOW = '@startuml\n[*] --> Idle\nIdle --> Configured : Init\nConfigured --> Driving : Set\n@enduml';
const OLD = '@startuml\n[*] --> Idle\nIdle --> Driving : Set\n@enduml';

async function put(page, name, dsl) {
  await page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl, dir: DIR });
}

// 印の付いていない svg を直接置く (印を刻む前からある実データと同じ状態)。
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

test('shot: SVG の中身が今の DSL の姿かを一覧で言う', async ({ page }) => {
  test.setTimeout(180000);
  test.setTimeout(120000);
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
  await putSvgOf(page, 'adc_state', OLD);         // 時刻は新しいのに中身は古い
  await put(page, 'timer_state', NOW);
  await putSvgOf(page, 'timer_state', NOW);

  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open .folder-item');
  const btn = page.locator('#folder-svg-verify');
  if (await btn.count() && await btn.isEnabled()) {
    await btn.click();
    await page.waitForSelector('#folder-svg-verify-note', { timeout: 120000 });
  }
  await page.waitForTimeout(300);
  await page.locator('#folder-panel').screenshot({ path: OUT });
});
