// @ts-check
// BLK-builder-20260907-1050-2 / design 3c「関係のその他の設定パレット」。
// 主要な「関係の種類」は常時表示のまま、向き / 多重度 / 線の色 / 線へのノートを
// 「その他の設定… ▾」に畳む。UseCase / Component / Class で共通。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText, clickOverlayByLine } = require('./helpers');

const UC = [
  '@startuml',
  'actor User',
  'usecase "Login" as UC1',
  'User --> UC1',
  '@enduml',
].join('\n');

const CMP = [
  '@startuml',
  'component Web',
  'component Api',
  'Web --> Api',
  '@enduml',
].join('\n');

const CLS = [
  '@startuml',
  'class Order',
  'class Item',
  'Order --> Item',
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

async function openRelation(page, dsl, line) {
  await gotoApp(page);
  await typeDsl(page, dsl);
  await clickOverlayByLine(page, line);
  await page.waitForTimeout(400);
}

// Class 図のオーバーレイは関係の矩形をまだ描かないので (本 BLK の範囲外)、
// アプリ自身の選択 API に同じ選択を渡して右ペインを開く。
async function openClassRelation(page, dsl, line) {
  await gotoApp(page);
  await typeDsl(page, dsl);
  await page.evaluate((n) => {
    const text = document.getElementById('editor').value;
    const rel = window.MA.modules.plantumlClass.parse(text).relations
      .filter((r) => r.line === n)[0];
    window.MA.selection.setSelected([{ type: 'relation', id: rel.id, line: rel.line }]);
  }, line);
  await page.waitForTimeout(400);
}

test.describe('BLK-builder-1050 関係のその他の設定 (design 3c)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('関係を選ぶと「その他の設定…」が畳まれて出て、押すと開く', async ({ page }) => {
    await openRelation(page, UC, 4);
    const panel = page.locator('#uc-rel-more');
    await expect(panel).toBeHidden();
    await expect(page.locator('#uc-rel-more-btn')).toContainText('その他の設定');
    await page.locator('#uc-rel-more-btn').click();
    await expect(panel).toBeVisible();
    await expect(page.locator('#uc-rel-more-btn')).toHaveAttribute('aria-expanded', 'true');
  });

  test('主要な「関係の種類」は畳まれず常時表示のまま', async ({ page }) => {
    await openRelation(page, UC, 4);
    // design 3c で「関係の種類」は <select> からカードに変わった (BLK-builder-2035-3)。
    await expect(page.locator('.uc-rel-card[data-value="association"]')).toBeVisible();
  });

  test('design が挙げる 4 項目が並ぶ', async ({ page }) => {
    await openRelation(page, UC, 4);
    await page.locator('#uc-rel-more-btn').click();
    const text = await page.locator('#uc-rel-more').innerText();
    for (const s of ['向き / Direction', '多重度 / Multiplicity', '線の色 / Line color',
                     'この線にノートを添える', 'Esc で閉じる', '変更は即座に DSL へ反映']) {
      expect(text).toContain(s);
    }
  });

  test('向きを「To → From」にすると即座に DSL が変わる', async ({ page }) => {
    await openRelation(page, UC, 4);
    await page.locator('#uc-rel-more-btn').click();
    await page.locator('#uc-rel-more-dir .prop-rel-dir[data-value="backward"]').click();
    await page.waitForTimeout(400);
    expect((await getEditorText(page)).split('\n')[3]).toBe('User <-- UC1');
  });

  test('「矢印なし」にすると線だけになる', async ({ page }) => {
    await openRelation(page, UC, 4);
    await page.locator('#uc-rel-more-btn').click();
    await page.locator('#uc-rel-more-dir .prop-rel-dir[data-value="none"]').click();
    await page.waitForTimeout(400);
    expect((await getEditorText(page)).split('\n')[3]).toBe('User -- UC1');
  });

  test('Esc でパレットだけが閉じる', async ({ page }) => {
    await openRelation(page, UC, 4);
    await page.locator('#uc-rel-more-btn').click();
    await expect(page.locator('#uc-rel-more')).toBeVisible();
    await page.locator('#uc-rel-more-mult-left').press('Escape');
    await expect(page.locator('#uc-rel-more')).toBeHidden();
    await expect(page.locator('.uc-rel-card[data-value="association"]')).toBeVisible();
  });

  test('Component: 線の色を選ぶと -[#red]-> になる', async ({ page }) => {
    await openRelation(page, CMP, 4);
    await page.locator('#co-rel-more-btn').click();
    await page.locator('#co-rel-more-colors .prop-rel-color[data-value="red"]').click();
    await page.waitForTimeout(400);
    expect((await getEditorText(page)).split('\n')[3]).toBe('Web -[#red]-> Api');
  });

  test('Class: 多重度を入れると両端に付く', async ({ page }) => {
    await openClassRelation(page, CLS, 4);
    await page.locator('#cl-rel-more-btn').click();
    await page.locator('#cl-rel-more-mult-left').fill('1');
    await page.locator('#cl-rel-more-mult-right').fill('*');
    await page.locator('#cl-rel-more-mult-right').press('Tab');
    await page.waitForTimeout(400);
    expect((await getEditorText(page)).split('\n')[3]).toBe('Order "1" --> "*" Item');
  });

  test('Class: 線にノートを添えると note on link が入る', async ({ page }) => {
    await openClassRelation(page, CLS, 4);
    await page.locator('#cl-rel-more-btn').click();
    await page.locator('#cl-rel-more-note-on').check();
    await page.locator('#cl-rel-more-note').fill('在庫は別集約');
    await page.locator('#cl-rel-more-note').press('Tab');
    await page.waitForTimeout(400);
    const lines = (await getEditorText(page)).split('\n');
    expect(lines[3]).toBe('Order --> Item');
    expect(lines[4]).toBe('note on link');
    expect(lines[5].trim()).toBe('在庫は別集約');
    expect(lines[6]).toBe('end note');
  });

  test('指定済みの関係を選び直すとパレットは開いた状態で出る', async ({ page }) => {
    await openClassRelation(page, CLS.replace('Order --> Item', 'Order "1" <-[#red]- "*" Item'), 4);
    await expect(page.locator('#cl-rel-more')).toBeVisible();
    await expect(page.locator('#cl-rel-more-mult-left')).toHaveValue('1');
    await expect(page.locator('#cl-rel-more-mult-right')).toHaveValue('*');
    await expect(page.locator('#cl-rel-more-dir .prop-rel-dir[data-value="backward"]'))
      .toHaveAttribute('aria-pressed', 'true');
  });

  test('その他の設定の変更は Ctrl+Z 1 回で元に戻る', async ({ page }) => {
    await openRelation(page, UC, 4);
    await page.locator('#uc-rel-more-btn').click();
    await page.locator('#uc-rel-more-dir .prop-rel-dir[data-value="backward"]').click();
    await page.waitForTimeout(400);
    await page.locator('#editor').press('Control+z');
    await page.waitForTimeout(400);
    expect((await getEditorText(page)).split('\n')[3]).toBe('User --> UC1');
  });
});
