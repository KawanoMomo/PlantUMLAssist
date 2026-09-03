// @ts-check
// FEAT-109 / [AC-1]〜[AC-6]
// State 図でも ↑↓ で選択を DSL 行順に移し、Enter で挿入 modal を開く。
// 🔴 手数 (charter §5) は本 spec では測らない。§5 はシーケンス図が対象である。
// スクリーンショットは test-results/ にのみ保存する
// (docs/images は git status --porcelain の保護対象のため書かない)。
const path = require('path');
const { test, expect } = require('@playwright/test');

const SHOT_DIR = path.join(__dirname, '..', '..', 'test-results', 'feat-109');

// 既定テンプレート: 2:[*]-->Idle / 3:state Idle / 4:state Active
//                   5:Idle-->Active / 6:Active-->[*]
async function bootState(page) {
  await page.goto('/');
  await page.waitForSelector('#preview-svg', { timeout: 5000 });
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(500);
}

async function selectByLine(page, line) {
  return page.evaluate((l) => {
    var st = window.MA.modules.plantumlState;
    var items = st.kbdSelectables(st.parse(document.getElementById('editor').value));
    var it = items.filter(function(x) { return x.line === l; })[0];
    if (!it) return null;
    window.MA.selection.setSelected([{ type: it.type, id: it.id, line: it.line }]);
    return it.id;
  }, line);
}

function currentSelection(page) {
  return page.evaluate(() => (window.MA.selection.getSelected() || [])[0] || null);
}

async function blurToBody(page) {
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    document.body.focus();
  });
}

function modalDisplay(page) {
  return page.locator('#st-modal').evaluate((el) => el.style.display);
}

test.describe('FEAT-109: State 図の ↑↓ 選択移動と Enter 挿入', () => {
  test('[AC-1] ↑↓ で DSL 行順の前後の要素へ選択が移る (state / transition をまたぐ)', async ({ page }) => {
    await bootState(page);
    expect(await selectByLine(page, 3)).toBeTruthy(); // state Idle
    await blurToBody(page);

    await page.keyboard.press('ArrowDown');
    let sel = await currentSelection(page);
    expect(sel.line).toBe(4);
    expect(sel.type).toBe('state'); // state Active

    await page.keyboard.press('ArrowDown');
    sel = await currentSelection(page);
    expect(sel.line).toBe(5);
    // 🔴 type がハードコード 'message' のままだと選択の再解決に失敗する。
    expect(sel.type).toBe('transition');

    await page.keyboard.press('ArrowUp');
    expect((await currentSelection(page)).line).toBe(4);
  });

  test('[AC-2] 端では選択が変わらず DSL も 1 バイトも書き換わらない', async ({ page }) => {
    await bootState(page);
    await selectByLine(page, 2); // 先頭の遷移
    await blurToBody(page);
    const before = await page.locator('#editor').inputValue();

    await page.keyboard.press('ArrowUp');
    expect((await currentSelection(page)).line).toBe(2);
    expect(await page.locator('#editor').inputValue()).toBe(before);

    await selectByLine(page, 6); // 末尾の遷移
    await blurToBody(page);
    await page.keyboard.press('ArrowDown');
    expect((await currentSelection(page)).line).toBe(6);
    expect(await page.locator('#editor').inputValue()).toBe(before);
  });

  test('[AC-3] Enter で st-modal が選択行の直後 (after) を挿入位置として開く', async ({ page }) => {
    await bootState(page);
    await selectByLine(page, 3);
    await blurToBody(page);

    await page.keyboard.press('Enter');
    await page.waitForSelector('#st-modal-content h3');
    expect(await modalDisplay(page)).toBe('flex');
    expect(await page.locator('#st-modal-content h3').textContent()).toContain('後に挿入 (L3)');
    await page.screenshot({ path: path.join(SHOT_DIR, 'ac3-enter-opens-state-insert-modal.png') });
  });

  test('[AC-4] textarea にフォーカスがある間は ↑↓ / Enter を素通しする', async ({ page }) => {
    await bootState(page);
    await selectByLine(page, 3);
    await page.locator('#editor').focus();

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    expect(await modalDisplay(page)).toBe('none');
    expect((await currentSelection(page)).line).toBe(3);
  });

  test('[AC-5] modal 表示中は ↑↓ / Enter が二重発火しない', async ({ page }) => {
    await bootState(page);
    await selectByLine(page, 3);
    await blurToBody(page);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#st-modal-content h3');

    await blurToBody(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    // 選択は動かず、modal のタイトル (挿入位置) も開き直されない。
    expect((await currentSelection(page)).line).toBe(3);
    expect(await page.locator('#st-modal-content h3').textContent()).toContain('後に挿入 (L3)');
  });
});
