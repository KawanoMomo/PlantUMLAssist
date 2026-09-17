// @ts-check
// junior 台本 シーケンス図 手順 4.5 (前半): 実行中の帯 (activate) の**中**を押して
// メッセージを 1 本足すと、今までどおり帯の中に入る。
// BLK-human-20260915-1204。後半 (帯の下) は junior-12-band-outside-insert.spec.js。
const { test, expect } = require('@playwright/test');
const { getEditorText } = require('../helpers');
const { bootPlain, typeDsl } = require('./_scenario');
const band = require('./_band');

test.describe('junior シーケンス 4.5: 帯の中にメッセージを足す', () => {
  test.beforeEach(async ({ page }) => {
    await bootPlain(page);
    await typeDsl(page, band.BAND_DSL);
    await page.waitForTimeout(1500);
  });

  test('帯の矩形の中を押すと「帯の内側」と出て、deactivate より前に入る', async ({ page }) => {
    const box = await band.bandBox(page);
    expect(box).not.toBe(null);

    await band.clickPreviewAt(page, box.cx, box.y + box.h / 2);
    await expect(page.locator('#seq-modal')).toBeVisible();
    // 押す前にどちらに入るかが読める (ピッカーの見出し)。
    expect(await page.locator('#seq-pick-target').textContent()).toContain('帯の内側');

    await band.insertMessage(page, 'B', 'C');

    const lines = (await getEditorText(page)).split('\n');
    const newIdx = lines.findIndex((l) => /^B -> C/.test(l.trim()) && !/work/.test(l));
    const deactivateIdx = lines.findIndex((l) => l.trim() === 'deactivate B');
    expect(newIdx).toBeGreaterThan(-1);
    expect(newIdx).toBeLessThan(deactivateIdx);
  });

  test('足した矢印は帯の矩形の中に描かれる', async ({ page }) => {
    const before = await band.bandBox(page);
    await band.clickPreviewAt(page, before.cx, before.y + before.h / 2);
    await band.insertMessage(page, 'B', 'C');
    await page.waitForTimeout(1500);

    const after = await band.bandBox(page);
    const lines = (await getEditorText(page)).split('\n');
    const newLine = lines.findIndex((l) => /^B -> C/.test(l.trim()) && !/work/.test(l)) + 1;
    const arrowY = await band.messageYByLine(page, newLine);
    expect(arrowY).not.toBe(null);
    // 新しい矢印は帯の下端より上 = 帯の中。
    expect(arrowY).toBeLessThan(after.y + after.h);
    expect(arrowY).toBeGreaterThan(after.y);
  });

  // BLK-junior-20260918-0149: 押した場所が効いたことが図の上でも分かる
  // (選択は外れるので、跡が無いと「押しても何も起きない」に見えていた)。
  test('押した帯の内側が図の上に残り、ピッカーはそれを隠さない', async ({ page }) => {
    const box = await band.bandBox(page);
    await band.clickPreviewAt(page, box.cx, box.y + box.h / 2);
    await expect(page.locator('#seq-modal')).toBeVisible();
    const mark = page.locator('#overlay-layer rect[data-type="band-pick"]');
    await expect(mark).toHaveCount(1);
    expect(await mark.getAttribute('data-zone')).toBe('inside');
    expect(await page.locator('#overlay-layer text[data-type="band-pick"]').textContent()).toContain('帯の内側');
    // ピッカーは押した帯を覆わない (帯と跡を見ながら選べる)。
    const modalBox = await page.locator('#seq-modal-content').boundingBox();
    const markBox = await mark.boundingBox();
    expect(markBox.x + markBox.width < modalBox.x || markBox.x > modalBox.x + modalBox.width).toBe(true);
    // 閉じれば跡も消える。
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(mark).toHaveCount(0);
  });
});
