// @ts-check
// BLK-primary-20260908-1603-wish 「ラベル突合表」。
// 遷移密度は件数しか見ないので、件数は揃っているのにラベルだけが架空
// (dma_state の Dma_Configure がシーケンスのどのメッセージとも一致しない)
// というケースは表に出なかった。⇉ 系統チェックの遷移密度表の隣に
// 「遷移ラベル × シーケンスのメッセージ」が並び、対応が無い行が先頭に来て、
// 実在するメッセージ名が読めて、行からその図の行へ飛べること。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const STATE = [
  '@startuml',
  '[*] --> Idle',
  'Idle --> Configured : Dma_Configure',
  'Configured --> Transferring : StartTransfer',
  '@enduml',
].join('\n');

const SEQ = [
  '@startuml',
  'participant App', 'participant Dma',
  'App -> Dma : SetSrcDst',
  'App -> Dma : ArmChannel',
  'App -> Dma : StartTransfer',
  '@enduml',
].join('\n');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(600);
}

async function openFamily(page) {
  await gotoApp(page);
  await page.evaluate(() => {
    var ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), 'dma_state');
  });
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(400);
  await setDsl(page, STATE);

  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    var ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), 'dma_transfer_sequence');
  });
  await page.locator('#diagram-type').selectOption('plantuml-sequence');
  await page.waitForTimeout(400);
  await setDsl(page, SEQ);

  await page.locator('#btn-tab-family').click();
  await expect(page.locator('#fa-modal')).toBeVisible();
}

test('遷移密度表の隣にラベル突合表が並び、対応が無い行が先頭に来る', async ({ page }) => {
  await openFamily(page);
  await expect(page.locator('#fd-table')).toBeVisible();
  await expect(page.locator('#fl-table')).toBeVisible();

  const first = page.locator('#fl-table tr.fl-row').first();
  await expect(first).toHaveAttribute('data-status', 'missing');
  await expect(first.locator('.fl-label')).toHaveText('Dma_Configure');
  await expect(page.locator('#fl-summary')).toHaveAttribute('data-missing', '1');
  await expect(page.locator('#fl-summary')).toContainText('対応するメッセージが無いラベル 1 件');
});

test('対応した行はシーケンスの実在メッセージ名で答える', async ({ page }) => {
  await openFamily(page);
  const ok = page.locator('#fl-table tr.fl-row[data-label="StartTransfer"]');
  await expect(ok).toHaveAttribute('data-status', 'covered');
  await expect(ok.locator('.fl-match')).toHaveText('StartTransfer');
});

test('架空のラベルの行には、その系統に実在するメッセージ名が並ぶ', async ({ page }) => {
  await openFamily(page);
  const bad = page.locator('#fl-table tr.fl-missing').first();
  const text = await bad.locator('.fl-match').textContent();
  expect(text).toContain('実在するメッセージ');
  expect(text).toContain('ArmChannel');
});

test('行を押すと、その遷移が書かれた状態遷移図のその行へ飛ぶ', async ({ page }) => {
  await openFamily(page);
  await page.locator('#fl-table tr.fl-missing').first().click();
  await expect(page.locator('#fa-modal')).toBeHidden();

  const name = await page.evaluate(() => {
    var ws = window.MA.workspace;
    var id = ws.getActiveId();
    var hit = '';
    ws.list().forEach(function(d) { if (d.id === id) hit = d.name; });
    return hit;
  });
  expect(name).toBe('dma_state');
  // 該当行 (3 行目の Dma_Configure) が選択されている
  const sel = await page.evaluate(() => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    return ed.value.substring(ed.selectionStart, ed.selectionEnd);
  });
  expect(sel).toContain('Dma_Configure');
});
