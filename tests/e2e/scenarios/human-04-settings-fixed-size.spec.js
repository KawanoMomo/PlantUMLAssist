// @ts-check
// BLK-human-20260916-0903 — 人間の台本「⚙設定のタブを続けて切り替える」。
//
// タブごとに中身の高さが違い、切り替えるたびにダイアログの大きさとタブ列の位置が動いて、
// 続けて次のタブを押すと狙いが外れていた。到達条件は「全タブを順に押しても #cfg-tabs と
// ダイアログと保存ボタンの矩形が変わらず、収まらない中身は中身側だけが縦に流れる」こと。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

async function rects(page) {
  return page.evaluate(() => {
    const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(Math.round); };
    return { tabs: r('#cfg-tabs'), box: r('#cfg-modal-content'), ok: r('#cfg-ok') };
  });
}

for (const vp of [{ width: 1400, height: 900 }, { width: 900, height: 500 }]) {
  test(`人間 手順 4 — 設定の全タブを順に押してもタブ列と大きさが動かない (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await gotoApp(page);
    await page.locator('#rail-config').click();
    await expect(page.locator('#cfg-modal')).toBeVisible();
    const ids = await page.$$eval('#cfg-tabs .cfg-tab', (els) => els.map((e) => e.id));
    expect(ids.length).toBeGreaterThanOrEqual(7);
    const first = await rects(page);
    let scrolled = false;
    for (const id of ids.concat(ids.slice().reverse())) {
      await page.locator('#' + id).click();
      await expect(page.locator('#' + id)).toHaveClass(/active/);
      expect(await rects(page)).toEqual(first);
      const over = await page.evaluate(() => { const p = document.getElementById('cfg-panes'); return p.scrollHeight > p.clientHeight; });
      if (over) scrolled = true;
    }
    // タブ列と保存ボタンは常に画面の中に見えている
    expect(first.box[1]).toBeGreaterThanOrEqual(0);
    expect(first.box[1] + first.box[3]).toBeLessThanOrEqual(vp.height);
    await expect(page.locator('#cfg-ok')).toBeInViewport();
    // 収まらないタブ (ショートカット) は中身だけが流れる
    expect(scrolled).toBe(true);
  });
}
