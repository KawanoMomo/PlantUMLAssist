// @ts-check
// BLK-junior-20260908-1203 の手数実測。起票者の手順 (先輩図の DriverBase を自分の
// クラス図に足し、GpioDrv が DriverBase を継承する関係を作る) を、実際の GUI 操作で
// なぞってクリックとキー入力を数える。ページ側で click / keydown を数えるので、
// スクリプトの都合ではなく画面に届いた操作の数が出る。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

test('measure: 継承関係を親子を間違えずに 1 本足すまでの手数', async ({ page }) => {
  await page.addInitScript(() => {
    window.__clicks = 0;
    window.__keys = 0;
    window.addEventListener('click', () => { window.__clicks++; }, true);
    window.addEventListener('change', () => { window.__clicks++; }, true);  // select は開いて選ぶで 1 と数える
    window.addEventListener('keydown', () => { window.__keys++; }, true);
  });
  await gotoApp(page);
  // 自分のクラス図 (先輩の DriverBase をまだ持たない) を開いた状態から始める。
  await page.evaluate(() => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = '@startuml\nclass GpioDrv\n@enduml';
    ed.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__clicks = 0; window.__keys = 0; });

  // 1. 末尾に追加 → abstract class を選ぶ
  await page.locator('#cl-tail-kind').selectOption('abstract');
  // 2. Alias を打つ (DriverBase = 10 キー)
  await page.locator('#cl-tail-alias').fill('DriverBase');
  await page.evaluate(() => { window.__keys += 'DriverBase'.length; });  // fill はキーを撃たないので実打鍵数を足す
  // 3. 追加
  await page.locator('#cl-tail-add').click();
  await page.waitForTimeout(800);

  // 4. Relation を選ぶ
  await page.locator('#cl-tail-kind').selectOption('relation');
  // 5. 種類を継承にする
  await page.locator('#cl-tail-rkind').selectOption('inheritance');
  // 6. 子を選ぶ (見出しが「子 (From)」。From は矢の根元 — BLK-owner-20260929-0351-1)
  await page.locator('#cl-tail-from').selectOption('GpioDrv');
  // 7. 親を選ぶ
  await page.locator('#cl-tail-to').selectOption('DriverBase');
  // 8. 下書きで向きを確かめる (ここが「保存して DSL を見比べる」の代わり)
  await expect(page.locator('#cl-tail-rpreview')).toContainText('DriverBase <|-- GpioDrv');
  // 9. 追加
  await page.locator('#cl-tail-add').click();
  await page.waitForTimeout(800);

  const dsl = await getEditorText(page);
  expect(dsl).toContain('abstract class DriverBase');
  expect(dsl).toContain('DriverBase <|-- GpioDrv');
  expect(dsl).not.toContain('GpioDrv <|-- DriverBase');

  const clicks = await page.evaluate(() => window.__clicks);
  const keys = await page.evaluate(() => window.__keys);
  console.log('MEASURE clicks=' + clicks + ' keys=' + keys);
  expect(clicks).toBeLessThanOrEqual(10);
  expect(keys).toBeLessThanOrEqual(50);
});
