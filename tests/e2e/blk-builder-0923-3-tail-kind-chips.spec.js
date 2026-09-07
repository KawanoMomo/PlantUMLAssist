// @ts-check
// BLK-builder-20260907-0923-3 / design「1a 展開」2b — 無選択時の右ペイン(追加タブ)。
// 「末尾に追加」の種別がプルダウン 1 個だったので、何が足せるかは開くまで分からず
// 選ぶのに 2 手かかった。同じ選択肢をチップにして 1 クリックで決まることと、
// 値の持ち主が従来どおり select のままであること(既存の経路が壊れないこと)を見る。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

// 6 図種すべてに同じ形のチップが出る。[図種の value, select の id, 押すチップの値]
const TYPES = [
  ['plantuml-sequence', 'seq-tail-kind', 'bulk'],
  ['plantuml-state', 'st-tail-kind', 'bulk'],
  ['plantuml-class', 'cl-tail-kind', 'note'],
  ['plantuml-component', 'co-tail-kind', 'interface'],
  ['plantuml-usecase', 'uc-tail-kind', 'bulk'],
  ['plantuml-activity', 'ac-tail-kind', 'if'],
];

async function openPane(page, diagramType, selectId) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption(diagramType);
  await page.waitForTimeout(500);
  await expect(page.locator('#' + selectId)).toBeVisible();
  await expect(page.locator('#' + selectId + '-chips')).toBeVisible();
}

test.describe('BLK-builder-0923-3 種別チップ (design 2b)', () => {
  for (const [diagramType, selectId, pick] of TYPES) {
    test(`${diagramType}: チップが select の選択肢と同じだけ並ぶ`, async ({ page }) => {
      await openPane(page, diagramType, selectId);
      const optionCount = await page.locator('#' + selectId + ' option').count();
      const chipCount = await page.locator('#' + selectId + '-chips .prop-seg').count();
      expect(chipCount).toBe(optionCount);
      // 現在値のチップだけが押された状態
      await expect(page.locator('#' + selectId + '-chips .prop-seg[aria-pressed="true"]')).toHaveCount(1);
    });

    test(`${diagramType}: チップ 1 クリックで種別が変わり、詳細フォームが入れ替わる`, async ({ page }) => {
      await openPane(page, diagramType, selectId);
      await page.locator('#' + selectId + '-chip-' + pick).click();
      await expect(page.locator('#' + selectId)).toHaveValue(pick);
      await expect(page.locator('#' + selectId + '-chip-' + pick)).toHaveAttribute('aria-pressed', 'true');
    });
  }

  test('シーケンス: チップから一括欄を開いて実際に行を足せる', async ({ page }) => {
    await openPane(page, 'plantuml-sequence', 'seq-tail-kind');
    await page.locator('#seq-tail-kind-chip-bulk').click();
    await expect(page.locator('#seq-tail-bulk')).toBeVisible();
    await page.locator('#seq-tail-bulk').fill('actor Dev\nDev -> Dev : Ping()');
    await page.locator('#seq-tail-add').click();
    await expect.poll(async () => await page.locator('#editor').inputValue()).toContain('actor Dev');
    expect(await page.locator('#editor').inputValue()).toContain('Dev -> Dev : Ping()');
  });

  test('従来どおり select 側から変えてもチップの当たりが追随する', async ({ page }) => {
    await openPane(page, 'plantuml-sequence', 'seq-tail-kind');
    await page.locator('#seq-tail-kind').selectOption('note');
    await expect(page.locator('#seq-tail-kind-chip-note')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#seq-tail-kind-chip-message')).toHaveAttribute('aria-pressed', 'false');
  });

  test('→ キーで隣の種別に移る', async ({ page }) => {
    await openPane(page, 'plantuml-sequence', 'seq-tail-kind');
    await page.locator('#seq-tail-kind-chip-message').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#seq-tail-kind')).toHaveValue('participant');
  });

  test('要素を選んで戻ってもチップは 1 列だけ (作り直しで増えない)', async ({ page }) => {
    await openPane(page, 'plantuml-sequence', 'seq-tail-kind');
    await page.locator('#seq-tail-kind-chip-participant').click();
    await page.locator('#seq-tail-kind-chip-message').click();
    await expect(page.locator('#seq-tail-kind-chips')).toHaveCount(1);
    await expect(page.locator('#seq-tail-kind-chips .prop-seg')).toHaveCount(
      await page.locator('#seq-tail-kind option').count()
    );
  });
});
