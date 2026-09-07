// @ts-check
// BLK-junior-20260908-0630 の手数実測。起票者の手順
// (「GPIOエラー回復」ユースケースを足し、既存のログインから include を張る)
// を通し、クリック数とキー入力数を page 側のイベントで数える。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test('BLK-junior-20260908-0630 手数実測: クリック 10 以下 / キー入力 50 以下', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-usecase');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const ed = document.getElementById('editor');
    ed.value = '@startuml\nactor User\nusecase "ログイン" as L1\nUser --> L1\n@enduml';
    ed.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(600);

  // ここから計数開始 (図の下ごしらえは手順に含めない)。
  await page.evaluate(() => {
    window.__m = { clicks: 0, keys: 0 };
    document.addEventListener('click', () => { window.__m.clicks++; }, true);
    document.addEventListener('keydown', () => { window.__m.keys++; }, true);
    document.addEventListener('change', (e) => {
      // select の値決めはプルダウンを開いて選ぶ 1 クリック相当として数える。
      if (e.target && e.target.tagName === 'SELECT') window.__m.clicks++;
    }, true);
  });

  // 1. 種別を Usecase に
  await page.locator('#uc-tail-kind').selectOption('usecase');
  await page.waitForTimeout(300);
  // 2. Alias 欄に日本語名を打つ (1 クリックで focus + 7 キー)
  await page.locator('#uc-tail-alias').click();
  await page.locator('#uc-tail-alias').pressSequentially('GPIOエラー回復', { delay: 20 });
  await page.waitForTimeout(200);
  // 打っている最中に、識別子が自動採番されることが分かる
  await expect(page.locator('#uc-tail-alias-hint')).toContainText('U1');
  // 3. 追加
  await page.locator('#uc-tail-add').click();
  await page.waitForTimeout(500);
  // 4. 関係を足す
  await page.locator('#uc-tail-kind').selectOption('relation');
  await page.waitForTimeout(300);
  await page.locator('#uc-tail-rkind').selectOption('include');
  await page.locator('#uc-tail-from').selectOption('L1');
  // 5. To は「ラベル (id)」で実体が見えている
  await expect(page.locator('#uc-tail-to')).toContainText('GPIOエラー回復 (U1)');
  await page.locator('#uc-tail-to').selectOption('U1');
  await page.locator('#uc-tail-add').click();
  await page.waitForTimeout(500);

  const dsl = await getEditorText(page);
  expect(dsl).toContain('usecase "GPIOエラー回復" as U1');
  expect(dsl).toContain('L1 ..> U1 : <<include>>');

  const m = await page.evaluate(() => window.__m);
  console.log('MEASURE clicks=' + m.clicks + ' keys=' + m.keys);
  expect(m.clicks).toBeLessThanOrEqual(10);
  expect(m.keys).toBeLessThanOrEqual(50);
});
