// @ts-check
// BLK-junior-20260907-1403-wish — 「この図と同じ形のまま、この図をレビューしてほしい」。
// テンプレートから作ると、その元の図がそのまま型の基準になり、書いている間ずっと
// ずれと図種特有の間違い (choice を足したのに直接遷移が残る二重) を指摘してくれる。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

async function setEditor(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(500);
}

const WITH_DUP = [
  '@startuml',
  'title CanDrv',
  'state Can_Judge <<choice>>',
  '[*] --> Can_Idle',
  'Can_Idle --> Can_Busy : 送信を開始',
  'Can_Busy --> Can_Judge : 異常を検知',
  'Can_Judge --> Can_Error : 重大',
  'Can_Judge --> Can_Idle : 軽微',
  'Can_Busy --> Can_Error : 異常を検知',
  '@enduml',
].join('\n');

test.describe('レビュー机 (BLK-junior-1403-wish)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('分岐を足したのに元の直接遷移が残っていると、その場で指摘が出る', async ({ page }) => {
    await gotoApp(page);
    await setEditor(page, WITH_DUP);
    // 基準の図を選ばなくても、図種特有の間違いは出る
    await expect(page.locator('#btn-tab-review')).toHaveClass(/has-finding/);
    await expect(page.locator('#btn-tab-review')).toHaveText('👁 レビュー 1');

    await page.locator('#btn-tab-review').click();
    await expect(page.locator('#review-panel')).toHaveClass(/open/);
    const row = page.locator('#review-panel .rv-row[data-review-kind="dup"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Can_Judge');
    await expect(row).toContainText('二重');
    await expect(row.locator('.rv-no')).toHaveText('9');   // 直接遷移の行 (1 始まり)
  });

  test('指摘の行を押すとその行へ飛び、直すと指摘がその場で消える', async ({ page }) => {
    await gotoApp(page);
    await setEditor(page, WITH_DUP);
    await page.locator('#btn-tab-review').click();
    await page.locator('#review-panel .rv-row').first().click();
    await page.waitForTimeout(300);

    const fixed = WITH_DUP.split('\n')
      .filter((l) => l !== 'Can_Busy --> Can_Error : 異常を検知').join('\n');
    await setEditor(page, fixed);
    await expect(page.locator('#btn-tab-review')).toHaveText('👁 レビュー −');
    await expect(page.locator('#btn-tab-review')).not.toHaveClass(/has-finding/);
  });

  test('テンプレートから作ると元の図がそのまま基準になり、レビューが開く', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#rail-st').click();
    await page.waitForTimeout(500);
    await page.locator('#btn-tab-template').click();
    await page.waitForTimeout(400);
    await page.locator('#tpl-source').selectOption('builtin:state-basic');
    await page.waitForTimeout(400);
    await page.locator('#tpl-to').fill('Can');
    await page.locator('#tpl-to').dispatchEvent('input');
    await page.waitForTimeout(400);
    await page.locator('#btn-tpl-create').click();
    await page.waitForTimeout(900);

    // 作った直後にレビューが開いていて、基準はテンプレート元の図
    await expect(page.locator('#review-panel')).toHaveClass(/open/);
    await expect(page.locator('#rv-base-select')).toHaveValue('Xxx-state');
    await expect(page.locator('#review-panel .rv-head')).toHaveAttribute('data-review', 'clean');
    expect(await getEditorText(page)).toContain('Can');
  });

  test('基準の図を選び直すと、型のずれも一覧に出る', async ({ page }) => {
    await gotoApp(page);
    // 1 枚目: 型になる図
    await setEditor(page, [
      '@startuml',
      'title SpiDrv',
      '[*] --> Spi_Idle',
      'Spi_Idle --> Spi_Send : 送信を開始',
      'Spi_Send --> Spi_Recv : 受信を開始',
      'Spi_Recv --> Spi_Idle : 通信を終了',
      '@enduml',
    ].join('\n'));
    await page.evaluate(() => {
      const ws = window.MA.workspace;
      ws.rename(ws.getActiveId(), 'SpiDrv');
      ws.open({ name: 'CanDrv', dsl: '@startuml\n@enduml', diagramType: 'plantuml-state' });
    });
    await page.waitForTimeout(400);
    // 2 枚目: 語尾が型から外れている (参照図で 2 回出る「開始」から外れる)
    await setEditor(page, [
      '@startuml',
      'title CanDrv',
      '[*] --> Can_Idle',
      'Can_Idle --> Can_Send : 送信をスタート',
      'Can_Send --> Can_Recv : 受信を開始',
      'Can_Recv --> Can_Idle : 通信を終了',
      '@enduml',
    ].join('\n'));

    await page.locator('#btn-tab-review').click();
    await page.locator('#rv-base-select').selectOption('SpiDrv');
    await page.waitForTimeout(300);
    await expect(page.locator('#review-panel .rv-head')).toHaveAttribute('data-review', 'dirty');
    expect(await page.locator('#review-panel .rv-row').count()).toBeGreaterThan(0);
  });

  test('基準は図ごとに別で、タブを切り替えると引き直される', async ({ page }) => {
    await gotoApp(page);
    await setEditor(page, WITH_DUP);
    // 新しいタブを足し、タブをクリックして切り替える (アプリと同じ経路)
    await page.evaluate(() => {
      window.MA.workspace.open({ name: 'Clean', dsl: '@startuml\nA --> B\n@enduml', diagramType: 'plantuml-state' });
      window.MA.workspace.setActive(window.MA.workspace.list()[0].id);
      renderTabs();
    });
    await page.locator('#tab-bar .tab[data-doc-name="Clean"]').click();
    await page.waitForTimeout(900);
    // 新しいタブに指摘は無い
    await expect(page.locator('#btn-tab-review')).toHaveText('👁 レビュー −');
  });
});
