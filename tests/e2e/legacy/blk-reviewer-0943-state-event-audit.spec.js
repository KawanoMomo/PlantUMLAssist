// @ts-check
// BLK-reviewer-20260907-0943: state 図の遷移ラベル (括弧なし) とクラスメソッドの突合。
// adc_state を接頭辞だけ替えて作った timer_state のイベント名が Timer_Driver に
// 無いことを、整合性チェックのバッジと名前突合の表の両方が言えることを見る。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const CLASS_DSL = [
  '@startuml',
  'class Timer_Driver {',
  '  +Timer_Init(cfg)',
  '  +Timer_Ack()',
  '}',
  '@enduml',
].join('\n');

const STATE_DSL = [
  '@startuml',
  '[*] --> Idle',
  'Idle --> Busy : Timer_StartConv',
  'Busy --> Idle : Timer_Ack',
  '@enduml',
].join('\n');

// 1 枚目 (クラス図) を打ち、＋ で 2 枚目 (state 図) を足して両方を開いた状態にする。
async function twoDocs(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await page.waitForTimeout(400);
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, CLASS_DSL);
  await page.waitForTimeout(600);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(400);
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(400);
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, STATE_DSL);
  await page.waitForTimeout(800);
}

test.describe('BLK-reviewer-0943 state の遷移イベントを突合する', () => {
  test('バッジが警告を出し、内訳にイベントが数えられる', async ({ page }) => {
    await twoDocs(page);
    const badge = page.locator('#status-consistency');
    await expect(badge).toHaveClass(/has-warning/);
    await expect(badge).toHaveAttribute('title', /イベント 1/);
  });

  test('整合性チェックのパネルに「イベント名不一致」が出る', async ({ page }) => {
    await twoDocs(page);
    await page.locator('#status-consistency').click();
    await expect(page.locator('#ck-summary')).toHaveAttribute('data-events', '1');
    await expect(page.locator('#ck-events')).toContainText('Timer_StartConv');
    await expect(page.locator('#ck-events')).toContainText('Timer_Driver');
    // 宣言のある Timer_Ack は挙がらない。
    await expect(page.locator('#ck-events')).not.toContainText('Timer_Ack');
  });

  test('名前突合のメソッド突合にも同じ 1 件が並ぶ', async ({ page }) => {
    await twoDocs(page);
    await page.locator('#btn-tab-audit').click();
    await expect(page.locator('#na-methods')).toContainText('Timer_StartConv');
    await expect(page.locator('#na-methods')).toContainText('state の遷移');
  });

  test('クラス側に宣言を足すと警告が消える', async ({ page }) => {
    await twoDocs(page);
    await expect(page.locator('#status-consistency')).toHaveAttribute('title', /イベント 1/);
    // 1 枚目 (クラス図) のタブに戻って宣言を足す。
    await page.locator('#tab-bar .tab').first().click();
    await page.waitForTimeout(400);
    await page.evaluate((t) => {
      const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      ed.value = t.replace('  +Timer_Ack()', '  +Timer_Ack()\n  +Timer_StartConv()');
      ed.dispatchEvent(new Event('input'));
    }, CLASS_DSL);
    await page.waitForTimeout(800);
    // 他の警告も無くなるので、バッジは「整合 OK」に戻る。
    await expect(page.locator('#status-consistency')).toHaveText('整合 OK');
    await expect(page.locator('#status-consistency')).not.toHaveClass(/has-warning/);
  });
});
