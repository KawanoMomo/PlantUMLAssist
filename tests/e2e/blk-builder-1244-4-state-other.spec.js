// @ts-check
const { test, expect } = require('@playwright/test');
const { getEditorText } = require('./helpers');

// BLK-builder-20260907-1244-4 / design 5d「UML 要素の網羅一覧」State 行の
// 「その他パレット」。overlay を使わないので外部レンダラに頼らずローカルのまま開く。
async function openStateOther(page) {
  await page.goto('/');
  await page.waitForSelector('#preview-svg', { timeout: 5000 });
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(500);
  await page.locator('#st-tail-kind').selectOption('other');
  await page.waitForTimeout(200);
}

async function setDsl(page, text) {
  await page.evaluate((t) => {
    var ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(500);
}

test.describe('BLK-builder-20260907-1244-4 State の「その他」パレット', () => {
  test('UC-1: fork と join を名前 1 回入力 + 1 クリックで足せる', async ({ page }) => {
    await openStateOther(page);
    await page.locator('#st-other-id').fill('Split1');
    await page.locator('#st-other-fork').click();
    await page.waitForTimeout(300);
    expect(await getEditorText(page)).toContain('state Split1 <<fork>>');

    await page.locator('#st-tail-kind').selectOption('other');
    await page.locator('#st-other-id').fill('Merge1');
    await page.locator('#st-other-join').click();
    await page.waitForTimeout(300);
    expect(await getEditorText(page)).toContain('state Merge1 <<join>>');
  });

  test('UC-2: 入口・出口ポイントを足せる', async ({ page }) => {
    await openStateOther(page);
    await page.locator('#st-other-id').fill('In1');
    await page.locator('#st-other-entry').click();
    await page.waitForTimeout(300);
    expect(await getEditorText(page)).toContain('state In1 <<entryPoint>>');

    await page.locator('#st-tail-kind').selectOption('other');
    await page.locator('#st-other-id').fill('Out1');
    await page.locator('#st-other-exit').click();
    await page.waitForTimeout(300);
    expect(await getEditorText(page)).toContain('state Out1 <<exitPoint>>');
  });

  test('UC-3: 複合状態に並行領域の区切りを足せる', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    await page.locator('#diagram-type').selectOption('plantuml-state');
    await page.waitForTimeout(500);
    await setDsl(page, '@startuml\nstate Outer {\n  state A\n  state B\n}\n@enduml');
    await page.locator('#st-tail-kind').selectOption('other');
    await page.waitForTimeout(200);
    await page.locator('#st-other-composite').selectOption('Outer');
    await page.locator('#st-other-region').click();
    await page.waitForTimeout(300);
    var lines = (await getEditorText(page)).split('\n');
    expect(lines[4].trim()).toBe('--');
    expect(lines[5].trim()).toBe('}');
  });

  test('UC-4: 複合状態が無いときは並行領域の欄を出さず理由を書く', async ({ page }) => {
    await openStateOther(page);
    await expect(page.locator('#st-other-composite')).toHaveCount(0);
    await expect(page.locator('#st-tail-detail')).toContainText('複合状態');
  });
});
