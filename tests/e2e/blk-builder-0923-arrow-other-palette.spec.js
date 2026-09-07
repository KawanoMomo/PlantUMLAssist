// @ts-check
// BLK-builder-20260907-0923-4 / design 2d「矢印のその他パレット」。
// よく使う 4 種は常時表示、残りは「その他の矢印… ▾」を開いたパレットに。
// 各行は「何が起きるか」が主で、記法は右に小さく。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText, clickOverlayByLine } = require('./helpers');

const DSL = [
  '@startuml',
  'actor User',
  'participant System',
  'User -> System : Request',
  'System --> User : Response',
  '@enduml',
].join('\n');

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(700);
}

async function selectMessageLine(page, line) {
  await clickOverlayByLine(page, line);
  await page.waitForTimeout(400);
}

test.describe('BLK-builder-0923 矢印のその他パレット (design 2d)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('パレットは畳まれて出て、「その他の矢印…」で開く', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DSL);
    await selectMessageLine(page, 4);

    const more = page.locator('#seq-edit-arrow-more');
    await expect(more).toBeHidden();
    await expect(page.locator('#seq-edit-arrow-more-btn')).toContainText('その他の矢印');

    await page.locator('#seq-edit-arrow-more-btn').click();
    await expect(more).toBeVisible();
    await expect(page.locator('#seq-edit-arrow-more-btn')).toHaveAttribute('aria-expanded', 'true');
  });

  test('design が挙げる 6 種が「何が起きるか」の説明つきで並ぶ', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DSL);
    await selectMessageLine(page, 4);
    await page.locator('#seq-edit-arrow-more-btn').click();

    const texts = await page.locator('#seq-edit-arrow-more .prop-arrow-item').allTextContents();
    const joined = texts.join('\n');
    for (const desc of ['両方向のやり取り', '図の外から入ってくる', '図の外へ出ていく',
                        '相手の手前で止まる', '片羽根', '線の色を変える']) {
      expect(joined).toContain(desc);
    }
  });

  test('「相手の手前で止まる」を選ぶと ->o になる', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DSL);
    await selectMessageLine(page, 4);
    await page.locator('#seq-edit-arrow-more-btn').click();
    await page.locator('#seq-edit-arrow-more .prop-arrow-item[data-value="-\\>o"]').click();
    await page.waitForTimeout(600);
    expect((await getEditorText(page)).split('\n')[3]).toBe('User ->o System : Request');
  });

  test('「図の外から入ってくる」を選ぶと [-> になる', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DSL);
    await selectMessageLine(page, 4);
    await page.locator('#seq-edit-arrow-more-btn').click();
    await page.locator('#seq-edit-arrow-more .prop-arrow-item[data-value="[-\\>"]').click();
    await page.waitForTimeout(600);
    expect((await getEditorText(page)).split('\n')[3]).toBe('[-> System : Request');
  });

  test('図の外にしたメッセージも選び直して編集できる (パレットが開いた状態で出る)', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DSL.replace('User -> System : Request', '[-> System : Request'));
    await selectMessageLine(page, 4);
    // 現在値がパレット側なので、開いた状態で該当行が active
    await expect(page.locator('#seq-edit-arrow-more')).toBeVisible();
    await expect(page.locator('#seq-edit-arrow-more .prop-arrow-item.active')).toHaveAttribute('data-value', '[->');
  });

  test('パレットから選んだあとも分節ボタンで元に戻せる', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DSL);
    await selectMessageLine(page, 4);
    await page.locator('#seq-edit-arrow-more-btn').click();
    await page.locator('#seq-edit-arrow-more .prop-arrow-item[data-value="-\\>o"]').click();
    await page.waitForTimeout(600);
    // パレットで選んだあとも右ペインは開いたままなので、そのまま分節を押す
    await page.locator('#seq-edit-arrow-seg .prop-seg[data-value="--\\>"]').click();
    await page.waitForTimeout(600);
    expect((await getEditorText(page)).split('\n')[3]).toBe('User --> System : Request');
  });
});
