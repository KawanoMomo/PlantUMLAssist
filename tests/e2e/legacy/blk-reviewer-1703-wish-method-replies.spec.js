// @ts-check
// BLK-reviewer-20260907-1703 (wish): メソッド突合が Ack / Ready のような
// 「呼び出しへの応答」を毎回拾い、どれが本物の欠落かを目でふるい分けていた。
// 応答は突合から外し、外した件数だけをパネルに出す。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const CLS = '@startuml\nclass Adc_Driver {\n  + Adc_Init() : void\n}\nclass App\n@enduml';
// 3 件の応答 (Ack / Ready / Done) と、本物の欠落 1 件 (Adc_Reset)。
const SEQ = ['@startuml', 'participant App', 'participant Adc_Driver',
  'App -> Adc_Driver : Adc_Init()',
  'Adc_Driver --> App : Ack',
  'Adc_Driver --> App : Ready',
  'Adc_Driver --> App : Done',
  'App -> Adc_Driver : Adc_Reset',
  '@enduml'].join('\n');

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(300);
}

async function renameActive(page, name) {
  await page.evaluate((n) => {
    const ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), n);
  }, name);
}

async function setupTwoDocs(page) {
  await gotoApp(page);
  await typeDsl(page, CLS);
  await renameActive(page, 'Model_Class');
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, SEQ);
  await renameActive(page, 'Model_Seq');
}

test.describe('BLK-reviewer-1703-wish 応答をメソッド突合から外す', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('メソッド不一致に残るのは本物の欠落だけになる', async ({ page }) => {
    await setupTwoDocs(page);
    await page.locator('#status-consistency').click();
    await expect(page.locator('#ck-modal')).toBeVisible();
    const sum = page.locator('#ck-summary');
    await expect(sum).toHaveAttribute('data-methods', '1');
    await expect(sum).toHaveAttribute('data-method-replies', '3');
    await expect(page.locator('#ck-methods')).toContainText('Adc_Reset');
    await expect(page.locator('#ck-methods')).not.toContainText('Ack');
  });

  test('外した応答は件数と名前で見えるので「見ていない」と混ざらない', async ({ page }) => {
    await setupTwoDocs(page);
    await page.locator('#status-consistency').click();
    const line = page.locator('#ck-method-replies');
    await expect(line).toContainText('呼び出しへの応答 3 件は突合から外しました');
    await expect(line).toContainText('Ack');
  });

  test('応答が 1 件も無ければ、その行は出ない', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, CLS);
    await renameActive(page, 'Model_Class');
    await page.locator('#btn-tab-new').click();
    await typeDsl(page, '@startuml\nparticipant App\nparticipant Adc_Driver\nApp -> Adc_Driver : Adc_Init()\n@enduml');
    await renameActive(page, 'Model_Seq');
    await page.locator('#status-consistency').click();
    await expect(page.locator('#ck-summary')).toHaveAttribute('data-method-replies', '0');
    await expect(page.locator('#ck-method-replies')).toHaveCount(0);
  });

  test('応答だけの図はバッジが「整合 OK」になる', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, CLS);
    await renameActive(page, 'Model_Class');
    await page.locator('#btn-tab-new').click();
    await typeDsl(page, ['@startuml', 'participant App', 'participant Adc_Driver',
      'App -> Adc_Driver : Adc_Init()', 'Adc_Driver --> App : Ack', '@enduml'].join('\n'));
    await renameActive(page, 'Model_Seq');
    await expect(page.locator('#status-consistency')).toHaveText('整合 OK');
  });
});
