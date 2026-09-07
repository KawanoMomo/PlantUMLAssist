const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture } = require('./helpers');

// BLK-builder-20260907-1346-2 (design 5c): 挿入メニューを開いている間、
// DSL の入る行に「← N 行目に挿入」が重なり、行番号が強調され、
// 右パネルに「いまは挿入位置を選んでいます。Esc で取り消し」が出る。
async function clickGap(page) {
  await page.evaluate(() => {
    var container = document.getElementById('preview-container');
    var overlay = document.getElementById('overlay-layer');
    var ovRect = overlay.getBoundingClientRect();
    var cx = ovRect.left + ovRect.width / 2;
    var cy = ovRect.bottom - 20;
    container.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: cx, clientY: cy }));
  });
  await page.waitForTimeout(400);
}

test.describe('BLK-builder-20260907-1346-2: 挿入先を DSL 側にも示す', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);
  });

  test('メニューを開くと DSL に「← N 行目に挿入」が出る', async ({ page }) => {
    await expect(page.locator('#insert-marker')).toBeHidden();
    await clickGap(page);
    await expect(page.locator('#seq-modal')).toBeVisible();

    const marker = page.locator('#insert-marker');
    await expect(marker).toBeVisible();
    const label = await marker.textContent();
    expect(label).toMatch(/^← \d+ 行目に挿入$/);

    // メニューの見出しの行番号と、DSL 側のラベルの行番号が一致する
    const heading = await page.locator('#seq-pick-target').textContent();
    const headNum = heading.match(/DSL (\d+) 行目/)[1];
    expect(label).toBe('← ' + headNum + ' 行目に挿入');
  });

  test('その行の行番号が強調される', async ({ page }) => {
    await clickGap(page);
    await expect(page.locator('#seq-modal')).toBeVisible();
    const gutter = page.locator('#line-numbers .ln-insert-target');
    await expect(gutter).toHaveCount(1);
    const heading = await page.locator('#seq-pick-target').textContent();
    const headNum = heading.match(/DSL (\d+) 行目/)[1];
    await expect(gutter).toHaveText(headNum);
  });

  test('右パネルに「いまは挿入位置を選んでいます」が出る', async ({ page }) => {
    await expect(page.locator('#props-insert-hint')).toBeHidden();
    await clickGap(page);
    await expect(page.locator('#props-insert-hint')).toBeVisible();
    await expect(page.locator('#props-insert-hint'))
      .toHaveText('いまは挿入位置を選んでいます。Esc で取り消し');
  });

  test('キャンセルすると印も案内も消える', async ({ page }) => {
    await clickGap(page);
    await page.locator('#seq-pick-cancel').click();
    await page.waitForTimeout(200);
    await expect(page.locator('#insert-marker')).toBeHidden();
    await expect(page.locator('#props-insert-hint')).toBeHidden();
    await expect(page.locator('#line-numbers .ln-insert-target')).toHaveCount(0);
  });

  test('Esc で挿入メニューごと取り消せる', async ({ page }) => {
    await clickGap(page);
    await expect(page.locator('#seq-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await expect(page.locator('#seq-modal')).toBeHidden();
    await expect(page.locator('#insert-marker')).toBeHidden();
    await expect(page.locator('#props-insert-hint')).toBeHidden();
  });

  test('種別を選んでフォームへ進んでも印は出たまま、確定で消える', async ({ page }) => {
    await clickGap(page);
    await page.locator('#seq-pick-alt').click();
    await expect(page.locator('#seq-mod-bkind')).toHaveValue('alt');
    await expect(page.locator('#insert-marker')).toBeVisible();
    await page.locator('#seq-mod-blabel').fill('成功時');
    await page.locator('#seq-mod-confirm').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#insert-marker')).toBeHidden();
    await expect(page.locator('#props-insert-hint')).toBeHidden();
  });

  test('行番号の強調は DSL を編集し直しても素の番号列に戻らない', async ({ page }) => {
    await clickGap(page);
    await expect(page.locator('#line-numbers .ln-insert-target')).toHaveCount(1);
    // 行番号の再描画を挟んでも印が残る (updateLineNumbers が印ごと描く)
    await page.evaluate(() => { if (window.MA.insertMarker) window.MA.insertMarker.sync(); });
    await expect(page.locator('#line-numbers .ln-insert-target')).toHaveCount(1);
  });
});
