// @ts-check
// BLK-junior-20260908-0103: 「初期化失敗時?」の異常側にログ出力アクションを足す。
// 位置の候補が行番号と DSL の生コードでしか出ておらず、どちらが異常側の行かを
// PlantUML の構文から読み解いてからプルダウンで同じ文言を探す必要があった。
// 図で枝ラベル (異常) をクリックし、そのまま「＋ ここに挿入」で置けることを実機で見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const DSL = [
  '@startuml',
  'start',
  ':初期化;',
  'if (初期化失敗時?) then (正常)',
  ':処理を続ける;',
  'else (異常)',
  ':何もしない;',
  'endif',
  'stop',
  '@enduml',
].join('\n');

async function openActivity(page, dsl) {
  await gotoApp(page);
  await page.evaluate(() => {
    const sel = /** @type {HTMLSelectElement} */ (document.getElementById('diagram-type'));
    sel.value = 'plantuml-activity';
    sel.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(500);
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, dsl);
  await page.waitForTimeout(1500);
}

test.describe('BLK-junior-20260908-0103: 異常側の位置を図から選ぶ', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('位置の候補が「どの分岐のどちら側か」で読める (生コードではない)', async ({ page }) => {
    await openActivity(page, DSL);
    await page.locator('#preview-container').click({ position: { x: 4, y: 4 } });
    await page.waitForTimeout(500);
    const points = await page.locator('#ac-ins-point option').allTextContents();
    const joined = points.join('|');
    expect(joined).toContain('分岐「初期化失敗時?」の 異常 側のはじめ');
    expect(joined).toContain('分岐「初期化失敗時?」の 正常 側のはじめ');
    expect(joined).toContain('分岐「初期化失敗時?」を閉じた後');
    expect(joined).toContain('アクション「初期化」の後');
  });

  test('図の枝ラベル「異常」を押すと、その側が挿入位置として選ばれている', async ({ page }) => {
    await openActivity(page, DSL);
    const branch = page.locator('#overlay-layer rect[data-type="branch"][data-line="6"]');
    expect(await branch.count()).toBeGreaterThan(0);
    await branch.first().click({ force: true });
    await page.waitForTimeout(500);
    // 選んだ側が右ペインに出て、「＋ ここに挿入」の位置がその側になっている
    await expect(page.locator('#props-content')).toContainText('分岐「初期化失敗時?」の 異常 側のはじめ');
    await expect(page.locator('#ac-ins-picked')).toContainText('異常 側のはじめ');
    const picked = await page.locator('#ac-ins-point').inputValue();
    const label = await page.locator('#ac-ins-point option[value="' + picked + '"]').textContent();
    expect(label).toContain('分岐「初期化失敗時?」の 異常 側のはじめ');
  });

  test('枝ラベルを押してアクション名を打つだけで、異常側に 1 行入る', async ({ page }) => {
    await openActivity(page, DSL);
    await page.locator('#overlay-layer rect[data-type="branch"][data-line="6"]').first().click({ force: true });
    await page.waitForTimeout(500);
    await page.locator('#ac-ins-f-text').fill('ログ出力');
    await page.locator('#ac-ins-do').click();
    await page.waitForTimeout(1200);
    const lines = (await getEditorText(page)).split('\n').map((l) => l.trim());
    const at = lines.indexOf(':ログ出力;');
    expect(at).toBeGreaterThan(-1);
    // else (異常) の直後、endif より前 = 異常側の中
    expect(lines.indexOf('else (異常)')).toBeLessThan(at);
    expect(at).toBeLessThan(lines.indexOf('endif'));
  });

  test('図形 (アクション) を選んでも、その位置が挿入の既定になる', async ({ page }) => {
    await openActivity(page, DSL);
    await page.evaluate(() => {
      window.MA.selection.setSelected([{ type: 'action', id: 'n2', line: 3 }]);
    });
    await page.waitForTimeout(500);
    const picked = await page.locator('#ac-ins-point').inputValue();
    const label = await page.locator('#ac-ins-point option[value="' + picked + '"]').textContent();
    expect(label).toContain('アクション「初期化」の後');
  });
});
