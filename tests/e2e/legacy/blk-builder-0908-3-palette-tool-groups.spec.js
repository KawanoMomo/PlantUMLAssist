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

  test('Tab で「確かめる」だけに絞り込める', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+k');
    // 「確かめる」の見出しに着くまで Tab を送る (前に add / jump などが並ぶ)。
    for (let i = 0; i < 12; i++) {
      const foot = await page.locator('#cp-foot').textContent();
      if (foot && foot.indexOf('(確かめる / Check)') >= 0) break;
      await page.keyboard.press('Tab');
    }
    await expect(page.locator('#cp-foot')).toContainText('(確かめる / Check)');
    await expect(page.locator('#cp-list .cp-group')).toHaveCount(1);
    await expect(page.locator('#cp-list .cp-item', { hasText: '突合ボード (表記揺れ' })).toHaveCount(1);
    await expect(page.locator('#cp-list .cp-item', { hasText: '引き継ぎ zip' })).toHaveCount(0);
  });

  test('メニューで覚えた言葉でも、元の道具名でも引ける', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('表記揺れ');
    // BLK-owner-20260924-1332-prune: 見つける ▦ 突合ボード が先頭、直す 🔤 表記統一 が次の 2 行
    // (旧 🔍 名前突合の行は無い)。
    await expect(page.locator('#cp-list .cp-item').first()).toContainText('突合ボード (表記揺れ');
    await expect(page.locator('#cp-list .cp-item')).toHaveCount(2);
    await expect(page.locator('#cp-list .cp-item').nth(1)).toContainText('表記を登録簿に揃える');
    await page.locator('#cp-input').fill('Name audit');
    // 旧 🔍 名前突合の名前で引くと、同じ事実を出す ▦ 突合ボードの 1 行に当たる。
    await expect(page.locator('#cp-list .cp-item', { hasText: '突合ボード (表記揺れ' })).toHaveCount(1);
  });

  test('選ぶとその道具が開く (畳んだ後も経路が残る)', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('変更サマリ');
    await page.locator('#cp-list .cp-item').first().click();
    await expect(page.locator('#cb-modal')).toBeVisible();
  });
});
