// @ts-check
// BLK-primary-20260907-0803 / design 4a「Class — メンバー編集」
// 属性とメソッドを別々の一覧にし、可視性は記号を打たずに + − # ~ のトグルで選ぶ。
// 種別 (class / abstract class / interface / enum) も宣言を打ち直さずに切り替える。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

const CLS = [
  '@startuml',
  'class Adc_Driver',
  'class Uart_Driver {',
  '  - port : uint8',
  '  + send(b : uint8) : void',
  '}',
  'Adc_Driver ..> Uart_Driver',
  '@enduml',
].join('\n');

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(2500);
}

// Properties パネルを目的のクラスに向ける。SVG の当たり判定に依存しないよう
// selection を直接立てる (overlay クリックは既存 spec が担保している)。
async function selectClass(page, id) {
  await page.evaluate((cid) => {
    const parsed = window.MA.modules.plantumlClass.parse(
      /** @type {HTMLTextAreaElement} */ (document.getElementById('editor')).value);
    const el = parsed.elements.filter((e) => e.id === cid)[0];
    window.MA.selection.setSelected([{ type: el.kind, id: el.id, line: el.line }]);
  }, id);
  await page.waitForTimeout(300);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
});

test('属性とメソッドが別々の一覧に分かれ、それぞれに「+ 追加」がある', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, CLS);
  await selectClass(page, 'Uart_Driver');

  await expect(page.locator('#props-pane')).toContainText('属性 / Attributes');
  await expect(page.locator('#props-pane')).toContainText('メソッド / Methods');
  await expect(page.locator('#cl-add-attr')).toBeVisible();
  await expect(page.locator('#cl-add-method')).toBeVisible();

  // 属性の節には属性行だけ、メソッドの節にはメソッド行だけが並ぶ
  await expect(page.locator('.cl-member-row[data-member-kind="attribute"]')).toHaveCount(1);
  await expect(page.locator('.cl-member-row[data-member-kind="method"]')).toHaveCount(1);
});

test('可視性は + − # ~ のトグルで選べる', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, CLS);
  await selectClass(page, 'Uart_Driver');

  await page.locator('#cl-add-attr').click();
  const toggle = page.locator('.cl-vis-btn[data-vis-for="cl-aa-vis"]');
  await expect(toggle).toHaveCount(4);
  // 既定は public が押された状態
  await expect(page.locator('.cl-vis-btn[data-vis-for="cl-aa-vis"][data-vis="+"]'))
    .toHaveAttribute('aria-pressed', 'true');

  await page.locator('.cl-vis-btn[data-vis-for="cl-aa-vis"][data-vis="#"]').click();
  await expect(page.locator('.cl-vis-btn[data-vis-for="cl-aa-vis"][data-vis="#"]'))
    .toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.cl-vis-btn[data-vis-for="cl-aa-vis"][data-vis="+"]'))
    .toHaveAttribute('aria-pressed', 'false');

  await page.locator('#cl-aa-name').fill('baud');
  await page.locator('#cl-aa-type').fill('uint32');
  await page.locator('#cl-aa-go').click();
  await page.waitForTimeout(500);
  expect(await getEditorText(page)).toContain('# baud : uint32');
});

test('本体 { } を持たないクラスにもフォームから属性を足せる', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, CLS);
  await selectClass(page, 'Adc_Driver');

  await page.locator('#cl-add-attr').click();
  await page.locator('.cl-vis-btn[data-vis-for="cl-aa-vis"][data-vis="-"]').click();
  await page.locator('#cl-aa-name').fill('channel');
  await page.locator('#cl-aa-type').fill('uint8');
  await page.locator('#cl-aa-go').click();
  await page.waitForTimeout(500);

  const t = await getEditorText(page);
  expect(t).toContain('class Adc_Driver {');
  expect(t).toContain('- channel : uint8');
  expect(t).toContain('}');
  // 関係の行は壊れていない
  expect(t).toContain('Adc_Driver ..> Uart_Driver');
});

test('種別トグルで class を interface に変えても本体とメンバーが残る', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, CLS);
  await selectClass(page, 'Uart_Driver');

  await expect(page.locator('#props-pane')).toContainText('種別 / Kind');
  await expect(page.locator('.cl-kind-btn[data-kind="class"]'))
    .toHaveAttribute('aria-pressed', 'true');

  await page.locator('.cl-kind-btn[data-kind="interface"]').click();
  await page.waitForTimeout(600);

  const t = await getEditorText(page);
  expect(t).toContain('interface Uart_Driver {');
  expect(t).toContain('- port : uint8');
  expect(t).toContain('+ send(b : uint8) : void');
  expect(t).not.toContain('class Uart_Driver');
});

test('種別の切り替えは Ctrl+Z 1 手で戻る', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, CLS);
  await selectClass(page, 'Adc_Driver');

  await page.locator('.cl-kind-btn[data-kind="abstract"]').click();
  await page.waitForTimeout(500);
  expect(await getEditorText(page)).toContain('abstract class Adc_Driver');

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  const t = await getEditorText(page);
  expect(t).toContain('class Adc_Driver');
  expect(t).not.toContain('abstract class Adc_Driver');
});

test('メンバー行をクリックするとその場で開き、可視性トグルで直せる', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, CLS);
  await selectClass(page, 'Uart_Driver');

  await page.locator('.cl-member-row[data-member-kind="attribute"]').first().click();
  await page.waitForTimeout(400);

  // 展開された編集フォームに可視性トグルが出る
  const vis = page.locator('.cl-vis-btn[data-vis-for="cl-mem-vis-0"]');
  await expect(vis).toHaveCount(4);
  await expect(page.locator('.cl-vis-btn[data-vis-for="cl-mem-vis-0"][data-vis="-"]'))
    .toHaveAttribute('aria-pressed', 'true');

  await page.locator('.cl-vis-btn[data-vis-for="cl-mem-vis-0"][data-vis="+"]').click();
  await page.locator('#cl-mem-update-0').click();
  await page.waitForTimeout(500);

  expect(await getEditorText(page)).toContain('+ port : uint8');
});
