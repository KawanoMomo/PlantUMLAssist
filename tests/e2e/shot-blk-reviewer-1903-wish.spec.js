const { test } = require('@playwright/test');
const { gotoApp, saveDirFor, shotOut } = require('./helpers');

// BLK-reviewer-20260908-1903-wish の画面写真。📥 指摘箱を開き、1 件ごとに
// 「未対応 / SVG 未反映 / 反映済み」の札と、その根拠 (puml 側と SVG 側) が
// 同じ行に出ているところを撮る。
const DIR = saveDirFor(__filename);
const OUT = shotOut('shot-blk-reviewer-1903-wish.png');

function pin(anchor) {
  return "' @pin " + ['1', 'open', 'reviewer', '2026-09-08T15:03', anchor,
    'このラベルはシーケンス図のどのメッセージとも対応しない'].join('|');
}

function doc(title, label) {
  return [
    '@startuml', 'title ' + title, '[*] --> Idle',
    'Idle --> Busy : ' + label,
    pin('Idle --> Busy : Dma_Configure'),
    '@enduml',
  ].join('\n');
}

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

test('shot: 指摘が SVG に反映されたかの判定', async ({ page }) => {
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

  // 直したが SVG を作り直していない図
  await put(page, 'dma_state', doc('Dma state', 'Dma_Configure'));
  await exportSvg(page, 'dma_state', doc('Dma state', 'Dma_Configure'));
  await put(page, 'dma_state', doc('Dma state', 'Dma_Start'));
  // まだ直っていない図
  await put(page, 'adc_state', doc('Adc state', 'Dma_Configure'));
  await exportSvg(page, 'adc_state', doc('Adc state', 'Dma_Configure'));

  await page.locator('#btn-tab-inbox').click();
  await page.waitForSelector('#inbox-panel.open .ib-head');
  await page.waitForSelector('#ib-verify-head[data-state="done"]', { timeout: 120000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT, fullPage: false });

  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
});
