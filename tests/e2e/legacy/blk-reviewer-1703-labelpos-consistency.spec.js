// @ts-check
// BLK-reviewer-20260908-1703 の実測。手順 4.11 「遷移ラベルの命名慣習 (エントリ
// 呼び出し名か内部呼び出し名か) の系統間比較」。
//
// これまでは 9 系統 × 2 図 = 18 枚を 1 枚ずつ開き、「ラベルが何番目の呼び出しか」を
// 目で数えて初めて dma のズレに気付いた (クリック 18)。ズレは実在チェックを通って
// しまうので、開くまで在ることに気付く手掛かりも無かった。
// いまは下端の 整合 が件数に数え、押せばズレた系統が並び、行から系統チェックへ降りる。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

function stateDsl(to, label) {
  return ['@startuml', '[*] --> Idle', 'Idle --> ' + to + ' : ' + label, '@enduml'].join('\n');
}

function seqDsl(msgs) {
  return ['@startuml', 'actor App', 'participant Drv']
    .concat(msgs.map((m) => 'App -> Drv : ' + m))
    .concat(['@enduml']).join('\n');
}

// 慣習どおり「シーケンス冒頭のエントリ呼び出し名」をラベルにする系統。
function headFamily(key, entry) {
  return [
    [key + '_state', stateDsl('Configured', entry)],
    [key + '_init_sequence', seqDsl([entry, 'EnableClock', 'WriteConfig'])],
  ];
}

// dma だけ「末尾の内部呼び出し名」。ArmChannel は実在するので実在チェックは通る。
const DMA = [
  ['dma_state', stateDsl('Armed', 'ArmChannel')],
  ['dma_transfer_sequence', seqDsl(['SetSrcDst', 'WriteConfig', 'ArmChannel'])],
];

const KEYS = ['adc', 'gpio', 'timer', 'uart', 'spi', 'can', 'pwm', 'wdg'];

async function addDoc(page, name, dsl, first) {
  if (!first) await page.locator('#btn-tab-new').click();
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, dsl);
  await page.evaluate((n) => {
    const ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), n);
  }, name);
  await page.waitForTimeout(60);
}

// レビュー開始時点。9 系統 18 枚が既にワークスペースに開かれている。
async function setup(page) {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  await gotoApp(page);
  let docs = [];
  KEYS.forEach((k) => { docs = docs.concat(headFamily(k, k.charAt(0).toUpperCase() + k.slice(1) + '_Init')); });
  docs = docs.concat(DMA);
  let first = true;
  for (const [name, dsl] of docs) { await addDoc(page, name, dsl, first); first = false; }
  await page.evaluate(() => window.renderConsistencyBadge && window.renderConsistencyBadge());
  await page.waitForTimeout(200);
}

test.describe('BLK-reviewer-20260908-1703: ラベル位置のズレを開く前に知らせる', () => {
  test('下端の 整合 がズレを件数に数える (開くまで気付けない、をやめる)', async ({ page }) => {
    await setup(page);
    const btn = page.locator('#status-consistency');
    await expect(btn).toHaveAttribute('data-label-pos', '1');
    await expect(btn).toHaveClass('has-warning');
    await expect(btn).toHaveAttribute('title', /ラベル位置 1/);
  });

  test('整合性チェックにズレた系統が並び、どのラベルが何番目かまで出る', async ({ page }) => {
    await setup(page);
    await page.locator('#status-consistency').click();
    await expect(page.locator('#ck-summary')).toHaveAttribute('data-label-pos', '1');
    const row = page.locator('#ck-labelpos .ck-row');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('dma');
    await expect(row).toContainText('末尾');
    await expect(row).toContainText('ArmChannel');
    await expect(row).toContainText('3/3');
  });

  test('ズレの行から、その系統の系統チェックへ降りられる', async ({ page }) => {
    await setup(page);
    await page.locator('#status-consistency').click();
    await page.locator('#ck-labelpos .ck-row').first().click();
    await expect(page.locator('#fa-modal')).toBeVisible();
    await expect(page.locator('#fa-family')).toHaveValue('dma');
  });

  test('ズレが無ければ件数に出ない (慣習どおりの系統だけの日)', async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
    await gotoApp(page);
    let docs = [];
    ['adc', 'gpio', 'timer'].forEach((k) => {
      docs = docs.concat(headFamily(k, k.charAt(0).toUpperCase() + k.slice(1) + '_Init'));
    });
    let first = true;
    for (const [name, dsl] of docs) { await addDoc(page, name, dsl, first); first = false; }
    await page.evaluate(() => window.renderConsistencyBadge && window.renderConsistencyBadge());
    await expect(page.locator('#status-consistency')).toHaveAttribute('data-label-pos', '0');
  });

  test('実測 — 手順 4.11 が 18 枚を開かずに終わる', async ({ page }) => {
    test.setTimeout(180000);
    await setup(page);
    let clicks = 0, keys = 0;

    // 1. 下端の 整合 が「⚠ N」で在ることを言っている (押す前に 0 クリックで気付く)
    await expect(page.locator('#status-consistency')).toHaveAttribute('data-label-pos', '1');

    // 2. 押して、ズレた系統と「何番目を指しているか」を読む
    await page.locator('#status-consistency').click(); clicks++;
    await expect(page.locator('#ck-labelpos .ck-row')).toContainText('dma');

    // 3. その行から系統チェックへ降り、案内から遷移ごとの位置の列を見る
    //    (BLK-owner-20260924-1855-prune: 遷移ごとの表は 状態遷移のトレース漏れ の 1 枚に寄せた)
    await page.locator('#ck-labelpos .ck-row').first().click(); clicks++;
    await expect(page.locator('#fa-family')).toHaveValue('dma');
    await page.locator('#fa-open-trace').click(); clicks++;
    await expect(page.locator('#tc-family')).toHaveValue('dma');
    await expect(page.locator('#tc-table .tc-row').first().locator('.tc-pos'))
      .toHaveAttribute('data-odd', '1');

    console.log('MEASURE clicks=' + clicks + ' keys=' + keys);
    expect(clicks).toBeLessThanOrEqual(10);
    expect(keys).toBeLessThanOrEqual(50);
  });
});
