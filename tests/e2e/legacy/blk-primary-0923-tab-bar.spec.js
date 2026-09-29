// @ts-check
// BLK-primary-20260907-0923: design 1a の左レールでエディタペインが狭くなった後、
// #tab-bar の道具 (📂 一覧 / ⇄ 一括置換 / 🔍 名前突合 / ⇉ 系統チェック / ✎ 行編集 /
// ⇔ 並べて見る / ⧉ テンプレート / ± 差分) が 1 文字ずつ縦に折り返されて幅 29px に潰れ、
// どれが何のボタンか画面から判別できなくなっていた。潰れないこと (横スクロールで逃がす)
// と、同じ道具が Ctrl+K のパレットからも名前で呼べることを見る。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const TOOLS = [
  'btn-tab-new',
  'btn-tab-folder',
  'btn-tab-rename',
  // BLK-owner-20260924-1332-prune: 🔍 名前突合は ▦ 突合ボードに畳んだ
  'btn-tab-cross',
  'btn-tab-family',
  'btn-tab-lines',
  // BLK-owner-20260923-1509-prune: ⇔ 並べて見る は「並べて比較」1 つに畳み、タブバーのボタンは無くなった
  'btn-tab-template',
  'btn-tab-diff',
];

test.describe('BLK-primary-0923 タブバーが潰れない', () => {
  test('どのボタンも 1 行のまま。縦に折り返さない', async ({ page }) => {
    await gotoApp(page);
    for (const id of TOOLS) {
      const box = await page.locator('#' + id).boundingBox();
      expect(box, id).not.toBeNull();
      if (!box) continue;
      // 1 行分の高さ (font-size 11px + padding) に収まっていれば折り返していない。
      expect(box.height, id + ' の高さ').toBeLessThan(40);
      // ＋ 以外はラベルを持つので、1 文字幅 (29px) には潰れない。
      if (id !== 'btn-tab-new') expect(box.width, id + ' の幅').toBeGreaterThan(48);
    }
  });

  test('タブバー自体は 1 行の高さに収まり、はみ出しは横スクロールで逃がす', async ({ page }) => {
    await gotoApp(page);
    const bar = await page.locator('#tab-bar').boundingBox();
    expect(bar).not.toBeNull();
    if (bar) expect(bar.height).toBeLessThan(48);
    const overflowX = await page.locator('#tab-bar').evaluate((el) => getComputedStyle(el).overflowX);
    expect(overflowX).toBe('auto');
  });

  test('Ctrl+K から名前でタブバーの道具を呼べる', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+k');
    await expect(page.locator('#cp-input')).toBeVisible();
    await page.locator('#cp-input').fill('テンプレート');
    // BLK-owner-20260924-2337-prune: テンプレート・部品を起こす・骨格・セット複製は 1 行「既存の図や雛形から新しい図を起こす…」に
    // まとめた。旧名はその行を引く語として残る (行の題には出ない)。
    await expect(page.locator('#cp-list .cp-item').first()).toContainText('新しい図を起こす');
    await page.keyboard.press('Enter');
    await expect(page.locator('#tpl-modal')).toBeVisible();
  });

  test('パレットの「一覧」で保存フォルダのパネルが開く', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('いちらん');
    // 行の題は「FILES: 保存先を開く」。「いちらん」はその行を引く語として残り、Enter で保存先の一覧が中央の枠に開く
    // (BLK-owner-20260924-0637-1。BLK-releaser-20260929-0851-2 で今の画面に合わせた)
    await expect(page.locator('#cp-list')).toContainText('保存先を開く');
    await page.keyboard.press('Enter');
    await expect(page.locator('#folder-panel')).toHaveClass(/is-list/);
  });
});
