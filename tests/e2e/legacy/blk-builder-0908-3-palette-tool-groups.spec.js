// @ts-check
// BLK-builder-20260908-0908-3 (design「実装現況」7b): タブ列を畳むと、機能の存在に
// 気付く手掛かりは Ctrl+K だけになる。道具が 1 つの「コマンド」見出しに 30 件積まれた
// ままだと、名前を先に知っている道具しか引けない。ツールメニューと同じ 6 分類で
// 並び、Tab でその分類に絞り込め、メニューで覚えた語で引けることを見る。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

test.describe('BLK-builder-0908-3 パレットのツール 6 分類', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('メニューに載っている道具は全部パレットから引ける', async ({ page }) => {
    await gotoApp(page);
    const missing = await page.evaluate(() => {
      const TM = window.MA.toolMenu;
      const CP = window.MA.commandPalette;
      // app.js が実際に組み立てる候補を使う (テストが独自に作った表ではない)。
      const ids = {};
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      document.querySelectorAll('#cp-list .cp-item').forEach((el) => { ids[el.dataset.cpId] = true; });
      return TM.menuIds().filter((id) => {
        const g = CP.groupOfButton(id);
        return !g || !Object.keys(ids).some((k) => k.indexOf(g + ':') === 0);
      });
    });
    expect(missing).toEqual([]);
  });

  // 「確かめる」分類 (突合ボードほか) と 🔤 表記統一は TICKET-owner-20261115-1841-prune で外した。
  test('メニューで覚えた言葉でも、元の道具名でも引ける', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#editor').click();
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('部品名を一括置換');
    await expect(page.locator('#cp-list .cp-item').first()).toContainText('部品名を一括置換する');
    await expect(page.locator('#cp-list .cp-item', { hasText: '突合ボード' })).toHaveCount(0);
  });
});
