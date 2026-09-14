// @ts-check
// BLK-builder-20260907-2041-4 (design 2a): パレットの「選択中の要素に対して」は
// 記法をそのまま出さず、「何が起きるか」を先に書き、記法は右に小さく置く。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const SEQ = '@startuml\nparticipant User\nparticipant System\n'
  + 'User -> System : Request\nSystem --> User : Response\n@enduml';

async function freshWorkspace(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'localStorage', fileDir: './autosave' }));
    } catch (e) {}
  });
}

async function setup(page) {
  await gotoApp(page);
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t; ed.dispatchEvent(new Event('input'));
  }, SEQ);
  await page.waitForTimeout(300);
  // メッセージをパレット経由で選ぶ (右ペインに選択中の操作ボタンが出る)。
  await page.keyboard.press('Control+k');
  await page.locator('#cp-input').fill('Request');
  await page.keyboard.press('Enter');
  await expect(page.locator('#props-content')).toContainText('Message');
}

test.describe('BLK-builder-2041-4 選択中の操作を「何が起きるか」で出す', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('選択中のメッセージの操作が、記法ではなく起きることで並ぶ', async ({ page }) => {
    await setup(page);
    await page.keyboard.press('Control+k');
    await expect(page.locator('#cp-modal')).toBeVisible();
    await page.locator('#cp-input').fill('呼び出しの開始');
    const row = page.locator('#cp-list .cp-item').first();
    await expect(row).toContainText('呼び出しの開始・終了を自動で入れる');
    await expect(row).toContainText('activate');
    await expect(row).not.toContainText('ライフライン推論');
  });

  test('矢印の種類のカードは Selected を埋めず、操作だけが並ぶ', async ({ page }) => {
    await setup(page);
    await page.keyboard.press('Control+k');
    const list = page.locator('#cp-list');
    await expect(list).toContainText('条件分岐・繰り返しの枠で囲む');
    await expect(list).toContainText('呼び出しの開始・終了を自動で入れる');
    // 「両方向のやり取り」等の矢印パレットは値を選ぶ UI であって操作ではない。
    await expect(list).not.toContainText('両方向のやり取り');
    await expect(list).not.toContainText('片羽根');
  });

  test('元のボタンの文字でも同じ候補に当たる', async ({ page }) => {
    await setup(page);
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('ライフライン推論');
    await expect(page.locator('#cp-list .cp-item').first())
      .toContainText('呼び出しの開始・終了を自動で入れる');
  });

  test('言い換えた候補を選ぶと、元のボタンと同じことが起きる', async ({ page }) => {
    await setup(page);
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('呼び出しの開始');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    await expect(page.locator('#editor')).toHaveValue(/activate/);
  });
});
