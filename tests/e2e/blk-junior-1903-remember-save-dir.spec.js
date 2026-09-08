// @ts-check
// BLK-junior-20260908-1903 「GUI 起動のたびに保存先を打ち直す」。
//
// 保存先 (backend / fileDir) はマシンの置き場所として server が
// `.assist-prefs.json` に覚えている。だがその取り込みは「前回の DSL を復元する」
// 処理の中にあり、ワークスペースが残っているプロファイルでは丸ごと飛ばされていた。
// 覚えているのに設定は既定に戻り、毎回 ⚙設定 → file → フルパス打ち直しになる。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const DIR = 'E:\\01_Loop\\persona-data\\junior';
const WS = JSON.stringify({
  activeId: 'w1',
  docs: [{
    id: 'w1', name: 'gpio_init_sequence', diagramType: 'plantuml-sequence',
    dsl: '@startuml\nparticipant App\nApp -> Gpio : Init\n@enduml',
  }],
});

// server に「このマシンの保存先」を覚えさせる (設定ダイアログで一度決めた状態)。
async function rememberOnMachine(browser) {
  const c = await browser.newContext();
  const p = await c.newPage();
  await gotoApp(p);
  await p.evaluate((dir) => window.MA.autoSave.setConfig({ backend: 'file', fileDir: dir }), DIR);
  await p.waitForTimeout(800);
  await c.close();
}

// 覚えさせた後を片付ける。他の spec が既定の保存先を見ているので残さない。
async function forgetOnMachine(browser) {
  const c = await browser.newContext();
  const p = await c.newPage();
  await gotoApp(p);
  await p.evaluate(() => fetch('/prefs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backend: '', fileDir: '' }),
  }));
  await p.waitForTimeout(300);
  await c.close();
}

async function openSettings(page) {
  await page.locator('#btn-config').dispatchEvent('click');
  await page.waitForTimeout(500);
}

test.describe('BLK-junior-1903 保存先は起動をまたいで覚えている', () => {

  test.afterEach(async ({ browser }) => { await forgetOnMachine(browser); });

  test('まっさらなプロファイルで開いても、設定は前回の保存先が入った状態で出る', async ({ browser }) => {
    await rememberOnMachine(browser);
    const c = await browser.newContext();
    const page = await c.newPage();
    await gotoApp(page);
    await page.waitForTimeout(1200);
    await openSettings(page);
    // 打ち直さずに済む = バックエンドは file、欄には前回のフルパス
    await expect(page.locator('#cfg-file-dir')).toHaveValue(DIR);
    await expect(page.locator('#cfg-file-dir-row')).toBeVisible();
    await c.close();
  });

  test('前回のタブが残っているプロファイルでも保存先を取り込む', async ({ browser }) => {
    await rememberOnMachine(browser);
    const c = await browser.newContext();
    const page = await c.newPage();
    // ワークスペースだけ持ち、自動保存の設定は持たないプロファイル。
    // ここで取り込みが飛ばされていたのが今回の詰まりどころ。
    await page.addInitScript((ws) => {
      try { window.localStorage.setItem('plantuml-workspace', ws); } catch (e) {}
    }, WS);
    await gotoApp(page);
    await page.waitForTimeout(1200);
    const cfg = await page.evaluate(() => window.MA.autoSave.getConfig());
    expect(cfg.backend).toBe('file');
    expect(cfg.fileDir).toBe(DIR);
    await openSettings(page);
    await expect(page.locator('#cfg-file-dir')).toHaveValue(DIR);
    await c.close();
  });

  test('上部バーの保存先チップにも前回の保存先が出る (設定を開かなくても分かる)', async ({ browser }) => {
    await rememberOnMachine(browser);
    const c = await browser.newContext();
    const page = await c.newPage();
    await page.addInitScript((ws) => {
      try { window.localStorage.setItem('plantuml-workspace', ws); } catch (e) {}
    }, WS);
    await gotoApp(page);
    await page.waitForTimeout(1200);
    await expect(page.locator('#top-save-target')).toContainText('junior');
    await c.close();
  });

  test('このブラウザで別の保存先を指定していれば、そちらが勝つ', async ({ browser }) => {
    await rememberOnMachine(browser);
    const c = await browser.newContext();
    const page = await c.newPage();
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('plantuml-autosave-config', JSON.stringify({
          enabled: true, debounceMs: 1000, restoreMode: 'confirm',
          backend: 'file', fileDir: './test-results/autosave/blk-junior-1903-other',
        }));
      } catch (e) {}
    });
    await gotoApp(page);
    await page.waitForTimeout(1200);
    const cfg = await page.evaluate(() => window.MA.autoSave.getConfig());
    expect(cfg.fileDir).toBe('./test-results/autosave/blk-junior-1903-other');
    await c.close();
  });

  test('server が保存先を覚えていなければ既定のまま開く', async ({ browser }) => {
    await forgetOnMachine(browser);
    const c = await browser.newContext();
    const page = await c.newPage();
    await gotoApp(page);
    await page.waitForTimeout(1200);
    const cfg = await page.evaluate(() => window.MA.autoSave.getConfig());
    expect(cfg.backend).toBe('localStorage');
    expect(cfg.fileDir).toBe('./autosave');
    await c.close();
  });
});
