// @ts-check
// BLK-junior-20260908-0003: タブのダブルクリックで出る名前変更ダイアログの説明文が
// 「英数字・_ ・- のみ」のままで、実際には通る括弧付きの日本語名を毎回試すまで
// 確信が持てなかった。文言が実際の受理規則と合っていることをここで固定する。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const NAME = 'GPIOドライバ派生クラス(レビュー反映)';

async function freshWorkspace(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'localStorage', fileDir: './test-results/autosave/blk-junior-0003-name-rule-text/e2e-blk-j0003' }));
    } catch (e) {}
  });
}

test.describe('BLK-junior-0003 名前変更ダイアログの説明文', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('説明文が実際に通る書き方を示し、括弧付きの日本語名がそのまま付く', async ({ page }) => {
    await gotoApp(page);

    /** @type {string} */
    let promptText = '';
    page.on('dialog', async (d) => {
      promptText = d.message();
      await d.accept(NAME);
    });

    await page.locator('#tab-bar .tab').first().dblclick();
    await page.waitForTimeout(400);

    // 試さなくても分かる: 通る書き方が文言に出ている。
    expect(promptText).toContain('日本語');
    expect(promptText).toContain('空白');
    expect(promptText).toContain('括弧');
    // 実際より狭い古い制限が残っていない。
    expect(promptText).not.toContain('英数字');
    // 使えない文字は文言に出ている。
    for (const ch of ['<', '>', ':', '"', '|', '?', '*', '/']) {
      expect(promptText).toContain(ch);
    }

    // 文言どおり、括弧付きの日本語名がそのまま付く。
    await expect(page.locator('#tab-bar .tab').first()).toContainText(NAME);
  });
});
