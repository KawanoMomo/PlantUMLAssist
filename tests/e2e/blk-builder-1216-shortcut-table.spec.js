// @ts-check
// BLK-builder-20260907-1216-1 — design 5b「設定 — ショートカット」。
// 表を 4 グループに束ね、実装済み ● と 新設（未実装）を同じ表の上で区別し、
// 「⌕ 操作名で検索」で絞れる。表に「実装済み」と書いたキーは実際に効く。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

async function openShortcuts(page) {
  await gotoApp(page);
  await page.evaluate(() => localStorage.removeItem('plantuml-settings-tab'));
  await page.locator('#rail-config').click();
  await expect(page.locator('#cfg-modal')).toBeVisible();
  await page.locator('#cfg-tab-shortcuts').click();
  await expect(page.locator('#cfg-pane-shortcuts')).toBeVisible();
}

test.describe('設定のショートカット表 (design 5b)', () => {
  test('4 つのグループ見出しで束ねられ、効く状況が括弧で添えられる', async ({ page }) => {
    await openShortcuts(page);
    const heads = page.locator('#cfg-shortcuts-list .cfg-sc-heading');
    await expect(heads).toHaveCount(4);
    await expect(heads.nth(0)).toHaveText('全体');
    await expect(heads.nth(1)).toHaveText('図の編集（図形を選んでいるとき）');
    await expect(heads.nth(2)).toHaveText('DSL エディタ（テキスト欄にカーソルがあるとき）');
    await expect(heads.nth(3)).toHaveText('表示');
  });

  test('実装済み ● と 新設（未実装）が同じ表の上で区別される', async ({ page }) => {
    await openShortcuts(page);
    await expect(page.locator('#cfg-sc-legend')).toContainText('実装済み');
    await expect(page.locator('#cfg-sc-legend')).toContainText('新設（未実装）');
    // BLK-builder-20260907-1346-3: 残っていた 'new' の 2 行を実装したので、いま
    // 新設の行は 0 件である。design 5b が求めるのは「未実装の行も消さずに、実装済みと
    // 区別して載せる」仕組みなので、行が有ればそれが表に出て区別されることを見る。
    await expect(page.locator('#cfg-shortcuts-list tr[data-sc-state="done"]').first()).toBeVisible();
    const newRows = page.locator('#cfg-shortcuts-list tr[data-sc-state="new"]');
    if (await newRows.count()) {
      await expect(newRows.first()).toBeVisible();
      await expect(newRows.first().locator('.cfg-sc-new')).toHaveText('新設');
    }
  });

  test('「⌕ 操作名で検索」で表が絞られ、空にすると戻る', async ({ page }) => {
    await openShortcuts(page);
    const all = await page.locator('#cfg-shortcuts-list tr').count();
    await page.locator('#cfg-sc-search').fill('コマンドパレット');
    await expect(page.locator('#cfg-shortcuts-list tr')).toHaveCount(1);
    await expect(page.locator('#cfg-shortcuts-list .cfg-sc-heading')).toHaveCount(1);
    await expect(page.locator('#cfg-shortcuts-list')).toContainText('Ctrl+K');

    await page.locator('#cfg-sc-search').fill('');
    await expect(page.locator('#cfg-shortcuts-list tr')).toHaveCount(all);
  });

  test('検索はキー文字列でも当たる', async ({ page }) => {
    await openShortcuts(page);
    await page.locator('#cfg-sc-search').fill('Ctrl+D');
    await expect(page.locator('#cfg-shortcuts-list')).toContainText('選択を複製する');
  });

  test('該当が無ければ表ではなくその旨が出る', async ({ page }) => {
    await openShortcuts(page);
    await page.locator('#cfg-sc-search').fill('存在しない操作名');
    await expect(page.locator('#cfg-sc-empty')).toContainText('該当する操作がありません');
    await expect(page.locator('#cfg-shortcuts-list tr')).toHaveCount(0);
  });
});

test.describe('表に「実装済み」と書いたキーが実際に効く (design 5b)', () => {
  test('Ctrl+1 … Ctrl+6 で図の種類が切り替わる', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#preview-container').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+2');
    await expect(page.locator('#diagram-type')).toHaveValue('plantuml-usecase');
    await page.keyboard.press('Control+6');
    await expect(page.locator('#diagram-type')).toHaveValue('plantuml-state');
    await page.keyboard.press('Control+1');
    await expect(page.locator('#diagram-type')).toHaveValue('plantuml-sequence');
  });

  test('Ctrl+ + / − で倍率が動き、Ctrl+0 で幅に合わせる', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#preview-container').click({ position: { x: 5, y: 5 } });
    const pct = () => page.locator('#zoom-display').textContent();
    await page.keyboard.press('Control+Equal');
    expect(await pct()).toBe('110%');
    await page.keyboard.press('Control+Minus');
    await page.keyboard.press('Control+Minus');
    expect(await pct()).toBe('90%');
    await page.keyboard.press('Control+0');
    expect(await pct()).not.toBe('90%');
  });

  test('Ctrl+R で再描画が走る', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#preview-container').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+r');
    // ブラウザ既定 (再読み込み) を奪えていれば、同じページのまま描画し直す。
    await page.waitForTimeout(1500);
    await expect(page.locator('#preview-svg svg')).toBeVisible();
    await expect(page.locator('#cfg-modal')).toBeHidden();
  });

  test('Esc で選択が外れる。DSL は 1 文字も変わらない', async ({ page }) => {
    await gotoApp(page);
    const before = await getEditorText(page);
    const target = page.locator('#overlay-layer rect[data-line]').first();
    if ((await target.count()) === 0) test.skip();
    await target.click();
    await page.waitForTimeout(300);
    const selected = await page.evaluate(() => window.MA.selection.getSelected().length);
    expect(selected).toBeGreaterThan(0);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.MA.selection.getSelected().length)).toBe(0);
    expect(await getEditorText(page)).toBe(before);
  });

  // 「表示」グループには「テキスト欄にカーソルがあるとき」の但し書きが無い =
  // どこにいても効く。DSL を書きながら図種を送れる方が台本の往復に合う。
  test('「表示」のキーは DSL エディタにカーソルがあっても効く', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#editor').click();
    await page.keyboard.press('Control+3');
    await expect(page.locator('#diagram-type')).toHaveValue('plantuml-component');
  });

  // ただし他のフォーム欄 (設定モーダルなど) では奪わない。値の入力中に
  // 背後の図種が変わると、何を編集しているのか分からなくなる。
  test('設定モーダルのテキスト欄に入力中は図種を奪わない', async ({ page }) => {
    await openShortcuts(page);
    const before = await page.locator('#diagram-type').inputValue();
    await page.locator('#cfg-sc-search').click();
    await page.keyboard.press('Control+3');
    await page.waitForTimeout(300);
    await expect(page.locator('#diagram-type')).toHaveValue(before);
  });

  test('操作中に console error が出ない', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await openShortcuts(page);
    await page.locator('#cfg-sc-search').fill('ctrl');
    await page.locator('#cfg-sc-search').fill('');
    expect(errors).toEqual([]);
  });
});
