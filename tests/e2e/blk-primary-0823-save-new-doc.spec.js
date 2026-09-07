// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

// BLK-primary-20260907-0823 — 保存先ディレクトリを設定していても、
// 「⧉ テンプレート」で作った直後のタブが保存フォルダに現れなかった。
// 台本どおりの手順 (保存先を設定 → テンプレートから作る → 保存) をなぞる。
const DIR = './autosave-e2e-blk-p0823';

async function setFileBackend(page) {
  await page.evaluate((dir) => {
    window.MA.autoSave.setConfig({
      enabled: true, debounceMs: 500, restoreMode: 'none',
      backend: 'file', fileDir: dir,
    });
  }, DIR);
}

// 上部バーは design 1a で整理され、保存はコマンドパレット (Ctrl+K) 経由になった。
async function runSave(page) {
  await page.keyboard.press('Control+K');
  await page.locator('#cp-input').fill('保存');
  await page.locator('#cp-list .cp-item').first().click();
}

async function listFiles(page) {
  return page.evaluate((dir) => {
    return fetch('/autosave?dir=' + encodeURIComponent(dir))
      .then((r) => (r.ok ? r.json() : { files: [] }))
      .then((d) => (d && d.files) || []);
  }, DIR);
}

test.describe('新しく作った図が保存フォルダに現れる (BLK-primary-0823)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => {
      Object.keys(localStorage).forEach((k) => {
        if (k.indexOf('plantuml-') === 0) localStorage.removeItem(k);
      });
    });
    await page.reload();
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    await setFileBackend(page);
  });

  test('「＋」で作った新しいタブは、その場でフォルダに書き出される', async ({ page }) => {
    await page.locator('#btn-tab-new').click();
    // 開いていた図と新しい図の両方がフォルダに揃う (切替前の 1 枚も書き出される)
    const names = await page.evaluate(() => window.MA.workspace.list().map((d) => d.name));
    expect(names.length).toBe(2);
    await expect.poll(() => listFiles(page), { timeout: 8000 })
      .toEqual(expect.arrayContaining(names));
  });

  test('テンプレートから作った図が、作った時点でフォルダに現れる', async ({ page }) => {
    // テンプレート元になる図をまず 1 枚フォルダに用意する
    await page.locator('#editor').fill('@startuml\nstate Adc_Idle\nstate Adc_Done\nAdc_Idle --> Adc_Done\n@enduml');
    await page.waitForTimeout(1200);
    await page.locator('#btn-tab-template').click();
    await page.waitForSelector('#btn-tpl-create');
    await page.locator('#tpl-from').fill('Adc');
    await page.locator('#tpl-to').fill('Timer');
    await page.locator('#tpl-name').fill('timer_state');
    // 残っている部品名は「このままで良い」にする
    const keeps = page.locator('#tpl-modal input[type="checkbox"]');
    const n = await keeps.count();
    for (let i = 0; i < n; i++) await keeps.nth(i).check();
    await expect(page.locator('#btn-tpl-create')).toBeEnabled();
    await page.locator('#btn-tpl-create').click();

    await expect.poll(() => listFiles(page), { timeout: 8000 })
      .toContain('timer_state');
  });

  test('「保存」を押すと保存先に書かれ、どこに書いたかが画面に出る', async ({ page }) => {
    await page.locator('#btn-tab-new').click();
    await page.waitForTimeout(500);
    await page.locator('#editor').fill('@startuml\nactor SAVE_MARKER\n@enduml');
    await page.waitForTimeout(300);

    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    await runSave(page);

    await expect(page.locator('#status-save-result')).toContainText('に保存しました', { timeout: 8000 });
    await expect(page.locator('#status-save-result')).toContainText(DIR);
    // 保存先運用ではダウンロードは起こさない
    expect(downloaded).toBe(false);

    // 実際にその内容が書かれている
    const name = await page.evaluate(() => window.MA.workspace.getActive().name);
    const text = await page.evaluate(([n, dir]) => {
      return fetch('/autosave?type=' + encodeURIComponent(n) + '&dir=' + encodeURIComponent(dir))
        .then((r) => (r.ok ? r.text() : ''));
    }, [name, DIR]);
    expect(text).toContain('SAVE_MARKER');
  });

  test('保存先を使わない設定 (localStorage) では、従来どおりダウンロードになる', async ({ page }) => {
    await page.evaluate(() => {
      window.MA.autoSave.setConfig({
        enabled: true, debounceMs: 500, restoreMode: 'none',
        backend: 'localStorage', fileDir: './autosave',
      });
    });
    const dl = page.waitForEvent('download', { timeout: 8000 });
    await runSave(page);
    const file = await dl;
    expect(file.suggestedFilename()).toMatch(/\.puml$/);
    await expect(page.locator('#status-save-result')).toContainText('ダウンロード');
  });
});
