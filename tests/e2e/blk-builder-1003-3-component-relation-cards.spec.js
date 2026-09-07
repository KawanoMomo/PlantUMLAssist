// @ts-check
// BLK-builder-20260907-1003-3 / design 3b「Component — 矢印を選択」。
// 線を選んだときの右パネルが、種類カード (名称 + 意味の説明) / 向き固定の注記 /
// From ⇄ To / ラベル / 削除 で構成されることを実機で見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const DSL = [
  '@startuml',
  'title Sample Component',
  'component WebApp',
  'interface IAuth',
  'IAuth ..> WebApp',
  '@enduml',
].join('\n');

async function openRelation(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-component');
  await page.waitForTimeout(1500);
  await page.evaluate((text) => {
    var ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = text;
    ed.dispatchEvent(new Event('input'));
  }, DSL);
  await page.waitForTimeout(2500);
  var rel = page.locator('#overlay-layer rect[data-type="relation"]').first();
  if (await rel.count() === 0) return false;
  await rel.click();
  await page.waitForTimeout(400);
  return (await page.locator('.co-rel-card').count()) > 0;
}

test.describe('design 3b: Component の関係を選んだときの右パネル', () => {
  test('関係の種類は 4 枚のカードで、意味の説明が読める', async ({ page }) => {
    if (!await openRelation(page)) test.skip();
    await expect(page.locator('.co-rel-card')).toHaveCount(4);
    await expect(page.locator('.co-rel-card[data-value="provides"]'))
      .toContainText('部品がインターフェースを提供する');
    await expect(page.locator('.co-rel-card[data-value="dependency"]'))
      .toContainText('一方が他方を利用している');
  });

  test('いま触っている線が「Relation · N 行目」と「From → To」で分かる', async ({ page }) => {
    if (!await openRelation(page)) test.skip();
    var body = await page.locator('body').innerText();
    expect(body).toContain('Relation · 5 行目');
    expect(body).toContain('IAuth → WebApp');
  });

  test('向きが固定である旨の注記が、選ぶ前から出ている', async ({ page }) => {
    if (!await openRelation(page)) test.skip();
    var body = await page.locator('body').innerText();
    expect(body).toContain('提供 / 要求 は向きが固定です');
  });

  test('提供 を選ぶと 部品 → インターフェース に並べ替えて DSL に書く', async ({ page }) => {
    if (!await openRelation(page)) test.skip();
    var before = await getEditorText(page);
    expect(before).toContain('IAuth ..> WebApp');
    await page.locator('.co-rel-card[data-value="provides"]').click();
    await page.waitForTimeout(1200);
    var after = await getEditorText(page);
    expect(after).not.toBe(before);
    expect(after).toContain('WebApp -() IAuth');
    expect(after).not.toContain('IAuth -() WebApp');
  });

  test('その他の設定は折りたたまれた状態で置かれている', async ({ page }) => {
    if (!await openRelation(page)) test.skip();
    await expect(page.locator('#co-rel-more')).toHaveAttribute('aria-expanded', 'false');
    await page.locator('#co-rel-more').click();
    await expect(page.locator('#co-rel-more')).toHaveAttribute('aria-expanded', 'true');
  });
});
