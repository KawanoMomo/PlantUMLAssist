// @ts-check
// BLK-builder-20260907-1250-2 / design 5c「Sequence — 途中に挿入」の「その他」。
// 挿入メニューの最後は「その他（区切り線 / 遅延 / 参照）」で、開くと 3 つが並ぶ。
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText } = require('../helpers');

// BLK-primary-20260907-0356 の spec と同じ経路: プレビュー下端の隙間をクリックする。
async function openPicker(page) {
  await page.evaluate(() => {
    var container = document.getElementById('preview-container');
    var overlay = document.getElementById('overlay-layer');
    var ovRect = overlay.getBoundingClientRect();
    container.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: ovRect.left + ovRect.width / 2,
      clientY: ovRect.bottom - 20,
    }));
  });
  await page.waitForTimeout(400);
}

test.describe('BLK-builder-1250 挿入メニューの「その他」 (design 5c)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);
  });

  test('1 段目の最後が「その他（区切り線 / 遅延 / 参照）」', async ({ page }) => {
    await openPicker(page);
    await expect(page.locator('#seq-pick-other')).toBeVisible();
    await expect(page.locator('#seq-pick-other')).toContainText('区切り線');
    await expect(page.locator('#seq-pick-other')).toContainText('遅延');
    await expect(page.locator('#seq-pick-other')).toContainText('参照');
  });

  test('押すと 2 段目に 区切り線 / 遅延 / 参照 が並ぶ', async ({ page }) => {
    await openPicker(page);
    await page.locator('#seq-pick-other').click();
    await expect(page.locator('#seq-pick-separator')).toBeVisible();
    await expect(page.locator('#seq-pick-delay')).toBeVisible();
    await expect(page.locator('#seq-pick-ref')).toBeVisible();
    // BLK-builder-20260907-1418-3: 「その他のブロック」の 1 行は design 5d に合わせ、
    // par / break / critical … の種別ごとの行に置き換わった。
    await expect(page.locator('#seq-modal [data-kind="block:par"]')).toBeVisible();
  });

  test('2 段目からは「← 種別を選び直す」で 1 段目に戻れる', async ({ page }) => {
    await openPicker(page);
    await page.locator('#seq-pick-other').click();
    await page.locator('#seq-pick-back').click();
    await expect(page.locator('#seq-pick-message')).toBeVisible();
    await expect(page.locator('#seq-pick-other')).toBeVisible();
  });

  test('区切り線を入れると `== 本文 ==` が狙った行に入る', async ({ page }) => {
    await openPicker(page);
    await page.locator('#seq-pick-other').click();
    await page.locator('#seq-pick-separator').click();
    await page.locator('#seq-mod-mtext').fill('要求ここまで');
    await page.locator('#seq-mod-confirm').click();
    await page.waitForTimeout(600);
    expect(await getEditorText(page)).toContain('== 要求ここまで ==');
  });

  test('遅延を入れると `... 本文 ...` が入る', async ({ page }) => {
    await openPicker(page);
    await page.locator('#seq-pick-other').click();
    await page.locator('#seq-pick-delay').click();
    await page.locator('#seq-mod-mtext').fill('応答待ち');
    await page.locator('#seq-mod-confirm').click();
    await page.waitForTimeout(600);
    expect(await getEditorText(page)).toContain('... 応答待ち ...');
  });

  test('参照を入れると `ref over 参加者 : 本文` が入る', async ({ page }) => {
    await openPicker(page);
    await page.locator('#seq-pick-other').click();
    await page.locator('#seq-pick-ref').click();
    await page.locator('#seq-mod-rtarget').selectOption('System');
    await page.locator('#seq-mod-mtext').fill('認証シーケンス');
    await page.locator('#seq-mod-confirm').click();
    await page.waitForTimeout(600);
    expect(await getEditorText(page)).toContain('ref over System : 認証シーケンス');
  });

  test('挿入は Ctrl+Z 1 回で元に戻る', async ({ page }) => {
    await openPicker(page);
    await page.locator('#seq-pick-other').click();
    await page.locator('#seq-pick-delay').click();
    await page.locator('#seq-mod-confirm').click();
    await page.waitForTimeout(600);
    const after = await getEditorText(page);
    expect(after).toContain('...');
    await page.locator('#editor').press('Control+z');
    await page.waitForTimeout(500);
    expect(await getEditorText(page)).not.toBe(after);
  });
});
