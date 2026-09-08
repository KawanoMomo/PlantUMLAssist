// @ts-check
// BLK-junior-20260907-0643: 一括入力欄は 1 手で複数件入るが、中身は利用者が
// 全部打つ設計なので、要素が少し増えるとキー入力 50 を超える (UART 初期化
// シーケンスで 308 字)。実際に打ち直しているのは「先輩の図」に既にある行なので、
// 他の図から選んで持ち込めることを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

const SPI_SEQ = [
  '@startuml',
  'actor Dev',
  'participant "SPI ドライバ" as SpiDrv',
  'participant Hal',
  'Dev -> SpiDrv : Spi_Init()',
  'SpiDrv -> Hal : Hal_Open()',
  'Hal --> SpiDrv : E_OK',
  '@enduml',
].join('\n');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(400);
}

// 先輩の図 (SPI) を 1 枚目に置き、2 枚目のタブで自分の図を作り始める。
async function twoTabs(page) {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-sequence');
  await page.waitForTimeout(400);
  await setDsl(page, SPI_SEQ);
  await page.locator('#btn-tab-new').click();
  await expect(page.locator('#tab-bar .tab')).toHaveCount(2);
  await page.locator('#diagram-type').selectOption('plantuml-sequence');
  await page.waitForTimeout(400);
  await setDsl(page, '@startuml\n@enduml');
  await expect(page.locator('#seq-tail-kind')).toBeVisible();
  await page.locator('#seq-tail-kind').selectOption('bulk');
  await expect(page.locator('#seq-tail-bulk')).toBeVisible();
}

test.describe('BLK-junior-0643 他の図から取り込む', () => {
  test('一括欄に「他の図から取り込む」ボタンがある', async ({ page }) => {
    await twoTabs(page);
    await expect(page.locator('#seq-tail-reuse')).toBeVisible();
  });

  test('先輩の図の行が候補に並び、いま編集中の図の行は出ない', async ({ page }) => {
    await twoTabs(page);
    await page.locator('#seq-tail-reuse').click();
    await expect(page.locator('#reuse-modal')).toBeVisible();
    const rows = page.locator('#reuse-list .reuse-row');
    await expect(rows).toHaveCount(6);
    await expect(page.locator('#reuse-list')).toContainText('participant "SPI ドライバ" as SpiDrv');
    await expect(page.locator('#reuse-list')).toContainText('Dev -> SpiDrv : Spi_Init()');
    // どの図から来た行かがタブ名で分かる (1 枚目の既定名 diagram1)。
    await expect(page.locator('#reuse-list')).toContainText('diagram1');
  });

  test('選んだ行が一括欄に入る (打鍵 0)、宣言が先に並ぶ', async ({ page }) => {
    await twoTabs(page);
    await page.locator('#seq-tail-reuse').click();
    await page.locator('#reuse-all').click();
    await page.locator('#reuse-confirm').click();
    await expect(page.locator('#reuse-modal')).toBeHidden();

    const bulk = await page.locator('#seq-tail-bulk').inputValue();
    const lines = bulk.split('\n');
    expect(lines.length).toBe(6);
    expect(lines[0]).toBe('actor Dev');
    expect(lines[2]).toBe('participant Hal');
    expect(lines[3]).toBe('Dev -> SpiDrv : Spi_Init()');
  });

  test('取り込んだ行をそのまま末尾に追加でき、図が描ける', async ({ page }) => {
    await twoTabs(page);
    await page.locator('#seq-tail-reuse').click();
    await page.locator('#reuse-all').click();
    await page.locator('#reuse-confirm').click();
    await page.locator('#seq-tail-add').click();

    await expect.poll(async () => await getEditorText(page)).toContain('Spi_Init()');
    const dsl = await getEditorText(page);
    expect(dsl).toContain('participant "SPI ドライバ" as SpiDrv');
    expect(dsl).toContain('Hal --> SpiDrv : E_OK');
    await page.waitForTimeout(1500);
    await expect(page.locator('#status-parse')).toHaveText('パース OK');
    await expect(page.locator('#preview-svg svg')).toBeVisible();
  });

  test('絞り込んで一部だけ取り込める', async ({ page }) => {
    await twoTabs(page);
    await page.locator('#seq-tail-reuse').click();
    await page.locator('#reuse-filter').fill('participant');
    await page.locator('#reuse-all').click();
    await page.locator('#reuse-confirm').click();

    const bulk = await page.locator('#seq-tail-bulk').inputValue();
    expect(bulk.split('\n').length).toBe(2);
    expect(bulk).toContain('participant Hal');
    expect(bulk).not.toContain('Spi_Init()');
  });

  test('書きかけの行は消えず、重複も増えない', async ({ page }) => {
    await twoTabs(page);
    await page.locator('#seq-tail-bulk').fill('actor Dev\nparticipant GpioDrv');
    await page.locator('#seq-tail-reuse').click();
    await page.locator('#reuse-all').click();
    await page.locator('#reuse-confirm').click();

    const lines = (await page.locator('#seq-tail-bulk').inputValue()).split('\n');
    expect(lines[0]).toBe('actor Dev');
    expect(lines[1]).toBe('participant GpioDrv');
    expect(lines.filter((l) => l === 'actor Dev').length).toBe(1);
    expect(lines).toContain('Dev -> SpiDrv : Spi_Init()');
  });

  test('キャンセルでは一括欄が変わらない', async ({ page }) => {
    await twoTabs(page);
    await page.locator('#seq-tail-bulk').fill('actor Dev');
    await page.locator('#seq-tail-reuse').click();
    await page.locator('#reuse-all').click();
    await page.locator('#reuse-cancel').click();
    await expect(page.locator('#reuse-modal')).toBeHidden();
    expect(await page.locator('#seq-tail-bulk').inputValue()).toBe('actor Dev');
  });

  test('同じ図種の他の図が無ければその旨を出す', async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-sequence');
    await page.waitForTimeout(400);
    await page.locator('#seq-tail-kind').selectOption('bulk');
    await page.locator('#seq-tail-reuse').click();
    await expect(page.locator('#reuse-empty')).toBeVisible();
  });
});
