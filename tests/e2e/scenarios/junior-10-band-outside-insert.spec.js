// @ts-check
// junior 台本 シーケンス図 手順 4.5 (後半): 実行中の帯 (activate) の**下**の
// ライフライン線を押してメッセージを 1 本足すと、帯はそこで閉じたまま、
// 新しい矢印はその下に出る (帯が新しい矢印まで伸びない)。BLK-human-20260915-1204。
const { test, expect } = require('@playwright/test');
const { getEditorText } = require('../helpers');
const { bootPlain, typeDsl } = require('./_scenario');
const band = require('./_band');

test.describe('junior シーケンス 4.5: 帯の下にメッセージを足す', () => {
  test.beforeEach(async ({ page }) => {
    await bootPlain(page);
    await typeDsl(page, band.BAND_DSL);
    await page.waitForTimeout(1500);
  });

  test('帯の下を押すと「帯の外側」と出て、deactivate の後ろに入る', async ({ page }) => {
    const box = await band.bandBox(page);
    expect(box).not.toBe(null);

    // 帯の矩形の下端より 12px 下 = 帯を抜けたライフライン線の上。
    await band.clickPreviewAt(page, box.cx, box.y + box.h + 12);
    await expect(page.locator('#seq-modal')).toBeVisible();
    expect(await page.locator('#seq-pick-target').textContent()).toContain('帯の外側');

    await band.insertMessage(page, 'B', 'C');

    const lines = (await getEditorText(page)).split('\n');
    const deactivateIdx = lines.findIndex((l) => l.trim() === 'deactivate B');
    const newIdx = lines.findIndex((l) => /^B -> C/.test(l.trim()) && !/work/.test(l));
    expect(deactivateIdx).toBeGreaterThan(-1);   // deactivate は消えていない
    expect(newIdx).toBeGreaterThan(deactivateIdx);
  });

  test('足した矢印は帯の矩形の下端より下に描かれる (帯が伸びない)', async ({ page }) => {
    const before = await band.bandBox(page);
    const beforeHeight = before.h;

    await band.clickPreviewAt(page, before.cx, before.y + before.h + 12);
    await band.insertMessage(page, 'B', 'C');
    await page.waitForTimeout(1500);

    const after = await band.bandBox(page);
    expect(after).not.toBe(null);
    // 帯の高さが増えていない = 新しい矢印を飲み込んでいない (描画誤差ぶんだけ許す)。
    expect(after.h).toBeLessThan(beforeHeight + 4);

    const lines = (await getEditorText(page)).split('\n');
    const newLine = lines.findIndex((l) => /^B -> C/.test(l.trim()) && !/work/.test(l)) + 1;
    const arrowY = await band.messageYByLine(page, newLine);
    expect(arrowY).not.toBe(null);
    // 新しい矢印の y が帯の矩形の下端より大きい = 帯の外に出ている。
    expect(arrowY).toBeGreaterThan(after.y + after.h);
  });
});
