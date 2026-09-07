// @ts-check
// BLK-junior-20260907-1803-wish:
// ドライバ初期化のアクティビティ図は題材が変わっても同じ形なのに、手順6の
// 「初期化失敗時の分岐」を毎回「if を選ぶ→condition/then/else を打つ→追加」で
// 組み立て直している。挿入メニューから「よく使う分岐パターン」を選べば、
// 条件文言だけ確認すれば分岐が両枝の中身ごと入る。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const SAMPLE = [
  '@startuml',
  'title CanDrv 初期化',
  'start',
  ':クロックを有効化する;',
  ':レジスタを設定する;',
  ':CAN を有効化する;',
  ':割込みを設定する;',
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
  await page.waitForTimeout(1200);
}

async function clickGap(page) {
  await page.evaluate(() => {
    const overlay = document.getElementById('overlay-layer');
    const container = document.getElementById('preview-container');
    const r = overlay.getBoundingClientRect();
    container.dispatchEvent(new MouseEvent('click', {
      bubbles: true, clientX: r.left + 12, clientY: r.top + r.height / 2,
    }));
  });
  await page.waitForTimeout(400);
}

test.describe('よく使う分岐パターン (BLK-junior-1803-wish)', () => {
  test.beforeEach(async ({ page }) => {
    await openActivity(page, SAMPLE);
  });

  test('挿入メニューに「よく使う分岐パターン」があり、選ぶと組み込みの型が並ぶ', async ({ page }) => {
    await clickGap(page);
    await expect(page.locator('#act-pick-pattern')).toBeVisible();
    await page.locator('#act-pick-pattern').click();
    await expect(page.locator('#act-pat-init-fail')).toBeVisible();
    await expect(page.locator('#act-pat-param-check')).toBeVisible();
    // 何が入るかが読める要約が出る
    const txt = await page.locator('#act-pat-init-fail').textContent();
    expect(txt).toContain('初期化');
  });

  test('初期化失敗時の分岐をクリック 1 回で入れると、両枝の中身まで入る', async ({ page }) => {
    await clickGap(page);
    await page.locator('#act-pick-pattern').click();
    await page.locator('#act-pat-init-fail').click();
    await page.waitForTimeout(600);
    const text = await getEditorText(page);
    expect(text).toMatch(/if \(初期化に失敗\?\) then \(はい\)/);
    expect(text).toContain('else (いいえ)');
    expect(text).toContain('endif');
    // 枝が空アクションのままにならない
    expect(text).toMatch(/:エラーコードを返す;/);
    expect(text).toMatch(/:初期化完了を記録する;/);
    await expect(page.locator('#act-modal')).toBeHidden();
  });

  test('条件文言だけ書き換えて入れられる', async ({ page }) => {
    await clickGap(page);
    await page.locator('#act-pick-pattern').click();
    await page.locator('#act-pat-cond').fill('CAN 初期化に失敗?');
    await page.locator('#act-pat-init-fail').click();
    await page.waitForTimeout(600);
    const text = await getEditorText(page);
    expect(text).toContain('if (CAN 初期化に失敗?) then (はい)');
    expect(text).toContain(':エラーコードを返す;');
  });

  test('「種別を選び直す」で元の挿入メニューへ戻れる', async ({ page }) => {
    await clickGap(page);
    await page.locator('#act-pick-pattern').click();
    await expect(page.locator('#act-pat-list')).toBeVisible();
    await page.locator('#act-pat-back').click();
    await expect(page.locator('#act-pick-if')).toBeVisible();
  });
});
