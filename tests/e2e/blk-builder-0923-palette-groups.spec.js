// @ts-check
// BLK-builder-20260907-0923-1: design「1a 展開」2a のコマンドパレット展開。
// 候補を「図に足す / 図の要素へ移動 / 選択中の要素に対して / コマンド」の見出しで
// 区切り、Tab で種別を絞り込めることを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(400);
}

const SEQ = [
  '@startuml',
  'title Sample Sequence',
  'actor User',
  'participant System',
  'database DB',
  'User -> System : Request',
  'System -> DB : Query',
  '@enduml',
].join('\n');

test.describe('BLK-builder-0923 コマンドパレットの見出しと Tab 絞り込み', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('開いた直後の先頭が「図に足す / Add」で、図種に応じた項目が並ぶ', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+k');
    const heads = page.locator('#cp-list .cp-group');
    await expect(heads.first()).toHaveText('図に足す / Add');
    const addItems = page.locator('#cp-list .cp-group[data-cp-group="add"] ~ .cp-item');
    await expect(addItems.first()).toContainText('メッセージ');
    await expect(page.locator('#cp-list .cp-item', { hasText: '実行中の帯' })).toHaveCount(1);
  });

  test('図種を変えると「図に足す」の中身が入れ替わる', async ({ page }) => {
    await gotoApp(page);
    await page.selectOption('#diagram-type', 'plantuml-state');
    await page.waitForTimeout(400);
    await page.keyboard.press('Control+k');
    await expect(page.locator('#cp-list .cp-item', { hasText: '複合状態' })).toHaveCount(1);
    await expect(page.locator('#cp-list .cp-item', { hasText: '実行中の帯' })).toHaveCount(0);
  });

  test('「図の要素へ移動」の見出しに補足文が付く', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SEQ);
    await page.keyboard.press('Control+k');
    await expect(page.locator('#cp-list .cp-group[data-cp-group="jump"]'))
      .toHaveText('図の要素へ移動 / Jump to element');
    await expect(page.locator('#cp-list .cp-group-note'))
      .toHaveText('選ぶとその行を選択し、右パネルで編集できます。');
  });

  test('メッセージ行も移動先に並び、選ぶと選択されて右ペインが編集に変わる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SEQ);
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('Query');
    const items = page.locator('#cp-list .cp-item');
    await expect(items.first()).toContainText('System -> DB : Query');
    await expect(items.first()).toContainText('7 行目');
    await page.keyboard.press('Enter');
    await expect(page.locator('#cp-modal')).toBeHidden();
    // 右ペインが「そのメッセージの編集」になっている (design 2a の狙い)。
    await expect(page.locator('#props-content')).toContainText('Message · L7');
  });

  test('「図に足す」を実行すると右ペインの追加フォームがその種類で開く', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SEQ);
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('参加者');
    await page.keyboard.press('Enter');
    await expect(page.locator('#cp-modal')).toBeHidden();
    await expect(page.locator('#seq-tail-kind')).toHaveValue('participant');
  });

  test('選択があると「選択中の要素に対して」が出て、その操作を実行できる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SEQ);
    // まずパレット経由でメッセージを選ぶ。
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('Request');
    await page.keyboard.press('Enter');
    await expect(page.locator('#props-content')).toContainText('Message · L6');
    // 選択中に開き直すと selected 見出しが増える。
    await page.keyboard.press('Control+k');
    await expect(page.locator('#cp-list .cp-group[data-cp-group="selected"]'))
      .toHaveText('選択中の要素に対して / Selected');
    await page.locator('#cp-input').fill('ライフライン推論');
    const items = page.locator('#cp-list .cp-item');
    await expect(items).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(page.locator('#cp-modal')).toBeHidden();
    await expect(page.locator('#editor')).toHaveValue(/activate/);
  });

  test('Tab で種別が絞られ、一周すると全部に戻る', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SEQ);
    await page.keyboard.press('Control+k');
    const heads = page.locator('#cp-list .cp-group');
    const foot = page.locator('#cp-foot');
    await expect(foot).toContainText('Tab 種別で絞り込み');
    const all = await heads.count();
    expect(all).toBeGreaterThan(1);

    await page.keyboard.press('Tab');
    await expect(heads).toHaveCount(1);
    await expect(heads.first()).toHaveText('図に足す / Add');
    await expect(foot).toContainText('図に足す / Add');

    await page.keyboard.press('Tab');
    await expect(heads.first()).toHaveText('図の要素へ移動 / Jump to element');

    await page.keyboard.press('Tab');   // command
    await page.keyboard.press('Tab');   // 全部に戻る
    await expect(heads).toHaveCount(all);
    await expect(foot).not.toContainText('図に足す / Add');
  });

  test('フッタに ↑↓ / Enter / Tab の案内が出ている', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+k');
    const foot = page.locator('#cp-foot');
    await expect(foot).toContainText('↑↓ 選択');
    await expect(foot).toContainText('Enter 実行');
    await expect(foot).toContainText('Tab 種別で絞り込み');
  });
});
