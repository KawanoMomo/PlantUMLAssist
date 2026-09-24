// @ts-check
// BLK-reviewer-20260907-0143: シーケンスの Xxx_Init() 系メッセージと
// driver_common_class の宣言を 1 組ずつ grep して目視突合していた。
// 「クラスが無い」「メソッドが無い」「引数の個数が違う」を名前突合の画面で
// 機械的に出せることを実機で確かめる。
// BLK-owner-20260924-1332-prune: 🔍 名前突合の画面を畳んだので、同じ事実を
// ▦ 突合ボードの「メソッド」の行で見る (Ctrl+K「メソッド突合」でそのカテゴリに絞って開く)。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const CLS = [
  '@startuml',
  'class Spi_Driver {',
  '  +Spi_Init(cfg): Std_ReturnType',
  '  +Spi_Transmit(buf, len): Std_ReturnType',
  '}',
  'class Uart_Driver {',
  '  +Uart_Send(buf, len): void',
  '}',
  '@enduml',
].join('\n');

const SEQ_OK = '@startuml\nparticipant Spi_Driver\nApp -> Spi_Driver : Spi_Init(cfg)\n@enduml';
const SEQ_BAD = [
  '@startuml',
  'participant Uart_Driver',
  'App -> Uart_Driver : Uart_Recv(buf, len)',
  'App -> Timer_Driver : Timer_Init(cfg)',
  'App -> Spi_Driver : Spi_Transmit(buf)',
  '@enduml',
].join('\n');

async function openMethodAudit(page) {
  await page.keyboard.press('Control+k');
  await page.locator('#cp-input').fill('メソッド突合');
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await expect(page.locator('#ab-modal')).toBeVisible();
  await expect(page.locator('#ab-kind')).toHaveValue('method.issues');
}

const ROWS = '#ab-body .ab-row[data-ab-kind="method.issues"]';

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(200);
}

test.describe('メソッド突合 (BLK-reviewer-0143)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
    await gotoApp(page);
  });

  test('呼び出しと宣言が一致していれば「一致しています」と出る', async ({ page }) => {
    await typeDsl(page, CLS);
    await page.locator('#btn-tab-new').click();
    await typeDsl(page, SEQ_OK);
    await openMethodAudit(page);
    await expect(page.locator('#ab-body .ab-empty')).toBeVisible();
    await expect(page.locator(ROWS)).toHaveCount(0);
  });

  test('クラス無し / メソッド無し / 引数違いが 1 画面に並ぶ', async ({ page }) => {
    await typeDsl(page, CLS);
    await page.locator('#btn-tab-new').click();
    await typeDsl(page, SEQ_BAD);
    await openMethodAudit(page);

    await expect(page.locator(ROWS)).toHaveCount(3);
    const kinds = await page.locator(ROWS)
      .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-ab-issue')));
    expect(kinds.sort()).toEqual(['arity', 'no-class', 'no-method']);

    const text = await page.locator('#ab-body').innerText();
    expect(text).toContain('Timer_Init() を呼んでいるが、Timer のクラスがどの図にも無い');
    expect(text).toContain('Uart_Recv() を呼んでいるが、Uart_Driver に宣言が無い');
    expect(text).toContain('Spi_Transmit() の引数が 1 個だが、Spi_Driver の宣言は 2 個');
  });

  test('指摘の行には、その呼び出しが出てくる図の名前が付く', async ({ page }) => {
    await typeDsl(page, CLS);
    await page.locator('#btn-tab-new').click();
    await typeDsl(page, SEQ_BAD);
    const names = await page.evaluate(() => window.MA.workspace.list().map((d) => d.name));
    await openMethodAudit(page);
    const row = page.locator(ROWS + '[data-ab-method="Timer_Init"]');
    await expect(row).toContainText(names[1]);
  });

  test('クラス図を直すと指摘が消える (grep 目視に戻らない)', async ({ page }) => {
    await typeDsl(page, CLS);
    await page.locator('#btn-tab-new').click();
    await typeDsl(page, '@startuml\nApp -> Uart_Driver : Uart_Recv(buf, len)\n@enduml');
    await openMethodAudit(page);
    await expect(page.locator(ROWS)).toHaveCount(1);
    await page.locator('#ab-close').click();

    // クラス図のタブへ戻って Uart_Recv を足す
    await page.locator('#tab-bar .tab').first().click();
    await typeDsl(page, CLS.replace('  +Uart_Send(buf, len): void',
      '  +Uart_Send(buf, len): void\n  +Uart_Recv(buf, len): void'));
    await openMethodAudit(page);
    await expect(page.locator(ROWS)).toHaveCount(0);
  });
});
