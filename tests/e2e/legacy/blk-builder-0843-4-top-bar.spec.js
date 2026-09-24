// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

// BLK-builder-20260907-0843-4 — design 1a「上部に残すのは状態表示と Export だけ」。
// 上部バーからは Open/Save/設定/Undo/Redo/ズーム/再描画が消え、
// 代わりに編集中のファイル名と `{モード} · {所要ms}` が出る。
test.describe('上部バーの整理 (design 1a)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => {
      Object.keys(localStorage).forEach(function(k) {
        if (k.indexOf('plantuml-autosave-') === 0 || k === 'plantuml-diagram-type'
          || k === 'plantuml-workspace') localStorage.removeItem(k);
      });
    });
    await page.reload();
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
  });

  test('常時ボタンは上部バーから消えている', async ({ page }) => {
    for (const id of ['#btn-open', '#btn-save', '#btn-config', '#btn-undo', '#btn-redo',
                      '#btn-zoom-in', '#btn-zoom-out', '#btn-zoom-fit', '#btn-render']) {
      await expect(page.locator(id)).toBeHidden();
    }
  });

  test('上部バーに残るのは検索・状態表示・Export', async ({ page }) => {
    await expect(page.locator('#btn-command-palette')).toBeVisible();
    await expect(page.locator('#top-file-name')).toBeVisible();
    await expect(page.locator('#top-render-status')).toBeVisible();
    await expect(page.locator('#btn-export')).toBeVisible();
  });

  // BLK-builder-20260924-1706-3 (design 7a / 9a): 図種は左レールが選ぶ。上部バーの
  // 「Sequence ▾」は画面から外し、Import ▾ / Export ▾ が右端に来る。要素は値の持ち主として残る。
  test('図種のプルダウンは上部バーに出ず、Export ▾ が右端に来る', async ({ page }) => {
    const box = await page.locator('#diagram-type').boundingBox();
    expect(box === null || (box.width <= 1 && box.height <= 1)).toBe(true);
    const bar = await page.locator('#toolbar').boundingBox();
    const exp = await page.locator('#btn-export').boundingBox();
    expect(bar.x + bar.width - (exp.x + exp.width)).toBeLessThan(24);
    // レールで替えると、残した select の値も追随する
    await page.locator('#rail-st').click();
    await expect(page.locator('#diagram-type')).toHaveValue('plantuml-state');
  });

  test('編集中のファイル名が出て、名前を変えると追随する', async ({ page }) => {
    const name = await page.locator('#top-file-name').textContent();
    expect(name).toMatch(/\.puml$/);
    await page.evaluate(() => {
      const ws = window.MA.workspace;
      ws.rename(ws.getActiveId(), 'gpio-seq');
      renderTabs();
    });
    await expect(page.locator('#top-file-name')).toHaveText('gpio-seq.puml');
  });

  test('状態表示はモードと所要時間を出す', async ({ page }) => {
    await expect(page.locator('#top-render-status')).toHaveText(/^local · /);
    // 描画が一度終われば `local · 24ms` の形で実測が出る
    await expect(page.locator('#top-render-status')).toHaveText(/^local · \d/, { timeout: 15000 });
  });

  // モード名の切り替えは tests/top-status.test.js の render() で確かめる。
  // ここで online を選ぶと DSL が plantuml.com へ送られるので E2E では触らない。

  test('外した操作はコマンドパレットから実行できる', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.locator('#cp-modal')).toHaveClass(/open/);
    await page.locator('#cp-input').fill('拡大');
    await page.keyboard.press('Enter');
    await expect(page.locator('#hud-percent')).toHaveText('110%');
  });
});
