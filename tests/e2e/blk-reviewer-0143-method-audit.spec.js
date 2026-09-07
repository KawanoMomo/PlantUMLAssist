// @ts-check
// BLK-reviewer-20260907-0143: シーケンスの Xxx_Init() 系メッセージと
// driver_common_class の宣言を 1 組ずつ grep して目視突合していた。
// 「クラスが無い」「メソッドが無い」「引数の個数が違う」を名前突合の画面で
// 機械的に出せることを実機で確かめる。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

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
    await page.locator('#btn-tab-audit').click();
    await expect(page.locator('#na-modal')).toBeVisible();
    await expect(page.locator('#na-no-methods')).toBeVisible();
    await expect(page.locator('#na-method-summary')).toHaveAttribute('data-issues', '0');
  });

  test('クラス無し / メソッド無し / 引数違いが 1 画面に並ぶ', async ({ page }) => {
    await typeDsl(page, CLS);
    await page.locator('#btn-tab-new').click();
    await typeDsl(page, SEQ_BAD);
    await page.locator('#btn-tab-audit').click();
    await expect(page.locator('#na-modal')).toBeVisible();

    await expect(page.locator('#na-method-summary')).toHaveAttribute('data-issues', '3');
    const kinds = await page.locator('#na-methods .na-method-row')
      .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-kind')));
    expect(kinds).toEqual(['no-class', 'no-method', 'arity']);

    const text = await page.locator('#na-methods').innerText();
    expect(text).toContain('Timer_Init() を呼んでいるが、Timer のクラスがどの図にも無い');
    expect(text).toContain('Uart_Recv() を呼んでいるが、Uart_Driver に宣言が無い');
    expect(text).toContain('Spi_Transmit() の引数が 1 個だが、Spi_Driver の宣言は 2 個');
  });

  test('指摘の行には、その呼び出しが出てくる図の名前が付く', async ({ page }) => {
    await typeDsl(page, CLS);
    await page.locator('#btn-tab-new').click();
    await typeDsl(page, SEQ_BAD);
    const names = await page.evaluate(() => window.MA.workspace.list().map((d) => d.name));
    await page.locator('#btn-tab-audit').click();
    const row = page.locator('#na-methods .na-method-row[data-method="Timer_Init"]');
    await expect(row).toContainText(names[1]);
  });

  test('クラス図を直すと指摘が消える (grep 目視に戻らない)', async ({ page }) => {
    await typeDsl(page, CLS);
    await page.locator('#btn-tab-new').click();
    await typeDsl(page, '@startuml\nApp -> Uart_Driver : Uart_Recv(buf, len)\n@enduml');
    await page.locator('#btn-tab-audit').click();
    await expect(page.locator('#na-method-summary')).toHaveAttribute('data-issues', '1');
    await page.locator('#na-close').click();

    // クラス図のタブへ戻って Uart_Recv を足す
    await page.locator('#tab-bar .tab').first().click();
    await typeDsl(page, CLS.replace('  +Uart_Send(buf, len): void',
      '  +Uart_Send(buf, len): void\n  +Uart_Recv(buf, len): void'));
    await page.locator('#btn-tab-audit').click();
    await expect(page.locator('#na-method-summary')).toHaveAttribute('data-issues', '0');
  });
});
