const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

// BLK-primary-20260907-1403-wish「顧客提出前チェック」。
// 全図の title / note / 部品名を 1 枚に並べ、社内略語辞書に当たった行だけ赤くする。

const SEQ = [
  '@startuml',
  'title UART_Drv 通信シーケンス',
  'actor 開発者',
  'participant "UART ドライバ" as UartDrv',
  'note over UartDrv : 暫定の実装 20260907',
  '開発者 -> UartDrv : send()',
  '@enduml',
].join('\n');

const CLS = [
  '@startuml',
  'title 通信クラス構成',
  'class Transceiver',
  '@enduml',
].join('\n');

async function setEditor(page, text) {
  await page.evaluate((t) => {
    var ed = document.getElementById('editor');
    ed.value = t;
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  await page.waitForTimeout(700);
}

// 2 枚のタブを用意する (横断で見ることがこの機能の主題なので 1 枚では足りない)。
async function twoDocs(page) {
  await gotoApp(page);
  await setEditor(page, SEQ);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(700);
  await setEditor(page, CLS);
}

test.describe('BLK-primary-20260907-1403-wish: 提出前チェック', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await page.addInitScript(() => {
      try { window.localStorage.removeItem('pua.submitCheck.dict'); } catch (e) {}
    });
    await twoDocs(page);
  });

  test('📤 提出前チェックを押すと全図の title / note / 部品名が 1 枚に並ぶ', async ({ page }) => {
    await page.locator('#btn-tab-submit').click();
    await expect(page.locator('#sc-modal')).toBeVisible();

    const summary = page.locator('#sc-summary');
    await expect(summary).toHaveAttribute('data-docs', '2');
    const rows = parseInt(await summary.getAttribute('data-rows'), 10);
    expect(rows).toBeGreaterThan(4);

    // 「要確認だけ表示」を外すと、赤くない行も並ぶ
    await page.locator('#sc-only-flagged').uncheck();
    await expect(page.locator('#sc-table .sc-row:visible')).toHaveCount(rows);
    await expect(page.locator('#sc-table')).toContainText('通信クラス構成');
    await expect(page.locator('#sc-table')).toContainText('Transceiver');
  });

  test('社内略語と日付入りの識別子に当たった行だけが要確認になる', async ({ page }) => {
    await page.locator('#btn-tab-submit').click();
    const flagged = page.locator('#sc-table .sc-flagged');
    const n = parseInt(await page.locator('#sc-summary').getAttribute('data-flagged'), 10);
    expect(n).toBeGreaterThan(0);
    await expect(flagged).toHaveCount(n);
    // Drv を含む title と、日付入りの note が当たる
    await expect(flagged.filter({ hasText: 'UART_Drv 通信シーケンス' })).toHaveCount(1);
    await expect(flagged.filter({ hasText: '20260907' })).toHaveCount(1);
    // 当たっていない図のタイトルは要確認に入らない
    await expect(flagged.filter({ hasText: '通信クラス構成' })).toHaveCount(0);
  });

  test('要確認だけ表示にすると、赤い行だけが残る', async ({ page }) => {
    await page.locator('#btn-tab-submit').click();
    await expect(page.locator('#sc-only-flagged')).toBeChecked();
    const visible = page.locator('#sc-table .sc-row:visible');
    const count = await visible.count();
    for (let i = 0; i < count; i++) {
      await expect(visible.nth(i)).toHaveClass(/sc-flagged/);
    }
  });

  test('辞書を書き換えて再チェックすると当たり方が変わり、次に開いても残る', async ({ page }) => {
    await page.locator('#btn-tab-submit').click();
    await page.locator('#sc-dict').fill('Transceiver');
    await page.locator('#sc-recheck').click();
    await page.waitForTimeout(400);

    const flagged = page.locator('#sc-table .sc-flagged');
    await expect(flagged.filter({ hasText: 'Transceiver' })).toHaveCount(1);
    // BLK-owner-20260924-1252-prune: 辞書は「略語以外で出したくない語」になった。社内略語は 🔤 表記統一と
    // 同じ glossary で数えるので、辞書を書き換えても略語 (UART) の当たりは残る。辞書の語 (前の既定の Drv) は外れる。
    const titleHits = page.locator('#sc-table .sc-row', { hasText: 'UART_Drv 通信シーケンス' }).locator('td').nth(3);
    await expect(titleHits).not.toContainText('Drv');

    // 閉じて開き直しても辞書はそのまま
    await page.locator('#sc-close').click();
    await page.locator('#btn-tab-submit').click();
    await expect(page.locator('#sc-dict')).toHaveValue('Transceiver');
  });

  test('赤い行を押すとその図のタブへ移り、該当行が選ばれる', async ({ page }) => {
    await page.locator('#btn-tab-submit').click();
    await page.locator('#sc-table .sc-flagged').filter({ hasText: 'UART_Drv 通信シーケンス' }).click();
    await page.waitForTimeout(900);
    await expect(page.locator('#sc-modal')).toBeHidden();
    // シーケンス図のタブに移っている
    expect(await getEditorText(page)).toContain('UART_Drv');
    const sel = await page.evaluate(() => {
      var ed = document.getElementById('editor');
      return ed.value.substring(ed.selectionStart, ed.selectionEnd);
    });
    expect(sel).toContain('UART_Drv 通信シーケンス');
  });
});
