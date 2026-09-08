// @ts-check
// BLK-primary-20260907-1803-wish: レビュー指摘 (state 図の遷移イベントに対応する
// class 図のメソッドが無い) を反映するのに、クラスを 1 つずつ選んでメソッド追加
// フォームを開き名前を打つ、をクラスの数だけ繰り返していた。
// 「⇄ イベント整合」画面で突合表を出し、欠落行からその場で足せることを確かめる。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const CLS = [
  '@startuml',
  'class Adc_Driver {',
  '  +Adc_StartConv() : void',
  '}',
  'class Gpio_Driver',
  'class Can_Driver {',
  '}',
  '@enduml',
].join('\n');

const ADC_STATE = '@startuml\n[*] --> Idle\nIdle --> Busy : Adc_StartConv\nBusy --> Idle : Adc_Reset\n@enduml';
const GPIO_STATE = '@startuml\n[*] --> Low\nLow --> High : Gpio_SetHigh\nHigh --> Low : Gpio_SetLow\nHigh --> Low : Gpio_Reset\n@enduml';
const CAN_STATE = '@startuml\n[*] --> Stop\nStop --> Run : Can_Reset\n@enduml';

async function freshWorkspace(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'localStorage', fileDir: './autosave' }));
    } catch (e) {}
  });
}

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(200);
}

async function renameActive(page, name) {
  await page.evaluate((n) => {
    const ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), n);
  }, name);
}

async function setupDocs(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await typeDsl(page, CLS);
  await renameActive(page, 'driver_common_class');
  for (const [name, dsl] of [['adc_state', ADC_STATE], ['gpio_state', GPIO_STATE], ['can_state', CAN_STATE]]) {
    await page.locator('#btn-tab-new').click();
    await page.locator('#diagram-type').selectOption('plantuml-state');
    await typeDsl(page, dsl);
    await renameActive(page, name);
  }
  await page.waitForTimeout(300);
}

async function classDsl(page) {
  return page.evaluate(() => {
    const d = window.MA.workspace.list().filter((x) => x.name === 'driver_common_class')[0];
    return d ? d.dsl : '';
  });
}

test.describe('BLK-primary-1803-wish ⇄ イベント整合', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('ステータスバーに欠落件数が常時出る', async ({ page }) => {
    await setupDocs(page);
    const badge = page.locator('#status-eventsync');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('⇄ イベント 5');
    await expect(badge).toHaveClass(/has-warning/);
  });

  test('突合表に全 state 図のイベントと追加先クラスが並ぶ', async ({ page }) => {
    await setupDocs(page);
    await page.locator('#status-eventsync').click();
    await expect(page.locator('#ev-modal')).toBeVisible();
    await expect(page.locator('#ev-summary')).toHaveAttribute('data-total', '6');
    await expect(page.locator('#ev-summary')).toHaveAttribute('data-missing', '5');
    await expect(page.locator('#ev-table tr.ev-row')).toHaveCount(6);
    // 欠落行が先頭に並び、追加先のクラスと図が読める
    const first = page.locator('#ev-table tr.ev-row').first();
    await expect(first).toHaveAttribute('data-status', 'missing');
    await expect(page.locator('tr.ev-row[data-event="Gpio_SetHigh"]')).toContainText('Gpio_Driver');
    await expect(page.locator('tr.ev-row[data-event="Gpio_SetHigh"]')).toContainText('driver_common_class');
    // 宣言済みのイベントは「宣言あり」で、追加ボタンを持たない
    const ok = page.locator('tr.ev-row[data-event="Adc_StartConv"]');
    await expect(ok).toHaveAttribute('data-status', 'ok');
    await expect(ok.locator('button.ev-add')).toHaveCount(0);
  });

  test('欠落行の「このクラスに追加」でメソッドが class 図に入る', async ({ page }) => {
    await setupDocs(page);
    await page.locator('#status-eventsync').click();
    await page.locator('tr.ev-row[data-event="Can_Reset"] button.ev-add').click();
    await expect(page.locator('#ev-applied')).toContainText('1 件を追加しました');
    const dsl = await classDsl(page);
    expect(dsl).toContain('+Can_Reset() : void');
    // 表は引き直され、その行は「宣言あり」に変わる
    await expect(page.locator('tr.ev-row[data-event="Can_Reset"]')).toHaveAttribute('data-status', 'ok');
    await expect(page.locator('#ev-summary')).toHaveAttribute('data-missing', '4');
  });

  test('欠落 5 件を 3 クラスまとめて 1 回で足せる', async ({ page }) => {
    await setupDocs(page);
    await page.locator('#status-eventsync').click();
    await page.locator('#ev-select-all').click();
    await expect(page.locator('#ev-selected-count')).toHaveText('5 件選択');
    await page.locator('#ev-apply-selected').click();
    await expect(page.locator('#ev-applied')).toContainText('5 件を追加しました');
    await expect(page.locator('#ev-summary')).toHaveAttribute('data-missing', '0');
    const dsl = await classDsl(page);
    for (const m of ['Adc_Reset', 'Gpio_SetHigh', 'Gpio_SetLow', 'Gpio_Reset', 'Can_Reset']) {
      expect(dsl).toContain(m);
    }
    // 本体を持たないクラスは外置きの形で入る
    expect(dsl).toContain('Gpio_Driver : +Gpio_SetHigh() : void');
    await page.locator('#ev-close').click();
    await expect(page.locator('#status-eventsync')).toHaveText('⇄ イベント OK');
  });

  test('追加は開いていない class 図にも入る', async ({ page }) => {
    await setupDocs(page);
    await page.locator('#status-eventsync').click();
    await page.locator('#ev-select-all').click();
    await page.locator('#ev-apply-selected').click();
    await page.locator('#ev-close').click();
    // アクティブなのは can_state。class 図を開いてから戻す
    await page.evaluate(() => {
      const ws = window.MA.workspace;
      const d = ws.list().filter((x) => x.name === 'driver_common_class')[0];
      ws.setActive(d.id);
    });
    await page.waitForTimeout(200);
    expect(await classDsl(page)).toContain('Can_Reset');
  });

  test('戻り値の型を変えて足せる', async ({ page }) => {
    await setupDocs(page);
    await page.locator('#status-eventsync').click();
    await page.locator('#ev-ret').fill('Std_ReturnType');
    await page.locator('tr.ev-row[data-event="Adc_Reset"] button.ev-add').click();
    expect(await classDsl(page)).toContain('+Adc_Reset() : Std_ReturnType');
  });
});
