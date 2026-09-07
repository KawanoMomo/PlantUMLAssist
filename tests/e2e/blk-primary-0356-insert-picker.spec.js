const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText } = require('./helpers');

// BLK-primary-20260907-0356 (design 5c): プレビュー上でメッセージの隙間をクリックすると
// 種別メニューが開き、DSL の何行目に入るかが示され、alt / loop / activate / note を
// その位置に挿入できる。
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

test.describe('BLK-primary-20260907-0356: 挿入位置の種別ピッカー', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);
  });

  test('隙間クリックで 6 種別のメニューが開き、挿入先の行番号が出る', async ({ page }) => {
    await clickGap(page);
    await expect(page.locator('#seq-modal')).toBeVisible();
    // BLK-builder-20260907-1250-2: 6 つ目は design 5c どおり
    // 「その他（区切り線 / 遅延 / 参照）」の見出しになり、block はその下位メニューへ移った。
    for (const id of ['message', 'note', 'alt', 'loop', 'activation', 'other']) {
      await expect(page.locator('#seq-pick-' + id)).toBeVisible();
    }
    await page.locator('#seq-pick-other').click();
    // BLK-builder-20260907-2320-1: design 5d 以降、「その他のブロック」の 1 行は
    // par / break / critical … の行に分かれた。id は `block:par` を CSS で拾えるよう
    // `seq-pick-block-par` に均してある。
    await expect(page.locator('#seq-pick-block-par')).toBeVisible();
    await page.locator('#seq-pick-back').click();
    const target = await page.locator('#seq-pick-target').textContent();
    expect(target).toMatch(/DSL \d+ 行目に挿入/);
  });

  test('alt を選ぶと alt/end がその位置に入る', async ({ page }) => {
    const before = await getEditorText(page);
    await clickGap(page);
    await page.locator('#seq-pick-alt').click();
    await expect(page.locator('#seq-mod-bkind')).toHaveValue('alt');
    await page.locator('#seq-mod-blabel').fill('成功時');
    await page.locator('#seq-mod-confirm').click();
    await page.waitForTimeout(500);
    const after = await getEditorText(page);
    expect(after).not.toBe(before);
    expect(after).toContain('alt 成功時');
    expect(after.split('\n').filter((l) => l.trim() === 'end').length).toBe(1);
  });

  test('loop を選ぶと Kind が loop で初期選択される', async ({ page }) => {
    await clickGap(page);
    await page.locator('#seq-pick-loop').click();
    await expect(page.locator('#seq-mod-bkind')).toHaveValue('loop');
  });

  test('activate をその位置に挿入できる', async ({ page }) => {
    await clickGap(page);
    await page.locator('#seq-pick-activation').click();
    await page.locator('#seq-mod-confirm').click();
    await page.waitForTimeout(500);
    const after = await getEditorText(page);
    expect(after).toMatch(/^activate \S+$/m);
  });

  test('種別を選び直せる', async ({ page }) => {
    await clickGap(page);
    await page.locator('#seq-pick-note').click();
    await expect(page.locator('#seq-mod-npos')).toBeVisible();
    await page.locator('#seq-mod-back').click();
    await expect(page.locator('#seq-pick-message')).toBeVisible();
  });

  test('キャンセルで DSL が変わらない', async ({ page }) => {
    const before = await getEditorText(page);
    await clickGap(page);
    await page.locator('#seq-pick-cancel').click();
    await expect(page.locator('#seq-modal')).toBeHidden();
    expect(await getEditorText(page)).toBe(before);
  });
});
