// @ts-check
// BLK-primary-20260907-0823-design (design 4b「Activity — 途中に挿入」):
// 位置を選ぶと、そこに置ける要素だけがメニューに残り、if / while / fork は
// 開始と終了が対で入る。start / :Hello world; / stop だけの図に分岐を足せる。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const MIN = ['@startuml', 'start', ':Hello world;', 'stop', '@enduml'].join('\n');

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
  await page.waitForTimeout(900);
  // 何も選んでいない状態の図パネルに「この位置に挿入」が出る
  await page.locator('#preview-container').click({ position: { x: 4, y: 4 } });
  await page.waitForTimeout(500);
}

test.describe('BLK-primary-0823-design Activity 途中に挿入', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('位置と要素のメニューが右ペインに出る', async ({ page }) => {
    await openActivity(page, MIN);
    await expect(page.locator('#ac-ins-point')).toBeVisible();
    await expect(page.locator('#ac-ins-kind')).toBeVisible();
    const points = await page.locator('#ac-ins-point option').allTextContents();
    // BLK-junior-20260908-0103: 候補は行番号と生コードではなく構造の言葉になった。
    expect(points.join('|')).toContain('フローのはじめの前');
    expect(points.join('|')).toContain('アクション「Hello world」の後');
    expect(points.join('|')).not.toContain('@startuml');
  });

  test('フローの中では 10 種、フローの外ではレーンだけに絞られる', async ({ page }) => {
    await openActivity(page, MIN);
    // 既定は本体の最後 (:Hello world; の後 ではなく stop の後 なので明示的に選ぶ)
    await page.locator('#ac-ins-point').selectOption({ label: 'アクション「Hello world」の後 (L3)' });
    await page.waitForTimeout(300);
    expect(await page.locator('#ac-ins-kind option').count()).toBe(10);

    await page.locator('#ac-ins-point').selectOption({ label: 'フローのはじめの前 (L2)' });
    await page.waitForTimeout(300);
    const outside = await page.locator('#ac-ins-kind option').allTextContents();
    expect(outside.length).toBe(1);
    expect(outside[0]).toContain('スイムレーン');
  });

  test('if を選んで挿入すると else / endif まで対で入る', async ({ page }) => {
    await openActivity(page, MIN);
    await page.locator('#ac-ins-point').selectOption({ label: 'アクション「Hello world」の後 (L3)' });
    await page.waitForTimeout(300);
    await page.locator('#ac-ins-kind').selectOption('if');
    await page.waitForTimeout(300);
    await page.locator('#ac-ins-f-cond').fill('受信成功?');
    await page.locator('#ac-ins-do').click();
    await page.waitForTimeout(800);

    const lines = (await getEditorText(page)).split('\n');
    expect(lines[3]).toBe('if (受信成功?) then (yes)');
    expect(lines[5]).toBe('else (no)');
    expect(lines[7]).toBe('endif');
    expect(lines[8]).toBe('stop');
  });

  test('fork は枝の数だけ fork again を作る', async ({ page }) => {
    await openActivity(page, MIN);
    await page.locator('#ac-ins-point').selectOption({ label: 'アクション「Hello world」の後 (L3)' });
    await page.waitForTimeout(300);
    await page.locator('#ac-ins-kind').selectOption('fork');
    await page.waitForTimeout(300);
    await page.locator('#ac-ins-f-branchCount').fill('3');
    await page.locator('#ac-ins-do').click();
    await page.waitForTimeout(800);

    const t = await getEditorText(page);
    expect((t.match(/fork again/g) || []).length).toBe(2);
    expect(t).toContain('end fork');
  });

  test('入力の要らない break はその場に 1 行だけ入る', async ({ page }) => {
    await openActivity(page, MIN);
    await page.locator('#ac-ins-point').selectOption({ label: 'アクション「Hello world」の後 (L3)' });
    await page.waitForTimeout(300);
    await page.locator('#ac-ins-kind').selectOption('break');
    await page.waitForTimeout(300);
    await expect(page.locator('#ac-ins-f-text')).toHaveCount(0);
    await page.locator('#ac-ins-do').click();
    await page.waitForTimeout(800);
    expect((await getEditorText(page)).split('\n')[3]).toBe('break');
  });

  test('挿入は Ctrl+Z で戻せる', async ({ page }) => {
    await openActivity(page, MIN);
    await page.locator('#ac-ins-point').selectOption({ label: 'アクション「Hello world」の後 (L3)' });
    await page.waitForTimeout(300);
    await page.locator('#ac-ins-kind').selectOption('if');
    await page.waitForTimeout(300);
    await page.locator('#ac-ins-do').click();
    await page.waitForTimeout(700);
    await page.locator('#editor').click();
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(700);
    expect(await getEditorText(page)).toBe(MIN);
  });

  test('手数: 位置を選ぶ→要素を選ぶ→条件を打つ→挿入 の 3 クリックで分岐が 1 つ入る', async ({ page }) => {
    await openActivity(page, MIN);
    let clicks = 0;
    await page.locator('#ac-ins-point').selectOption({ label: 'アクション「Hello world」の後 (L3)' }); clicks++;
    await page.waitForTimeout(300);
    await page.locator('#ac-ins-kind').selectOption('if'); clicks++;
    await page.waitForTimeout(300);
    await page.locator('#ac-ins-f-cond').fill('X?');
    await page.locator('#ac-ins-do').click(); clicks++;
    await page.waitForTimeout(800);
    expect(clicks).toBe(3);
    expect(await getEditorText(page)).toContain('if (X?) then (yes)');
  });
});
