// @ts-check
// BLK-builder-20260907-2035-3 / design 3c「Sequence の矢印と同じ流儀。UseCase / Component /
// Class で共通」+ 3a「UML の名称を主、意味の説明を副として並べる」。
// 関係の線を選んだときの「関係の種類」を、記法だけのプルダウンからカードに置き換える。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText, clickOverlayByLine } = require('./helpers');

const UC = [
  '@startuml',
  'actor User',
  'usecase "Login" as UC1',
  'User --> UC1',
  '@enduml',
].join('\n');

const CLS = [
  '@startuml',
  'class Order',
  'class Item',
  'Order -- Item',
  '@enduml',
].join('\n');

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(900);
}

async function openUseCaseRelation(page) {
  await gotoApp(page);
  await typeDsl(page, UC);
  await clickOverlayByLine(page, 4);
  await page.waitForTimeout(400);
}

// Class 図のオーバーレイは関係の矩形を描かないので、アプリの選択 API を使う
// (blk-builder-1050-relation-options.spec.js と同じ入口)。
async function openClassRelation(page) {
  await gotoApp(page);
  await typeDsl(page, CLS);
  await page.evaluate(() => {
    const text = document.getElementById('editor').value;
    const rel = window.MA.modules.plantumlClass.parse(text).relations[0];
    window.MA.selection.setSelected([{ type: 'relation', id: rel.id, line: rel.line }]);
  });
  await page.waitForTimeout(400);
}

test.describe('BLK-builder-2035-3 関係の種類カード (design 3c)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('UseCase: 4 種が UML 名称と意味の説明つきで並ぶ (記法だけの表記は残らない)', async ({ page }) => {
    await openUseCaseRelation(page);
    const panel = page.locator('#props-content');
    for (const s of ['関連 / association', 'アクターがユースケースを利用する',
                     '包含 / include', '実行時に必ず呼び出される',
                     '拡張 / extend', '条件を満たすときだけ実行される',
                     '汎化 / generalization', '一方がもう一方の特化である']) {
      await expect(panel).toContainText(s);
    }
    await expect(page.locator('#uc-rel-kind')).toHaveCount(0);
  });

  test('UseCase: 「包含」を押すと押した時点で DSL が include になる', async ({ page }) => {
    await openUseCaseRelation(page);
    await page.locator('.uc-rel-card[data-value="include"]').click();
    await page.waitForTimeout(500);
    expect((await getEditorText(page)).split('\n')[3]).toBe('User ..> UC1 : <<include>>');
  });

  test('UseCase: いま選ばれている種類だけが押された状態で出る', async ({ page }) => {
    await openUseCaseRelation(page);
    await expect(page.locator('.uc-rel-card[data-value="association"]'))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.uc-rel-card[aria-pressed="true"]')).toHaveCount(1);
  });

  test('UseCase: 「汎化」を押すと <|-- になる', async ({ page }) => {
    await openUseCaseRelation(page);
    await page.locator('.uc-rel-card[data-value="generalization"]').click();
    await page.waitForTimeout(500);
    expect((await getEditorText(page)).split('\n')[3]).toBe('User <|-- UC1');
  });

  test('UseCase: 種類を変えたあとも From / To / ラベルの欄はそのまま出ている', async ({ page }) => {
    await openUseCaseRelation(page);
    await page.locator('.uc-rel-card[data-value="include"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#uc-rel-from')).toBeVisible();
    await expect(page.locator('#uc-rel-to')).toBeVisible();
    await expect(page.locator('#uc-rel-label')).toBeVisible();
  });

  test('Class: 7 種がカードで並び、「合成」を押すと *-- になる', async ({ page }) => {
    await openClassRelation(page);
    await expect(page.locator('.cl-rel-card')).toHaveCount(7);
    await expect(page.locator('#props-content')).toContainText('部分は全体と生死を共にする');
    await page.locator('.cl-rel-card[data-value="composition"]').click();
    await page.waitForTimeout(500);
    expect((await getEditorText(page)).split('\n')[3]).toBe('Order *-- Item');
  });

  test('Component の向き固定の注記は UseCase / Class には出ない', async ({ page }) => {
    await openUseCaseRelation(page);
    await expect(page.locator('#props-content')).not.toContainText('向きが固定');
    await openClassRelation(page);
    await expect(page.locator('#props-content')).not.toContainText('向きが固定');
  });
});
