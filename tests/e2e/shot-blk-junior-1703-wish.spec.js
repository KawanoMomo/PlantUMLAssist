const { test } = require('@playwright/test');
const { gotoApp, saveDirFor, shotOut } = require('./helpers');

// BLK-junior-20260908-1703-wish の画面写真。GpioDrv から 5 本出ている図で
// 「差分を図で色付け」を押し、先輩がラベルを足した 1 本 (IrqCtrl への依存) だけが
// 緑で囲まれているところを撮る。
const DIR = saveDirFor(__filename);
const REF_DIR = DIR + '/primary';
const CHILD = 'GPIOドライバ構成_先輩反映';
const PARENT = 'GPIOドライバ構成_primary';

const CHILD_DSL = [
  '@startuml',
  'component "GPIO Driver" as GpioDrv',
  'component IrqCtrl',
  'component Power_Ctrl',
  'component Timer',
  'component Clock',
  'component Uart',
  'GpioDrv --> Power_Ctrl',
  'GpioDrv ..> IrqCtrl',
  'GpioDrv --> Timer',
  'GpioDrv ..> Clock',
  'GpioDrv --> Uart',
  '@enduml',
].join('\n');
const PARENT_V2 = CHILD_DSL.replace('GpioDrv ..> IrqCtrl', 'GpioDrv ..> IrqCtrl : 割り込み登録');

async function put(page, dir, name, dsl) {
  await page.evaluate((a) => fetch('/autosave', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
  }).then((r) => r.ok), { name, dsl, dir });
}

test('shot: 継承元の差分に対応する矢印だけが図の上で色付く', async ({ page }) => {
  test.setTimeout(120000);
  await gotoApp(page);
  await page.evaluate(() => window.MA.lineage.reset());
  await page.evaluate((a) => {
    window.MA.autoSave.setConfig({
      enabled: true, debounceMs: 500, restoreMode: 'none', backend: 'file', fileDir: a.dir,
    });
    window.MA.workspace.rename(window.MA.workspace.getActiveId(), a.name);
  }, { dir: DIR, name: CHILD });
  await page.locator('#editor').fill(CHILD_DSL);
  await page.waitForTimeout(1200);

  await put(page, REF_DIR, PARENT, CHILD_DSL);
  await page.locator('#btn-tab-lineage').click();
  await page.locator('#lg-dir').fill(REF_DIR);
  await page.locator('#lg-dir').dispatchEvent('change');
  await page.waitForTimeout(400);
  await page.locator('#lg-parent').selectOption(PARENT);
  await page.locator('#lg-set').click();
  await page.waitForTimeout(400);
  await page.locator('#lg-close').click();

  // 先輩がラベルを足す → 開いて「差分を図で色付け」1 クリック
  await put(page, REF_DIR, PARENT, PARENT_V2);
  await page.locator('#btn-tab-lineage').click();
  await page.waitForSelector('#lg-diff');
  await page.locator('#lg-mark').click();
  await page.waitForSelector('#overlay-layer rect.lg-mark');
  await page.waitForTimeout(300);
  await page.locator('#preview-pane').screenshot({ path: shotOut('shot-blk-junior-1703-wish.png') });
});
