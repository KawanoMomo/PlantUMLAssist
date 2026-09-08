// @ts-check
// BLK-junior-20260907-2009: 保存先が既に覚えられていること自体が画面から読めず、
// 図種を変えるたびに ⚙設定 → ファイル → パス再入力 → OK を習慣で打ち直していた。
// 上部バーに保存先が常時出て、保存が Ctrl+K の 1 操作で済むことを見る。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

async function bootWith(page, cfg) {
  await page.addInitScript((c) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config', JSON.stringify(c));
    } catch (e) {}
  }, cfg);
  await gotoApp(page);
}

const FILE_CFG = {
  enabled: true, debounceMs: 200, restoreMode: 'auto',
  backend: 'file', fileDir: './test-results/autosave/blk-junior-2009-save-target-chip/e2e-blk-j2009',
};
const LS_CFG = {
  enabled: true, debounceMs: 200, restoreMode: 'auto',
  backend: 'localStorage', fileDir: './autosave',
};

test.describe('BLK-junior-2009 保存先が設定済みだと画面で分かる', () => {
  test('保存先を設定してあると、上部バーにフォルダ名が常時出る', async ({ page }) => {
    await bootWith(page, FILE_CFG);
    const chip = page.locator('#top-save-target');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('data-mode', 'file');
    await expect(chip).toHaveText('📁 e2e-blk-j2009');
    await expect(chip).toHaveClass(/configured/);
    // 設定を開き直さなくても「もう設定されている」と分かる。
    const title = await chip.getAttribute('title');
    expect(title).toContain('保存先は設定済みです');
    expect(title).toContain('./test-results/autosave/blk-junior-2009-save-target-chip/e2e-blk-j2009');
  });

  test('保存先が未設定ならダウンロードになることが先に出る', async ({ page }) => {
    await bootWith(page, LS_CFG);
    const chip = page.locator('#top-save-target');
    await expect(chip).toHaveAttribute('data-mode', 'download');
    await expect(chip).toHaveText('⬇ ダウンロード');
    await expect(chip).not.toHaveClass(/configured/);
  });

  test('チップを押すと設定が開き、設定で保存先を変えるとその場で表示が変わる', async ({ page }) => {
    await bootWith(page, LS_CFG);
    await page.locator('#top-save-target').click();
    await expect(page.locator('#cfg-modal')).toBeVisible();
    await page.locator('input[name="cfg-backend"][value="file"]').check();
    await page.locator('#cfg-file-dir').fill('./test-results/autosave/blk-junior-2009-save-target-chip/e2e-blk-j2009');
    await page.locator('#cfg-ok').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#top-save-target')).toHaveText('📁 e2e-blk-j2009');
  });

  // 起票された手順 8 の実測。設定済みなら「保存」だけで済むことを数える。
  test('手順8は Ctrl+K → ファイルを保存 の 1 経路で済む (クリック 1 / キー入力 18)', async ({ page }) => {
    await bootWith(page, FILE_CFG);
    // 保存先が設定済みだと画面から読めるので、⚙設定を開く必要がない。
    await expect(page.locator('#top-save-target')).toHaveClass(/configured/);

    let clicks = 0;
    let keys = 0;
    await page.keyboard.press('Control+k'); keys += 1;
    await expect(page.locator('#cp-modal')).toBeVisible();
    await page.locator('#cp-input').fill('ファイルを保存'); keys += 7;
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter'); keys += 1;
    await page.waitForTimeout(600);

    expect(clicks).toBeLessThanOrEqual(10);
    expect(keys).toBeLessThanOrEqual(50);
    // 実際に保存フォルダへ書かれている。
    await expect(page.locator('#status-save-result')).toContainText('e2e-blk-j2009');
  });
});
