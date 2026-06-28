// @ts-check
// userissue v1.2.2 — テンプレートを使用せずに 1 から記載しようとしたときに
// Actor やシーケンスの追加ができない (insertBeforeEnd が @startuml/@enduml を
// 補完しないため "No valid @start/@end found" エラーが出ていた)。
//
// このスペックは fix/scratch-add-actor で導入した dsl-updater の auto-wrap
// 動作の回帰テストを兼ねる。 各 6 図形の tail-add を空エディタから実行し、
// editor が常に @startuml で始まり @enduml で終わる有効な PlantUML を保つ
// ことを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

async function clearEditor(page) {
  await page.evaluate(() => {
    var ed = document.getElementById('editor');
    ed.value = '';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(300);
}

test.describe('userissue v1.2.2: scratch tail-add wraps DSL', () => {

  test('Sequence: empty editor + add actor wraps with @startuml/@enduml', async ({ page }) => {
    await gotoApp(page);
    // Stay on sequence (default), wipe template
    await clearEditor(page);
    await page.locator('#seq-tail-kind').selectOption('participant');
    await page.locator('#seq-tail-ptype').selectOption('actor');
    await page.locator('#seq-tail-alias').fill('User1');
    await page.locator('#seq-tail-add').click();
    await page.waitForTimeout(300);
    var t = await getEditorText(page);
    expect(t.startsWith('@startuml')).toBe(true);
    expect(t.trim().endsWith('@enduml')).toBe(true);
    expect(t).toContain('actor User1');
  });

  test('UseCase: empty editor + add actor wraps DSL', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-usecase');
    await page.waitForTimeout(300);
    await clearEditor(page);
    await page.locator('#uc-tail-kind').selectOption('actor');
    await page.locator('#uc-tail-alias').fill('Op');
    await page.locator('#uc-tail-add').click();
    await page.waitForTimeout(300);
    var t = await getEditorText(page);
    expect(t.startsWith('@startuml')).toBe(true);
    expect(t.trim().endsWith('@enduml')).toBe(true);
    expect(t).toContain('actor Op');
  });

  test('Component: empty editor + add component wraps DSL', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-component');
    await page.waitForTimeout(300);
    await clearEditor(page);
    await page.locator('#co-tail-kind').selectOption('component');
    await page.locator('#co-tail-alias').fill('Web');
    await page.locator('#co-tail-add').click();
    await page.waitForTimeout(300);
    var t = await getEditorText(page);
    expect(t.startsWith('@startuml')).toBe(true);
    expect(t.trim().endsWith('@enduml')).toBe(true);
    expect(t).toContain('component Web');
  });

  test('Class: empty editor + add class wraps DSL', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-class');
    await page.waitForTimeout(300);
    await clearEditor(page);
    await page.locator('#cl-tail-kind').selectOption('class');
    await page.locator('#cl-tail-alias').fill('User');
    await page.locator('#cl-tail-add').click();
    await page.waitForTimeout(300);
    var t = await getEditorText(page);
    expect(t.startsWith('@startuml')).toBe(true);
    expect(t.trim().endsWith('@enduml')).toBe(true);
    expect(t).toContain('class User');
  });

  test('State: empty editor + add state wraps DSL', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-state');
    await page.waitForTimeout(300);
    await clearEditor(page);
    await page.locator('#st-tail-kind').selectOption('state');
    await page.locator('#st-tail-id').fill('S1');
    await page.locator('#st-tail-add').click();
    await page.waitForTimeout(300);
    var t = await getEditorText(page);
    expect(t.startsWith('@startuml')).toBe(true);
    expect(t.trim().endsWith('@enduml')).toBe(true);
    expect(t).toContain('state S1');
  });

  test('Sequence: editor with bare text (no @startuml/@enduml) gets wrapped on tail-add', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => {
      var ed = document.getElementById('editor');
      ed.value = 'actor Existing';
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    await page.locator('#seq-tail-kind').selectOption('participant');
    await page.locator('#seq-tail-ptype').selectOption('actor');
    await page.locator('#seq-tail-alias').fill('Bob');
    await page.locator('#seq-tail-add').click();
    await page.waitForTimeout(300);
    var t = await getEditorText(page);
    expect(t.startsWith('@startuml')).toBe(true);
    expect(t.trim().endsWith('@enduml')).toBe(true);
    expect(t).toContain('actor Existing');
    expect(t).toContain('actor Bob');
  });
});
