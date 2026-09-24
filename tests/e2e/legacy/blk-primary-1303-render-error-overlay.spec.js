// @ts-check
// BLK-primary-20260907-1303-design / design 5a「描画エラーを図の上に重ねて表示」。
// BLK-builder-20260907-1243-3 は /render 自体が落ちる場合を入れたが、PlantUML が
// 文法エラーを 200 + エラー図の SVG で返す場合は素通しで、直前の図が「Syntax Error?」の
// 黒い絵に丸ごと置き換わっていた。ここはその経路を見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    var ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
}

async function openRenderTab(page) {
  await page.locator('#rail-config').click();
  await expect(page.locator('#cfg-modal')).toBeVisible();
  await page.locator('#cfg-tab-render').click();
  await expect(page.locator('#cfg-pane-render')).toBeVisible();
}

const GOOD = '@startuml\nAlice -> Bob : hi\n@enduml';
const BROKEN = '@startuml\nAlice -> Bob : hi\nzzz??? bad line !!!\n@enduml';

// BLK-builder-20260924-1427-3 (design 7a / 10a): 描けたときの見出しは「OK (local)」から「Rendered · Nms」になった。
function waitStatus(page, expected) {
  return expect(page.locator('#render-status')).toHaveText(expected, { timeout: 25000 });
}

test.describe('BLK-primary-1303-design 文法エラーでも直前の図を残す', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('UC-1: DSL を壊しても直前の図が残り、何行目かの帯が重なる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, GOOD);
    await waitStatus(page, /^Rendered · /);
    const goodSvg = await page.locator('#preview-svg').innerHTML();
    expect(goodSvg).toContain('<svg');

    await setDsl(page, BROKEN);
    await waitStatus(page, 'ERROR');
    // 直前の図はそのまま残る (エラー図に置き換わらない)
    expect(await page.locator('#preview-svg').innerHTML()).toBe(goodSvg);
    const banner = page.locator('#render-error-overlay');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('3 行目');
    await expect(banner).toContainText('Syntax Error');
    // DSL は 1 バイトも書き換わらない
    expect(await getEditorText(page)).toBe(BROKEN);
  });

  test('UC-2: 直したら帯が消えて新しい図に入れ替わる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, BROKEN);
    await waitStatus(page, 'ERROR');
    await expect(page.locator('#render-error-overlay')).toBeVisible();

    await setDsl(page, '@startuml\nAlice -> Bob : hi\nBob -> Carol : ok\n@enduml');
    await waitStatus(page, /^Rendered · /);
    await expect(page.locator('#render-error-overlay')).toBeHidden();
    expect(await page.locator('#preview-svg').innerHTML()).toContain('Carol');
  });

  test('UC-3: チェックを外すと従来どおり図がエラー 1 行に差し替わる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, GOOD);
    await waitStatus(page, /^Rendered · /);
    await openRenderTab(page);
    await page.locator('#cfg-render-error-overlay').uncheck();
    await page.locator('#cfg-ok').click();
    await expect(page.locator('#cfg-modal')).toBeHidden();

    await setDsl(page, BROKEN);
    await waitStatus(page, 'ERROR');
    await expect(page.locator('#render-error-overlay')).toBeHidden();
    await expect(page.locator('#preview-svg')).toContainText('Render error');
    await expect(page.locator('#preview-svg svg')).toHaveCount(0);
  });
});
