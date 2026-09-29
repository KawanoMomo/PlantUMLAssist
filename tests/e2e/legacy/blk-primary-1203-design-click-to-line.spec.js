// @ts-check
// BLK-primary-20260907-1203-design / design 5a「図をクリックしたら DSL の該当行へ移動」
// 図と DSL の対応を目で数えなくて済むように、図の要素を選ぶとエディタの該当行が
// 選択状態になる。設定 (エディタ) のトグルで切れる。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const SAMPLE = [
  '@startuml',
  'title Sample State',
  'state Idle',
  'state Running',
  '[*] --> Idle',
  'Idle --> Running : start',
  'Running --> Idle : stop',
  'Running --> [*] : done',
  '@enduml',
].join('\n');

async function openState(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(600);
  await page.evaluate((text) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = text;
    ed.dispatchEvent(new Event('input'));
  }, SAMPLE);
  await page.waitForTimeout(900);
}

// 図の要素は overlay の rect。data-type / data-line を持っている。
async function clickOverlay(page, type, id) {
  // 遷移は線の枠・ラベル・矢じりの複数枚で当たる。押すのは見えている 1 枚 (ラベルがあればラベル) (BLK-releaser-20260929-0851-2)
  const all = page.locator(`#overlay-layer [data-type="${type}"][data-id="${id}"]`);
  const label = all.and(page.locator('[data-hit-kind="linklabel"]'));
  await ((await label.count()) ? label.first() : all.first()).click();
  await page.waitForTimeout(300);
}

// 図で選んだ行: 本文欄の上の帯 (#editor-jump-band) が重なっている行の文字列。
// BLK-owner-20260930-0111-1: 図を押しても本文欄へはフォーカスを移さず、行全体を選択状態にもしない
// (続く Enter・文字キーで行が置き換わっていた)。以前はエディタの選択範囲で確かめていた。
// キャレットはその行の頭に置き、本文欄のフォーカスは図の側に残る。
function selectedText(page) {
  return page.evaluate(() => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    const band = document.getElementById('editor-jump-band');
    if (!band || band.hidden) return '';
    if (document.activeElement === ed) return 'FOCUSED';
    const n = Number(band.getAttribute('data-line'));
    const caretLine = ed.value.slice(0, ed.selectionStart).split('\n').length;
    if (caretLine !== n || ed.selectionStart !== ed.selectionEnd) return 'CARET-MISMATCH';
    return ed.value.split('\n')[n - 1];
  });
}

test.describe('BLK-primary-1203-design 図クリック→DSL 該当行へ移動', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('状態をクリックするとその宣言行が選択される', async ({ page }) => {
    await openState(page);
    await clickOverlay(page, 'state', 'Running');
    expect(await selectedText(page)).toBe('state Running');
  });

  test('遷移をクリックするとその遷移の行が選択される', async ({ page }) => {
    await openState(page);
    await clickOverlay(page, 'transition', '__t_1');
    expect(await selectedText(page)).toBe('Idle --> Running : start');
  });

  test('別の要素を選び直すと行も移る', async ({ page }) => {
    await openState(page);
    await clickOverlay(page, 'state', 'Idle');
    expect(await selectedText(page)).toBe('state Idle');
    await clickOverlay(page, 'transition', '__t_3');
    expect(await selectedText(page)).toBe('Running --> [*] : done');
  });

  test('設定 (エディタ) のトグルは既定で入っている', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#rail-config').click();
    await page.locator('.cfg-tab[data-cfg-tab="editor"]').click();
    await expect(page.locator('#cfg-editor-click-to-line')).toBeChecked();
  });

  test('トグルを切ると図をクリックしても行が動かない', async ({ page }) => {
    await openState(page);
    await page.locator('#rail-config').click();
    await page.locator('.cfg-tab[data-cfg-tab="editor"]').click();
    await page.locator('#cfg-editor-click-to-line').uncheck();
    await page.locator('#cfg-ok').click();
    await page.waitForTimeout(300);
    await clickOverlay(page, 'state', 'Running');
    expect(await selectedText(page)).toBe('');
  });

  test('切った指定は開き直しても残る', async ({ page }) => {
    await openState(page);
    await page.locator('#rail-config').click();
    await page.locator('.cfg-tab[data-cfg-tab="editor"]').click();
    await page.locator('#cfg-editor-click-to-line').uncheck();
    await page.locator('#cfg-ok').click();
    await page.waitForTimeout(300);
    await page.locator('#rail-config').click();
    await page.locator('.cfg-tab[data-cfg-tab="editor"]').click();
    await expect(page.locator('#cfg-editor-click-to-line')).not.toBeChecked();
  });

  test('構造 / Outline タブを見ているときは裏で動かさない', async ({ page }) => {
    await openState(page);
    await page.locator('#btn-editor-tab-outline').click();
    await page.waitForTimeout(300);
    await clickOverlay(page, 'state', 'Running');
    expect(await selectedText(page)).toBe('');
  });
});
