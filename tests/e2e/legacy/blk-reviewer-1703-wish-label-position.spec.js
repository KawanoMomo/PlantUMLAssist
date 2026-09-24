// @ts-check
// BLK-reviewer-20260908-1703-wish: 遷移ラベルが実在メッセージに直っていても、
// 他系統が「シーケンス冒頭のエントリ呼び出し名」を使っているのに 1 系統だけ
// 「末尾の内部呼び出し名」を使っている、という慣習のズレは実在チェックでは出ない。
// 系統チェックを開いた時点で、どの系統がどの位置を指しているかが並ぶことを実機で見る。
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

// 頭のエントリ呼び出しをラベルにする系統 (慣習)。
function headFamily(key, entry) {
  return [
    [key + '_state', stateDsl('Configured', entry)],
    [key + '_init_sequence', seqDsl([entry, 'EnableClock', 'WriteConfig'])],
  ];
}

// 末尾の内部呼び出しをラベルにする系統 (今回のズレ)。
const DMA = [
  ['dma_state', stateDsl('Armed', 'ArmChannel')],
  ['dma_transfer_sequence', seqDsl(['SetSrcDst', 'WriteConfig', 'ArmChannel'])],
];

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

async function setup(page) {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  await gotoApp(page);
  const docs = [].concat(headFamily('adc', 'Adc_Init'), headFamily('spi', 'Spi_Init'), DMA);
  let first = true;
  for (const [name, dsl] of docs) { await addDoc(page, name, dsl, first); first = false; }
  await page.locator('#btn-tab-family').click();
  await expect(page.locator('#fa-modal')).toBeVisible();
}

test.describe('BLK-reviewer-1703-wish: ラベル位置の慣習を系統横断で並べる', () => {
  test('系統ごとに位置が並び、ズレた系統が上に来る', async ({ page }) => {
    await setup(page);
    const rows = page.locator('#lp-table .lp-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toHaveAttribute('data-key', 'dma');
    await expect(rows.first()).toHaveAttribute('data-odd', '1');
    await expect(rows.first().locator('.lp-pos')).toContainText('末尾');
    // 例の欄で「どのラベルが何番目を指しているか」まで読める
    await expect(rows.first().locator('.lp-example')).toContainText('ArmChannel');
    await expect(rows.first().locator('.lp-example')).toContainText('3/3');
    await expect(page.locator('#lp-table .lp-odd')).toHaveCount(1);
  });

  test('見出しが多数派の慣習とズレの件数を言う', async ({ page }) => {
    await setup(page);
    const s = page.locator('#lp-summary');
    await expect(s).toHaveAttribute('data-common', 'head');
    await expect(s).toHaveAttribute('data-odd', '1');
    await expect(s).toContainText('先頭');
    await expect(s).toContainText('1 件 / 3 件');
  });

  // BLK-owner-20260924-1855-prune: 遷移ごとの表は 状態遷移のトレース漏れ (#tc-table) の 1 枚に
  // 寄せたので、ズレた系統の行はその系統を選んだトレース漏れを開く。
  test('ズレた行から、その系統の遷移ごとの表へ降りられる', async ({ page }) => {
    await setup(page);
    await page.locator('#lp-table .lp-row[data-key="dma"]').click();
    await expect(page.locator('#fa-modal')).toBeHidden();
    await expect(page.locator('#tc-modal')).toBeVisible();
    await expect(page.locator('#tc-family')).toHaveValue('dma');
    await expect(page.locator('#tc-summary')).toHaveAttribute('data-pos-odd', '1');
    await expect(page.locator('#tc-summary')).toContainText('ラベル位置が慣習とズレ 1 件');
    // 表の行に位置の列が出て、ズレた行が色分けされる
    const cell = page.locator('#tc-table .tc-row').first().locator('.tc-pos');
    await expect(cell).toHaveAttribute('data-position', 'tail');
    await expect(cell).toHaveAttribute('data-odd', '1');
    await expect(cell).toContainText('末尾 3/3');
  });
});
