// @ts-check
// BLK-primary-20260906-2243: 単一図の中の 1 行だけを選んで書き換える。
// レビュー指摘でメッセージ名 1 語を直すのに、エディタを全選択して図全体を
// 打ち直していた (2 図で keys=877)。行編集パネルで、直す行を選んでその行だけ
// 打ち替えれば済むことを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

const DMA_SEQ = [
  '@startuml',
  'participant DmaDrv',
  'participant SpiHw',
  'DmaDrv -> SpiHw: arm',
  'DmaDrv -> SpiHw: send',
  'SpiHw --> DmaDrv: ack',
  '@enduml',
].join('\n');

const DMA_STATE = [
  '@startuml',
  '[*] --> Idle',
  'state Busy',
  'Idle --> Busy : send',
  'Busy --> Idle : done',
  '@enduml',
].join('\n');

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

async function openLinePanel(page) {
  await page.locator('#btn-tab-lines').click();
  await expect(page.locator('#lines-panel')).toHaveClass(/open/);
}

// 一覧のうち text を含む行を選ぶ。
async function pickLine(page, text) {
  await page.locator('#lines-list .line-row', { hasText: text }).first().click();
  await expect(page.locator('#lines-text')).toBeEnabled();
}

test.describe('BLK-primary-2243 単一図の行編集', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('行一覧は @startuml などを除いた編集対象だけを出す', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DMA_SEQ);
    await openLinePanel(page);
    const rows = page.locator('#lines-list .line-row');
    // participant 2 + メッセージ 3 = 5 行 (@startuml / @enduml は出ない)
    await expect(rows).toHaveCount(5);
    await expect(page.locator('#lines-list')).not.toContainText('@startuml');
    await expect(page.locator('#lines-list .line-row[data-line-kind="arrow"]')).toHaveCount(3);
  });

  test('絞り込むと該当行だけが残り、行番号は元のまま', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DMA_SEQ);
    await openLinePanel(page);
    await page.locator('#lines-filter').fill('send');
    const rows = page.locator('#lines-list .line-row');
    await expect(rows).toHaveCount(1);
    // DSL 上は 5 行目 (0 始まりで 4)
    await expect(rows.first()).toHaveAttribute('data-line-index', '4');
  });

  test('選んだ 1 行だけを書き換え、他の行は変わらない', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DMA_SEQ);
    await openLinePanel(page);
    await pickLine(page, 'send');
    // 行全体が入力欄に入るので、直したい語だけ打ち替えれば済む
    await expect(page.locator('#lines-text')).toHaveValue('DmaDrv -> SpiHw: send');
    await page.locator('#lines-text').fill('DmaDrv -> SpiHw: Spi_Transmit');
    await page.locator('#btn-lines-apply').click();
    await page.waitForTimeout(300);

    const after = await getEditorText(page);
    expect(after.split('\n')).toEqual([
      '@startuml',
      'participant DmaDrv',
      'participant SpiHw',
      'DmaDrv -> SpiHw: arm',
      'DmaDrv -> SpiHw: Spi_Transmit',
      'SpiHw --> DmaDrv: ack',
      '@enduml',
    ]);
  });

  test('状態遷移図の遷移ラベルも同じ手順で直せる', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DMA_STATE);
    await openLinePanel(page);
    await pickLine(page, 'Idle --> Busy');
    await page.locator('#lines-text').fill('Idle --> Busy : Spi_Transmit');
    await page.locator('#btn-lines-apply').click();
    await page.waitForTimeout(300);
    const after = await getEditorText(page);
    expect(after).toContain('Idle --> Busy : Spi_Transmit');
    expect(after).toContain('Busy --> Idle : done');
    expect(after).not.toContain(': send');
  });

  test('選んだ行の下に 1 本挿入できる (途中挿入)', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DMA_SEQ);
    await openLinePanel(page);
    await pickLine(page, 'arm');
    await page.locator('#lines-text').fill('SpiHw --> DmaDrv: armed');
    await page.locator('#btn-lines-insert-after').click();
    await page.waitForTimeout(300);
    const lines = (await getEditorText(page)).split('\n');
    expect(lines[3]).toBe('DmaDrv -> SpiHw: arm');
    expect(lines[4]).toBe('SpiHw --> DmaDrv: armed');
    expect(lines[5]).toBe('DmaDrv -> SpiHw: send');
  });

  test('選んだ行の上にも挿入できる', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DMA_SEQ);
    await openLinePanel(page);
    await pickLine(page, 'send');
    await page.locator('#lines-text').fill('DmaDrv -> DmaDrv: prepare');
    await page.locator('#btn-lines-insert-before').click();
    await page.waitForTimeout(300);
    const lines = (await getEditorText(page)).split('\n');
    expect(lines[4]).toBe('DmaDrv -> DmaDrv: prepare');
    expect(lines[5]).toBe('DmaDrv -> SpiHw: send');
  });

  test('選んだ行を削除できる', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DMA_SEQ);
    await openLinePanel(page);
    await pickLine(page, 'ack');
    await page.locator('#btn-lines-delete').click();
    await page.waitForTimeout(300);
    const after = await getEditorText(page);
    expect(after).not.toContain('ack');
    expect(after).toContain('DmaDrv -> SpiHw: send');
  });

  test('書換は undo 1 手で元に戻る', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DMA_SEQ);
    await openLinePanel(page);
    await pickLine(page, 'send');
    await page.locator('#lines-text').fill('DmaDrv -> SpiHw: Spi_Transmit');
    await page.locator('#btn-lines-apply').click();
    await expect.poll(() => getEditorText(page)).toContain('Spi_Transmit');

    await page.locator('#btn-lines-close').click();
    await page.locator('#editor').click();
    await page.keyboard.press('Control+z');
    await expect.poll(() => getEditorText(page)).toBe(DMA_SEQ);
  });

  test('行を選ぶまで操作ボタンは押せない', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DMA_SEQ);
    await openLinePanel(page);
    await expect(page.locator('#btn-lines-apply')).toBeDisabled();
    await expect(page.locator('#btn-lines-delete')).toBeDisabled();
    await expect(page.locator('#lines-summary')).toContainText('行を選んで');
  });
});
