// @ts-check
// BLK-primary-20260907-0923-wish: レビュー会議で「今日どこを直したか」を見せるのに、
// ± 差分 → タブを開く → ⇔ 並べて見る、を図の枚数だけ繰り返していた。
// 変更サマリボードは変わった図を全件、変更前後で 1 画面に積む。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const CAN = '@startuml\nparticipant CanDrv\nCanDrv -> Hal : Can_Init()\n@enduml';
const GPIO = '@startuml\nparticipant GpioDrv\nGpioDrv -> Hal : Gpio_Init()\n@enduml';
const CLS = '@startuml\nclass CanDrv\nclass GpioDrv\n@enduml';

async function freshWorkspace(page) {
  await page.addInitScript(() => {
    try { window.localStorage.clear(); } catch (e) {}
  });
}

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(250);
}

// 3 枚開いて基準を取り、2 枚だけ CanDrv/GpioDrv → Xxx_Driver に直した状態を作る。
async function threeDiagramsWithTwoChanged(page) {
  await gotoApp(page);
  await typeDsl(page, CAN);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, GPIO);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, CLS);

  await page.locator('#btn-tab-diff').click();
  await page.locator('#diff-mark-all').click();
  await page.locator('body').click({ position: { x: 5, y: 5 } });

  // 3 枚目 (class) を直す
  await typeDsl(page, CLS.replace('CanDrv', 'Xxx_Driver').replace('GpioDrv', 'Xxx_Driver'));
  // 1 枚目 (can) を直す
  await page.locator('#tab-bar .tab').first().click();
  await page.waitForTimeout(200);
  await typeDsl(page, CAN.split('CanDrv').join('Xxx_Driver'));
}

test.describe('BLK-primary-0923-wish 変更サマリボード', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('変わった図だけが変更前後で 1 画面に並ぶ', async ({ page }) => {
    await threeDiagramsWithTwoChanged(page);

    await page.locator('#btn-tab-board').click();
    await expect(page.locator('#cb-modal')).toBeVisible();
    // 3 枚のうち直した 2 枚だけが並ぶ
    await expect(page.locator('#cb-body .cb-entry')).toHaveCount(2);
    await expect(page.locator('#cb-summary')).toContainText('変わった図 2/3 枚');

    // 各枚に変更前列と変更後列があり、消えた行と入った行が色分けされる
    const first = page.locator('#cb-body .cb-entry').first();
    await expect(first.locator('.cb-cols')).toContainText('変更前');
    await expect(first.locator('.cb-cols')).toContainText('変更後 (今)');
    await expect(first.locator('tr.cb-del')).toHaveCount(2);
    await expect(first.locator('tr.cb-add')).toHaveCount(2);
    await expect(first.locator('tr.cb-del').first()).toContainText('CanDrv');
    await expect(first.locator('tr.cb-add').first()).toContainText('Xxx_Driver');
  });

  test('ボードは 1 クリックで開き、そこからその図へ移れる', async ({ page }) => {
    await threeDiagramsWithTwoChanged(page);
    await page.locator('#btn-tab-board').click();

    const entry = page.locator('#cb-body .cb-entry').nth(1);
    const name = (await entry.locator('.cb-entry-head span').first().innerText()).split(' (')[0];
    await entry.locator('.cb-goto').click();
    await expect(page.locator('#cb-modal')).toBeHidden();
    await expect(page.locator('#tab-bar .tab.active')).toHaveAttribute('data-doc-name', name);
  });

  test('新しく作った図は「新規」として並ぶ', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, CAN);
    await page.locator('#btn-tab-diff').click();
    await page.locator('#diff-mark-all').click();
    await page.locator('body').click({ position: { x: 5, y: 5 } });

    await page.locator('#btn-tab-new').click();
    await typeDsl(page, '@startuml\n[*] --> Idle\n@enduml');

    await page.locator('#btn-tab-board').click();
    await expect(page.locator('#cb-body .cb-entry')).toHaveCount(1);
    await expect(page.locator('#cb-body .cb-entry .cb-count')).toContainText('新規');
    // BLK-owner-20260924-1712-prune: 列見出しも「変更前 =」の選択と同じ語で言う (前回保存が無い = 新規)。
    await expect(page.locator('#cb-body .cb-entry .cb-cols')).toContainText('前回保存なし');
  });

  test('既定は差分行だけ、[全文] で変わっていない行も出る', async ({ page }) => {
    await gotoApp(page);
    const long = ['@startuml'].concat(
      Array.from({ length: 12 }, (_, i) => 'A -> B : step' + (i + 1))
    ).concat(['@enduml']).join('\n');
    await typeDsl(page, long);
    await page.locator('#btn-tab-diff').click();
    await page.locator('#diff-mark-all').click();
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await typeDsl(page, long.replace('step7', 'step7_fixed'));

    await page.locator('#btn-tab-board').click();
    const rows = page.locator('#cb-body .cb-entry tr');
    const collapsed = await rows.count();
    await expect(page.locator('#cb-body tr.cb-gap')).toHaveCount(2);

    await page.locator('#cb-full').check();
    await expect(page.locator('#cb-body tr.cb-gap')).toHaveCount(0);
    expect(await rows.count()).toBeGreaterThan(collapsed);
  });

  test('[変更なしも出す] で全図が並ぶ', async ({ page }) => {
    await threeDiagramsWithTwoChanged(page);
    await page.locator('#btn-tab-board').click();
    await expect(page.locator('#cb-body .cb-entry')).toHaveCount(2);
    await page.locator('#cb-same').check();
    await expect(page.locator('#cb-body .cb-entry')).toHaveCount(3);
    await expect(page.locator('#cb-body .cb-count').filter({ hasText: '変更なし' })).toHaveCount(1);
  });

  test('変更が無ければその旨を出す', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, CAN);
    await page.locator('#btn-tab-diff').click();
    await page.locator('#diff-mark-all').click();
    await page.locator('body').click({ position: { x: 5, y: 5 } });

    await page.locator('#btn-tab-board').click();
    await expect(page.locator('#cb-body .cb-empty')).toBeVisible();
    await expect(page.locator('#cb-summary')).toContainText('変わった図はありません');
  });

  test('Escape と [閉じる] でボードが閉じる', async ({ page }) => {
    await threeDiagramsWithTwoChanged(page);
    await page.locator('#btn-tab-board').click();
    await expect(page.locator('#cb-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#cb-modal')).toBeHidden();

    await page.locator('#btn-tab-board').click();
    await page.locator('#cb-close').click();
    await expect(page.locator('#cb-modal')).toBeHidden();
  });

  test('± 差分パネルからもボードを開ける', async ({ page }) => {
    await threeDiagramsWithTwoChanged(page);
    await page.locator('#btn-tab-diff').click();
    await page.locator('#diff-open-board').click();
    await expect(page.locator('#cb-modal')).toBeVisible();
    await expect(page.locator('#cb-body .cb-entry')).toHaveCount(2);
  });
});
