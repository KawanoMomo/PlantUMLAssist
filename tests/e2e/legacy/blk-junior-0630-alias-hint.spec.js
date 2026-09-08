// @ts-check
// BLK-junior-20260908-0630: Usecase 追加の Alias 欄に日本語名「GPIOエラー回復」を
// そのまま打つと、識別子は U1 に自動採番され、打った名前は表示名に回る。
// 図は正しく描けるので気付けず、あとで関係の To を選び直すときに
// プルダウンの表示 (ラベル) と DSL の実体 (U1) が同じか確信が持てなかった。
// 打っている最中のヒントと、プルダウンの「ラベル (id)」併記を実機で見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

async function seedUsecase(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-usecase');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const ed = document.getElementById('editor');
    ed.value = '@startuml\nactor User\nusecase "ログイン" as L1\nUser --> L1\n@enduml';
    ed.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(600);
}

test.describe('BLK-junior-20260908-0630: Alias 欄のヒントと id 併記', () => {

  test('欄の名前が Alias (識別子) / Label (表示名) になっている', async ({ page }) => {
    await seedUsecase(page);
    await page.locator('#uc-tail-kind').selectOption('usecase');
    await page.waitForTimeout(300);
    await expect(page.locator('#props-content')).toContainText('Alias (識別子)');
    await expect(page.locator('#props-content')).toContainText('Label (表示名)');
  });

  test('打つ前はヒントを出さない', async ({ page }) => {
    await seedUsecase(page);
    await page.locator('#uc-tail-kind').selectOption('usecase');
    await page.waitForTimeout(300);
    expect((await page.locator('#uc-tail-alias-hint').textContent()).trim()).toBe('');
  });

  test('日本語を打った時点で、割り当てられる識別子と DSL の形が出る', async ({ page }) => {
    await seedUsecase(page);
    await page.locator('#uc-tail-kind').selectOption('usecase');
    await page.waitForTimeout(300);
    await page.locator('#uc-tail-alias').fill('GPIOエラー回復');
    await page.waitForTimeout(200);
    const hint = page.locator('#uc-tail-alias-hint');
    await expect(hint).toContainText('表示名');
    await expect(hint).toContainText('U1');
    await expect(hint).toContainText('"GPIOエラー回復" as U1');
  });

  test('ヒントの識別子は、押した結果の DSL と一致する', async ({ page }) => {
    await seedUsecase(page);
    await page.locator('#uc-tail-kind').selectOption('usecase');
    await page.waitForTimeout(300);
    await page.locator('#uc-tail-alias').fill('GPIOエラー回復');
    await page.waitForTimeout(200);
    const hint = await page.locator('#uc-tail-alias-hint').textContent();
    await page.locator('#uc-tail-add').click();
    await page.waitForTimeout(500);
    const dsl = await getEditorText(page);
    expect(dsl).toContain('usecase "GPIOエラー回復" as U1');
    expect(hint).toContain('U1');
  });

  test('ASCII を打ったときは、それがそのまま識別子になると言う', async ({ page }) => {
    await seedUsecase(page);
    await page.locator('#uc-tail-kind').selectOption('usecase');
    await page.waitForTimeout(300);
    await page.locator('#uc-tail-alias').fill('Recover');
    await page.waitForTimeout(200);
    await expect(page.locator('#uc-tail-alias-hint')).toContainText('識別子 Recover');
  });

  test('Actor 側でも同じヒントが出る (prefix は A)', async ({ page }) => {
    await seedUsecase(page);
    await page.locator('#uc-tail-kind').selectOption('actor');
    await page.waitForTimeout(300);
    await page.locator('#uc-tail-alias').fill('保守員');
    await page.waitForTimeout(200);
    await expect(page.locator('#uc-tail-alias-hint')).toContainText('A1');
  });

  test('関係の From / To プルダウンが「ラベル (id)」で実体を併記する', async ({ page }) => {
    await seedUsecase(page);
    await page.locator('#uc-tail-kind').selectOption('usecase');
    await page.waitForTimeout(300);
    await page.locator('#uc-tail-alias').fill('GPIOエラー回復');
    await page.locator('#uc-tail-add').click();
    await page.waitForTimeout(500);
    await page.locator('#uc-tail-kind').selectOption('relation');
    await page.waitForTimeout(300);
    // 自動採番された U1 は「GPIOエラー回復 (U1)」で出る。
    await expect(page.locator('#uc-tail-to')).toContainText('GPIOエラー回復 (U1)');
    // 表示名と識別子が同じ要素は重ねない。
    await expect(page.locator('#uc-tail-to')).toContainText('User');
    expect(await page.locator('#uc-tail-to').textContent()).not.toContain('User (User)');
  });

  test('選んだ To がそのまま DSL の実体になる', async ({ page }) => {
    await seedUsecase(page);
    await page.locator('#uc-tail-kind').selectOption('usecase');
    await page.waitForTimeout(300);
    await page.locator('#uc-tail-alias').fill('GPIOエラー回復');
    await page.locator('#uc-tail-add').click();
    await page.waitForTimeout(500);
    await page.locator('#uc-tail-kind').selectOption('relation');
    await page.waitForTimeout(300);
    await page.locator('#uc-tail-rkind').selectOption('include');
    await page.locator('#uc-tail-from').selectOption('L1');
    await page.locator('#uc-tail-to').selectOption('U1');
    await page.locator('#uc-tail-add').click();
    await page.waitForTimeout(500);
    expect(await getEditorText(page)).toContain('L1 ..> U1 : <<include>>');
  });

  test('ヒントを足しても図は今までどおり描ける', async ({ page }) => {
    await seedUsecase(page);
    await page.locator('#uc-tail-kind').selectOption('usecase');
    await page.waitForTimeout(300);
    await page.locator('#uc-tail-alias').fill('GPIOエラー回復');
    await page.locator('#uc-tail-add').click();
    await page.waitForTimeout(3000);
    await expect(page.locator('#render-status')).not.toContainText('ERROR');
    expect(await page.locator('#preview-svg svg').count()).toBe(1);
  });
});
