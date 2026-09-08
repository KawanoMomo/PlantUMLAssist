// @ts-check
// BLK-builder-20260907-1418-3 / design 5d 網羅表「Sequence のその他パレット: par / break / critical」。
// 「その他」の 2 段目にブロック種別が「何が起きるか」の行として並び、
// 押すとその種別が選ばれた状態でフォームが開く。
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText } = require('../helpers');

// 図の隙間をクリックすると挿入メニューが開く (BLK-builder-1346-2 の spec と同じ入口)。
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

test.describe('BLK-builder-1418 Sequence のブロックパレット (design 5d)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);
  });

  test('「その他」に par / break / critical が説明つきで並ぶ', async ({ page }) => {
    await clickGap(page);
    await expect(page.locator('#seq-modal')).toBeVisible();

    await page.locator('#seq-modal [data-kind="other"]').click();
    await page.waitForTimeout(300);

    const texts = (await page.locator('#seq-modal .seq-pick-btn').allTextContents()).join('\n');
    for (const desc of ['区切り線', '遅延', '参照', '並行して進む', '途中で抜ける', '割り込まれては困る区間']) {
      expect(texts).toContain(desc);
    }
    expect(texts).not.toContain('その他のブロック');
  });

  test('行を押すとその種別で枠が入る', async ({ page }) => {
    await clickGap(page);
    await expect(page.locator('#seq-modal')).toBeVisible();

    await page.locator('#seq-modal [data-kind="other"]').click();
    await page.waitForTimeout(300);
    await page.locator('#seq-modal [data-kind="block:par"]').click();
    await page.waitForTimeout(300);

    // 選んだ種別が Kind に入っている (記法だけでなく説明つきで出る)。
    await expect(page.locator('#seq-mod-bkind')).toHaveValue('par');
    const opts = (await page.locator('#seq-mod-bkind option').allTextContents()).join('\n');
    expect(opts).toContain('並行して進む (par)');

    await page.locator('#seq-mod-blabel').fill('二系統');
    await page.locator('#seq-mod-confirm').click();
    await page.waitForTimeout(500);

    const dsl = await getEditorText(page);
    expect(dsl).toContain('par 二系統');
    expect(dsl).toContain('end');
  });
});
