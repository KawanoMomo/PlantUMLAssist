// @ts-check
// BLK-builder-20260907-2246-4 (design 2b): 無選択時の右ペインは「追加」だけを持つ。
// Title 設定は「図の設定」タブの職掌で、追加ペインと縦に連ならない。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText, setDiagramTitle } = require('./helpers');

const TYPES = [
  { value: 'plantuml-sequence', label: 'Sequence' },
  { value: 'plantuml-usecase', label: 'UseCase' },
  { value: 'plantuml-component', label: 'Component' },
  { value: 'plantuml-class', label: 'Class' },
  { value: 'plantuml-activity', label: 'Activity' },
  { value: 'plantuml-state', label: 'State' },
];

async function switchType(page, value) {
  await page.locator('#diagram-type').selectOption(value);
  await page.waitForTimeout(1200);
}

test.describe('BLK-builder-2246-4 (design 2b): 追加ペインから Title 設定を外す', () => {

  test('どの図種でも、無選択の追加ペインに Title の入力欄と適用ボタンが無い', async ({ page }) => {
    await gotoApp(page);
    for (const t of TYPES) {
      await switchType(page, t.value);
      const props = page.locator('#props-content');
      await expect(props).toContainText(t.label + ' Diagram');
      await expect(props).not.toContainText('Title 設定');
      await expect(props.locator('input[id$="-title"]')).toHaveCount(0);
      await expect(props.locator('button[id$="-set-title"]')).toHaveCount(0);
    }
  });

  test('追加ペインの先頭は種別チップで、押せば入力が切り替わる (2b の追加タブは残る)', async ({ page }) => {
    await gotoApp(page);
    const chips = page.locator('#seq-tail-kind-chips .prop-seg');
    await expect(chips.first()).toBeVisible();
    await expect(chips.first()).toHaveText('メッセージ');
    await chips.nth(1).click();
    await page.waitForTimeout(300);
    await expect(page.locator('#seq-tail-kind')).toHaveValue('participant');
  });

  test('Title は「図の設定」タブで入れられ、DSL の title 行になる', async ({ page }) => {
    await gotoApp(page);
    await setDiagramTitle(page, 'Adc 初期化シーケンス');
    const t = await getEditorText(page);
    expect(t).toContain('title Adc 初期化シーケンス');
    // 戻ってきた追加ペインには Title が無いままである
    await expect(page.locator('#props-content')).not.toContainText('Title 設定');
  });

  test('Title を空にすると title 行が消える', async ({ page }) => {
    await gotoApp(page);
    await setDiagramTitle(page, 'いったん付ける');
    expect(await getEditorText(page)).toContain('title いったん付ける');
    await setDiagramTitle(page, '');
    expect(await getEditorText(page)).not.toContain('title いったん付ける');
  });
});
