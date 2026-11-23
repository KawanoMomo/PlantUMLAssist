// @ts-check
// TICKET-owner-20261123-1922-3: Ctrl+S の直後に出る「✓ 時刻 名前 をダウンロード / 保存しました」の札が上部バーから
// はみ出し、タブ列 (タブ・＋・ツール ▾) とプレビューの見出しに約 5 秒重なっていた。
// 期待 (principles「横に出す枠は編集中の図とその操作を覆わない」):
//   - 幅 1280 / 1600 で、Ctrl+S の 400ms 後の札の矩形が上部バーの中にあり、タブ列の子とプレビューの見出しに交わらない
//   - 札の語 (時刻・どこへ) は今のまま読める
//   - 札が出ている間に「ツール ▾」を実マウスで押すと開く
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

for (const width of [1280, 1600]) {
  test('owner 1922-3 幅 ' + width + ' で保存直後の札は上部バーに収まり、タブ列とプレビューの見出しを覆わない', async ({ page }, testInfo) => {
    test.setTimeout(60 * 1000);
    await page.setViewportSize({ width: width, height: 800 });
    await H.bootWith(page, null);

    // 既定の画面で本文を 1 行直して Ctrl+S (実キー)。
    await page.locator('#editor').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type("\n' x");
    const dl = page.waitForEvent('download');
    await page.keyboard.press('Control+s');
    await dl;
    const flash = page.locator('#top-save-flash');
    await expect(flash).toBeVisible();
    await page.waitForTimeout(400);

    // 札の語は今のまま (時刻と、どこへ)。
    await expect(flash).toHaveText(/\d\d:\d\d:\d\d/);
    await expect(flash).toContainText('.puml をダウンロード');

    const r = await page.evaluate(() => {
      const box = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      const fe = /** @type {HTMLElement} */ (document.getElementById('top-save-flash'));
      const f = box(fe);
      // 語が省略されずに全部見えている (いつ・どこへが読める)。
      const clipped = fe.scrollWidth > fe.clientWidth + 1;
      const bar = box(document.getElementById('toolbar'));
      const cross = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
      const hits = [];
      // タブ列の子・プレビューの見出しに加え、上部バーの押す入口 (保存・検索欄・Import / Export) も覆わない。
      const targets = Array.from(document.querySelectorAll('#tab-bar > *, #tab-bar .tab, #tab-bar button, #preview-pane-header, #top-save, #btn-command-palette, #toolbar .export-wrap'));
      for (const el of targets) {
        if (!(/** @type {HTMLElement} */ (el)).offsetParent) continue;
        if (cross(f, box(el))) hits.push((el.id || el.className) + ':' + ((/** @type {HTMLElement} */ (el)).innerText || '').replace(/\s+/g, ' ').trim());
      }
      return { f, bar, hits, clipped };
    });
    H.annotate(testInfo, 'flash', JSON.stringify(r.f));
    expect(r.hits).toEqual([]);
    expect(r.clipped).toBe(false);
    expect(r.f.t).toBeGreaterThanOrEqual(r.bar.t);
    expect(r.f.b).toBeLessThanOrEqual(r.bar.b);
    expect(r.f.l).toBeGreaterThanOrEqual(r.bar.l);
    expect(r.f.r).toBeLessThanOrEqual(r.bar.r);
    await page.screenshot({ path: testInfo.outputPath('flash-' + width + '.png'), clip: { x: 0, y: 0, width: width, height: 90 } });

    // 札が出ている間にツール ▾ を実マウスで押すと開く。
    await expect(flash).toBeVisible();
    const tools = await page.locator('#btn-tab-tools').boundingBox();
    expect(tools).not.toBeNull();
    if (!tools) return;
    await page.mouse.click(tools.x + tools.width / 2, tools.y + tools.height / 2);
    await expect(page.locator('#tool-menu')).toBeVisible();
  });
}
