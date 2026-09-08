// @ts-check
// BLK-primary-20260908-1403: レビュー指摘「dma_state.puml の 4 遷移を 1 遷移
// (Dma_Configure) にまとめる」を、DSL を打ち直さずに右パネルから当てる。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const DMA = [
  '@startuml',
  'title DMA',
  'state Idle',
  'state Configured',
  'state SrcDstSet',
  'state DmaReqEnabled',
  'state Transferring_Active',
  'Idle --> Configured : Dma_Init',
  'Configured --> SrcDstSet : Dma_SetSrcDst',
  'SrcDstSet --> DmaReqEnabled : Dma_EnableReq',
  'DmaReqEnabled --> Transferring_Active : Dma_Start',
  'Transferring_Active --> Idle : Dma_Stop',
  '@enduml',
].join('\n');

async function openState(page, text) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(600);
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(800);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
});

test('始点と終点を選んで名前を入れると 4 遷移が 1 本になる', async ({ page }) => {
  await openState(page, DMA);
  await expect(page.locator('#st-collapse')).toBeVisible();

  await page.locator('#st-cl-from').selectOption('Idle');
  await page.locator('#st-cl-to').selectOption('Transferring_Active');
  await page.locator('#st-cl-label').fill('Dma_Configure');
  await expect(page.locator('#st-cl-preview')).toHaveText('Idle --> Transferring_Active : Dma_Configure');
  await page.locator('#st-cl-run').click();
  await page.waitForTimeout(600);

  const text = await getEditorText(page);
  expect(text).toContain('Idle --> Transferring_Active : Dma_Configure');
  expect(text).toContain('Transferring_Active --> Idle : Dma_Stop');
  for (const id of ['Configured', 'SrcDstSet', 'DmaReqEnabled']) {
    expect(text).not.toContain(id);
  }
});

test('押す前に「何遷移をまとめ、いくつ消えるか」が出る', async ({ page }) => {
  await openState(page, DMA);
  await page.locator('#st-cl-from').selectOption('Idle');
  await page.locator('#st-cl-to').selectOption('Transferring_Active');
  await expect(page.locator('#st-cl-note')).toContainText('4 遷移を 1 本にまとめ');
  await expect(page.locator('#st-cl-note')).toContainText('3 個');
});

test('名前は畳む前のきっかけを並べた下書きが入る', async ({ page }) => {
  await openState(page, DMA);
  await page.locator('#st-cl-from').selectOption('Idle');
  await page.locator('#st-cl-to').selectOption('SrcDstSet');
  await expect(page.locator('#st-cl-label')).toHaveValue('Dma_Init / Dma_SetSrcDst');
});

test('途中までを選べば、その先はそのまま残る', async ({ page }) => {
  await openState(page, DMA);
  await page.locator('#st-cl-from').selectOption('Idle');
  await page.locator('#st-cl-to').selectOption('SrcDstSet');
  await page.locator('#st-cl-label').fill('Dma_Configure');
  await page.locator('#st-cl-run').click();
  await page.waitForTimeout(600);
  const text = await getEditorText(page);
  expect(text).toContain('Idle --> SrcDstSet : Dma_Configure');
  expect(text).toContain('SrcDstSet --> DmaReqEnabled : Dma_EnableReq');
  expect(text).not.toContain('Configured');
});

test('まとめられる 1 本道が無い図では欄そのものを出さない', async ({ page }) => {
  await openState(page, [
    '@startuml',
    'state A', 'state B', 'state C',
    'A --> B : go',
    'A --> C : ng',
    '@enduml',
  ].join('\n'));
  await expect(page.locator('#st-collapse')).toHaveCount(0);
});

test('元に戻すで畳む前の DSL に戻る', async ({ page }) => {
  await openState(page, DMA);
  await page.locator('#st-cl-from').selectOption('Idle');
  await page.locator('#st-cl-to').selectOption('Transferring_Active');
  await page.locator('#st-cl-label').fill('Dma_Configure');
  await page.locator('#st-cl-run').click();
  await page.waitForTimeout(600);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(600);
  expect(await getEditorText(page)).toContain('Configured --> SrcDstSet : Dma_SetSrcDst');
});

// friction の判定: 起票者の手順 (指摘の反映) をクリック数・キー入力数で測る。
test('指摘の反映がクリック 10 以下・キー入力 50 以下で終わる', async ({ page }) => {
  await openState(page, DMA);
  await page.evaluate(() => {
    window.__m = { clicks: 0, keys: 0 };
    document.addEventListener('click', () => { window.__m.clicks++; }, true);
    document.addEventListener('keydown', () => { window.__m.keys++; }, true);
  });

  await page.locator('#st-cl-from').selectOption('Idle');          // 始点を選ぶ
  await page.locator('#st-cl-to').selectOption('Transferring_Active'); // 終点を選ぶ
  await page.locator('#st-cl-label').click();
  await page.keyboard.type('Dma_Configure');                        // 残す 1 本の名前
  await page.locator('#st-cl-run').click();                         // まとめる
  await page.waitForTimeout(600);

  expect(await getEditorText(page)).toContain('Idle --> Transferring_Active : Dma_Configure');
  const m = await page.evaluate(() => window.__m);
  console.log('BLK-primary-20260908-1403 実測: クリック ' + m.clicks + ' / キー入力 ' + m.keys);
  expect(m.clicks).toBeLessThanOrEqual(10);
  expect(m.keys).toBeLessThanOrEqual(50);
});
