// @ts-check
// FEAT-114 / HFR-060: 「ブロックで囲む」の 2 連 prompt() を 1 枚のフォームへ。
// 🔴 本 spec が実機判定するのは FEAT-114 が名指しした [AC-1] と [AC-5] の 2 件のみ。
// 残る [AC-2] [AC-3] [AC-4] [AC-6] は単体層 (tests/sequence-updater.test.js) が判定する。
// 🔴 手数の数値は主張しない (charter §5 / LOOP-156)。
// スクリーンショットは test-results/ にのみ保存する (docs/images は保護対象)。
const path = require('path');
const { test, expect } = require('@playwright/test');

const SHOT_DIR = path.join(__dirname, '..', '..', '..', 'test-results', 'feat-114');

async function boot(page) {
  await page.goto('/');
  await page.waitForSelector('#preview-svg', { timeout: 5000 });
  await page.waitForTimeout(500);
}

async function selectMessageByLine(page, line) {
  return page.evaluate((l) => {
    var seq = window.MA.modules.plantumlSequence;
    var parsed = seq.parseSequence(document.getElementById('editor').value);
    var r = parsed.relations.filter(function(x) { return x.kind === 'message' && x.line === l; })[0];
    if (!r) return null;
    window.MA.selection.setSelected([{ type: 'message', id: r.id, line: r.line }]);
    return r.id;
  }, line);
}

test.describe('FEAT-114: ブロックで囲む — 1 枚のフォーム', () => {
  test('[AC-1] 「囲む」1 クリックで 1 枚のフォームが開き、種類とラベルを同時に入力できる', async ({ page }) => {
    await boot(page);
    expect(await selectMessageByLine(page, 8)).toBeTruthy();

    await page.locator('.seq-wrap-block').first().click();
    await page.waitForSelector('#seq-wrap-kind');

    // 1 枚のフォームであること: 種類とラベルが同時に存在する。
    expect(await page.locator('#seq-modal').evaluate((el) => el.style.display)).toBe('flex');
    await expect(page.locator('#seq-wrap-kind')).toBeVisible();
    await expect(page.locator('#seq-wrap-label')).toBeVisible();
    // 種類は 4 択のドロップダウンのみ。
    expect(await page.locator('#seq-wrap-kind option').count()).toBe(4);

    await page.screenshot({ path: path.join(SHOT_DIR, 'ac1-wrap-form.png') });

    await page.selectOption('#seq-wrap-kind', 'loop');
    await page.fill('#seq-wrap-label', 'retry 3 times');
    await page.locator('#seq-wrap-confirm').click();
    await page.waitForTimeout(400);

    const lines = (await page.locator('#editor').inputValue()).split('\n');
    expect(lines[7]).toBe('loop retry 3 times');
    expect(lines[9]).toBe('end');
    expect(await page.locator('#seq-modal').evaluate((el) => el.style.display)).toBe('none');
  });

  test('[AC-5] 囲んだ後に別の操作を挟んでも Ctrl+Z 1 回で囲む前に戻る', async ({ page }) => {
    await boot(page);
    const before = await page.locator('#editor').inputValue();
    expect(await selectMessageByLine(page, 8)).toBeTruthy();

    await page.locator('.seq-wrap-block').first().click();
    await page.waitForSelector('#seq-wrap-kind');
    await page.selectOption('#seq-wrap-kind', 'alt');
    await page.fill('#seq-wrap-label', 'ok');
    await page.locator('#seq-wrap-confirm').click();
    await page.waitForTimeout(400);

    const wrapped = await page.locator('#editor').inputValue();
    expect(wrapped).toContain('alt ok');
    expect(wrapped).not.toBe(before);

    // 🔴 「操作の直後に何もしない」以外のシナリオ: 確定後にフォームを開いて
    // キャンセルし、選択も動かしてから undo する (履歴エントリが増えないこと)。
    await page.locator('.seq-wrap-block').first().click();
    await page.waitForSelector('#seq-wrap-kind');
    await page.locator('#seq-wrap-cancel').click();
    await page.waitForTimeout(200);
    // キャンセルでは DSL が 1 バイトも変わらない。
    expect(await page.locator('#editor').inputValue()).toBe(wrapped);
    await selectMessageByLine(page, 2);
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      document.body.focus();
    });
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);

    // Ctrl+Z 1 回で囲む前に戻る = 履歴エントリが 1 つだけ積まれている。
    expect(await page.locator('#editor').inputValue()).toBe(before);
    await page.screenshot({ path: path.join(SHOT_DIR, 'ac5-undo-once.png') });
  });
});
