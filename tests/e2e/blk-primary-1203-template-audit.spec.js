// @ts-check
// BLK-primary-20260907-1203-wish: ⧉ テンプレート複製の「この内容で作る」を押す前に、
// これから作る図のイベント名がクラスの宣言と噛み合うかをその場で突き合わせる。
// timer_state.puml (adc_state.puml を Adc → Timer に置換したもの) の再現。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const CLASS_DSL = [
  '@startuml',
  'class Adc_Driver {',
  '  +Adc_Init()',
  '  +Adc_StartConv()',
  '  +Adc_ConvDone()',
  '}',
  'class Timer_Driver {',
  '  +Timer_Init()',
  '  +Timer_Start()',
  '}',
  '@enduml',
].join('\n');

const ADC_STATE = [
  '@startuml',
  '[*] --> Idle',
  'Idle --> Configured : Adc_Init',
  'Configured --> Sampling : Adc_StartConv',
  'Sampling --> Idle : Adc_ConvDone',
  '@enduml',
].join('\n');

// クラス図のタブと、複製元の状態遷移図のタブを開いた状態を作る。
// 最後に開いたタブがアクティブになり、モーダルを開くと編集中のテキストが
// アクティブなタブへ書き戻されるので、複製元の DSL はエディタ側から入れる。
async function openDocs(page, adcDsl) {
  await page.evaluate(({ cls, adc }) => {
    var W = window.MA.workspace;
    W.open({ name: 'driver_class', diagramType: 'plantuml-class', dsl: cls });
    W.open({ name: 'adc_state', diagramType: 'plantuml-state', dsl: adc });
    var ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = adc;
    ed.dispatchEvent(new Event('input'));
  }, { cls: CLASS_DSL, adc: adcDsl });
  await page.waitForTimeout(500);
}

async function setup(page, adcDsl) {
  await gotoApp(page);
  await openDocs(page, adcDsl);
  await page.locator('#btn-tab-template').click();
  await expect(page.locator('#tpl-source')).toBeVisible();
  await page.locator('#tpl-source').selectOption({ label: 'adc_state (開いている図)' });
  await page.waitForTimeout(300);
}

test.describe('テンプレート複製の作成画面で突合する (BLK-primary-1203-wish)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('Adc → Timer に替えると、Timer_Driver に無い名前を作る前に赤く挙げる', async ({ page }) => {
    await setup(page, ADC_STATE);
    await page.locator('#tpl-from').fill('Adc');
    await page.locator('#tpl-to').fill('Timer');
    await page.waitForTimeout(400);

    const head = page.locator('#tpl-audit-head');
    await expect(head).toHaveAttribute('data-audit', 'ng');
    await expect(head).toContainText('クラスの宣言に無い名前が 2 件あります');

    const rows = page.locator('.tpl-audit-row');
    await expect(rows).toHaveCount(2);
    await expect(page.locator('#tpl-audit')).toContainText('Timer_StartConv');
    await expect(page.locator('#tpl-audit')).toContainText('Timer_ConvDone');
    // Timer_Init は Timer_Driver に在るので挙がらない
    await expect(page.locator('#tpl-audit')).not.toContainText('Timer_Init');
  });

  test('警告が出ていても「この内容で作る」は押せる (判断は利用者に残す)', async ({ page }) => {
    await setup(page, ADC_STATE);
    await page.locator('#tpl-from').fill('Adc');
    await page.locator('#tpl-to').fill('Timer');
    await page.waitForTimeout(400);
    await expect(page.locator('#tpl-audit-head')).toHaveAttribute('data-audit', 'ng');
    await expect(page.locator('#btn-tpl-create')).toBeEnabled();
  });

  test('宣言のある名前だけの図なら「噛み合っています」に変わる', async ({ page }) => {
    const ok = [
      '@startuml',
      '[*] --> Idle',
      'Idle --> Running : Adc_Init',
      '@enduml',
    ].join('\n');
    await setup(page, ok);
    await page.locator('#tpl-from').fill('Adc');
    await page.locator('#tpl-to').fill('Timer');
    await page.waitForTimeout(400);

    await expect(page.locator('#tpl-audit-head')).toHaveAttribute('data-audit', 'ok');
    await expect(page.locator('#tpl-audit-head')).toContainText('噛み合っています');
    await expect(page.locator('.tpl-audit-row')).toHaveCount(0);
  });

  test('置換先を打ち替えると突合もその場で追随する', async ({ page }) => {
    await setup(page, ADC_STATE);
    await page.locator('#tpl-from').fill('Adc');
    await page.locator('#tpl-to').fill('Timer');
    await page.waitForTimeout(400);
    await expect(page.locator('#tpl-audit-head')).toHaveAttribute('data-audit', 'ng');

    // Adc_Driver には conv 系が在るので、Adc のままなら噛み合う
    await page.locator('#tpl-to').fill('Adc');
    await page.waitForTimeout(400);
    await expect(page.locator('#tpl-audit-head')).toHaveAttribute('data-audit', 'ok');
  });

  test('クラスの宣言が開かれていなければ「問題なし」とは言わない', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate((adc) => {
      window.MA.workspace.open({ name: 'adc_state', diagramType: 'plantuml-state', dsl: adc });
      var ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      ed.value = adc;
      ed.dispatchEvent(new Event('input'));
    }, ADC_STATE);
    await page.waitForTimeout(500);
    await page.locator('#btn-tab-template').click();
    await page.locator('#tpl-source').selectOption({ label: 'adc_state (開いている図)' });
    await page.locator('#tpl-from').fill('Adc');
    await page.locator('#tpl-to').fill('Timer');
    await page.waitForTimeout(400);

    await expect(page.locator('#tpl-audit-head')).toHaveAttribute('data-audit', 'skipped');
    await expect(page.locator('#tpl-audit-head')).toContainText('突合はしていません');
  });

  test('操作中に console error が出ない', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await setup(page, ADC_STATE);
    await page.locator('#tpl-from').fill('Adc');
    await page.locator('#tpl-to').fill('Timer');
    await page.waitForTimeout(400);
    expect(errors).toEqual([]);
  });
});
