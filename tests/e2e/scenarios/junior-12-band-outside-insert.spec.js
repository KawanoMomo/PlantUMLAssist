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

  test('帯の最後のメッセージを選んで「この後に追加」→ 既定で帯を閉じてその下に入る', async ({ page }) => {
    // 8 行目 B --> A : res が帯の最後のメッセージ。実マウスで矢印を押して選ぶ。
    const r = await page.evaluate(() => {
      const el = document.querySelector('#overlay-layer rect[data-type="message"][data-line="8"]');
      const b = el.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    await page.mouse.click(r.x, r.y);
    await page.waitForTimeout(400);
    await page.locator('.seq-insert-msg-after').first().click();
    await expect(page.locator('#seq-band-choice-outside')).toBeVisible();
    await expect(page.locator('#seq-band-choice-inside')).toBeVisible();
    await expect(page.locator('#seq-band-choice-outside')).toBeFocused();
    await page.locator('#seq-band-choice-outside').click();
    await page.locator('#seq-mod-from').selectOption('B');
    await page.locator('#seq-mod-to').selectOption('C');
    // BLK-owner-20260924-2259-prune: 窓の矢印も末尾に追加・選択パネルと同じ 4 つのボタン +「その他の矢印…」で選ぶ。
    const seg = page.locator('#seq-mod-arrow-seg .prop-seg');
    await expect(seg).toHaveCount(4);
    await expect(page.locator('#seq-mod-arrow-more-btn')).toContainText('その他の矢印');
    await seg.filter({ hasText: '非同期' }).click();
    await expect(seg.filter({ hasText: '非同期' })).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#seq-mod-confirm').click();
    await page.waitForTimeout(1500);

    const lines = (await getEditorText(page)).split('\n').map((l) => l.trim());
    const deactivateIdx = lines.indexOf('deactivate B');
    const newIdx = lines.findIndex((l) => /^B ->> C/.test(l) && !/work/.test(l));
    expect(deactivateIdx).toBeGreaterThan(-1);
    expect(newIdx).toBe(deactivateIdx + 1);
    const box = await band.bandBox(page);
    const arrowY = await band.messageYByLine(page, newIdx + 1);
    expect(arrowY).toBeGreaterThan(box.y + box.h);
  });

  // BLK-junior-20260918-0149: 押した場所が効いたことが図の上でも分かる
  // (選択は外れるので、跡が無いと「押しても何も起きない」に見えていた)。
  test('押した帯の下が図の上に残り、ピッカーはそれを隠さない', async ({ page }) => {
    const box = await band.bandBox(page);
    await band.clickPreviewAt(page, box.cx, box.y + box.h + 12);
    await expect(page.locator('#seq-modal')).toBeVisible();
    const mark = page.locator('#overlay-layer rect[data-type="band-pick"]');
    await expect(mark).toHaveCount(1);
    expect(await mark.getAttribute('data-zone')).toBe('outside');
    expect(await page.locator('#overlay-layer text[data-type="band-pick"]').textContent()).toContain('帯の外側');
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
