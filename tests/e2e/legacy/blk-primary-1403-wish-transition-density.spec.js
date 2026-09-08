// @ts-check
// BLK-primary-20260908-1403-wish: レビュー指摘「dma_state だけ 1 メッセージが 4 遷移」を
// 反映するのに、指摘の文章を読む → 他系統を自分で開いて見比べる → 直す、の 3 段階を踏んでいた。
// 系統チェックに遷移密度の一覧を置き、「一覧を見る → 外れた dma だけ開いて直す」の 2 段階にする。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

function seqDsl(prefix, msgs) {
  return ['@startuml', 'participant App', 'participant ' + prefix]
    .concat(msgs.map((m) => 'App -> ' + prefix + ' : ' + m))
    .concat(['@enduml']).join('\n');
}

function stateDsl(pairs) {
  return ['@startuml', '[*] --> Idle']
    .concat(pairs.map((p) => p[0] + ' --> ' + p[1] + ' : ' + p[2]))
    .concat(['@enduml']).join('\n');
}

// 1 メッセージ 1 遷移の系統 (adc / can / uart)。
function oneToOne(key) {
  const cap = key[0].toUpperCase() + key.slice(1);
  return [
    [key + '_state', stateDsl([['Idle', 'Configured', cap + '_Init'], ['Configured', 'Done', cap + '_Start']])],
    [key + '_init_sequence', seqDsl(cap, [cap + '_Init', cap + '_Start'])],
  ];
}

// dma だけ 1 メッセージが 4 遷移に分解されている (指摘そのもの)。
const DMA = [
  ['dma_state', stateDsl([
    ['Idle', 'Configured', 'Dma_Configure'],
    ['Configured', 'SrcDstSet', 'Dma_SetSrcDst'],
    ['SrcDstSet', 'DmaReqEnabled', 'Dma_EnableReq'],
    ['DmaReqEnabled', 'Transferring', 'Dma_Arm'],
    ['Transferring', 'Done', 'Dma_Complete'],
    ['Done', 'Idle', 'Dma_Ack'],
    ['Idle', 'Error', 'Dma_Fault'],
    ['Error', 'Idle', 'Dma_Reset'],
  ])],
  ['dma_init_sequence', seqDsl('Dma', ['Dma_Configure', 'Dma_Complete'])],
];

async function freshWorkspace(page) {
  await page.addInitScript(() => {
    try { window.localStorage.clear(); } catch (e) {}
  });
}

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
  await page.waitForTimeout(80);
}

async function setupFamilies(page) {
  await gotoApp(page);
  const docs = [].concat(oneToOne('adc'), oneToOne('can'), oneToOne('uart'), DMA);
  let first = true;
  for (const [name, dsl] of docs) {
    await addDoc(page, name, dsl, first);
    first = false;
  }
}

async function openFamily(page) {
  await page.locator('#btn-tab-family').click();
  await expect(page.locator('#fa-modal')).toBeVisible();
}

test.describe('BLK-primary-1403-wish: 系統ごとの遷移密度を一覧で見る', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('系統ごとの遷移/メッセージが並び、外れた系統が先頭に来る', async ({ page }) => {
    await setupFamilies(page);
    await openFamily(page);
    const table = page.locator('#fd-table');
    await expect(table).toBeVisible();
    await expect(page.locator('#fd-table .fd-row')).toHaveCount(4);
    // 見比べる相手を選ばずに、外れた系統が最初の行に出る
    const first = page.locator('#fd-table .fd-row').nth(0);
    await expect(first).toHaveAttribute('data-key', 'dma');
    await expect(first).toHaveAttribute('data-outlier', '1');
    await expect(first.locator('.fd-density')).toHaveText('4.00');
    await expect(first).toContainText('他系統より細かく分解されています');
    // 他の 3 系統は 1 メッセージ 1 遷移で、外れ値ではない
    await expect(page.locator('#fd-table .fd-outlier')).toHaveCount(1);
  });

  test('見出しが中央値と外れた系統を名指しする', async ({ page }) => {
    await setupFamilies(page);
    await openFamily(page);
    const sum = page.locator('#fd-summary');
    await expect(sum).toHaveAttribute('data-outliers', '1');
    await expect(sum).toHaveAttribute('data-median', '1');
    await expect(sum).toContainText('中央値 1.00 から外れた系統 1 件: dma');
  });

  test('揃っていれば「揃っています」と出て、外れ値の行は無い', async ({ page }) => {
    await gotoApp(page);
    const docs = [].concat(oneToOne('adc'), oneToOne('can'), oneToOne('uart'));
    let first = true;
    for (const [name, dsl] of docs) { await addDoc(page, name, dsl, first); first = false; }
    await openFamily(page);
    await expect(page.locator('#fd-summary')).toContainText('揃っています');
    await expect(page.locator('#fd-table .fd-outlier')).toHaveCount(0);
  });

  test('外れた系統を開いた時点で選んでおり、行を押せば他系統の突合表へ移れる', async ({ page }) => {
    await setupFamilies(page);
    await openFamily(page);
    // 開いた時点で dma が選ばれている (指摘の相手を探し直さない)
    await expect(page.locator('#fa-family')).toHaveValue('dma');
    await page.locator('#fd-table .fd-row[data-key="adc"]').click();
    await expect(page.locator('#fa-family')).toHaveValue('adc');
  });

  test('台本 5.5 の手数: 一覧を見て外れた dma の DSL に着くまで', async ({ page }) => {
    await setupFamilies(page);
    let clicks = 0;
    const keys = 0;
    await page.locator('#btn-tab-family').click(); clicks++;
    await expect(page.locator('#fa-modal')).toBeVisible();
    // 1 画面で「どの系統が外れているか」が読める
    await expect(page.locator('#fd-table .fd-row').nth(0)).toHaveAttribute('data-key', 'dma');
    // その系統の突合表はもう出ているので、閉じれば dma_state を直しに行ける
    await page.locator('#fa-close').click(); clicks++;
    expect(clicks).toBeLessThanOrEqual(10);
    expect(keys).toBeLessThanOrEqual(50);
  });
});
