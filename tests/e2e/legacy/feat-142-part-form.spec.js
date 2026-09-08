// @ts-check
// FEAT-142 / HFR-075: participant の左右挿入の 2 連 prompt() を 1 枚のフォームへ。
// 本 spec が実機判定するのは [AC-1] [AC-3] [AC-4] [AC-5] [AC-6]。
// [AC-2] (項目と既定値) は単体層 tests/sequence-updater.test.js が判定する。
// 手数の数値は主張しない (charter §5 / LOOP-156)。保存先は test-results/ のみ。
const path = require('path');
const { test, expect } = require('@playwright/test');

const SHOT_DIR = path.join(__dirname, '..', '..', '..', 'test-results', 'feat-142');
const DSL = '@startuml\nparticipant A\nparticipant B\nA -> B : m1\n@enduml';

async function boot(page) {
  // prompt() の呼出回数を数えるため、アプリ起動前に差し替える。
  await page.addInitScript(() => {
    window.__promptCalls = 0;
    window.prompt = function () { window.__promptCalls++; return null; };
  });
  await page.goto('/');
  await page.waitForSelector('#preview-svg', { timeout: 5000 });
  await page.waitForTimeout(300);
  await page.evaluate((t) => {
    const el = document.getElementById('editor');
    el.value = t;
    el.dispatchEvent(new Event('input'));
  }, DSL);
  await page.waitForTimeout(500);
}

// overlay クリックはプレビュー SVG の描画に依存するため、選択 API 経由で選ぶ。
async function selectParticipant(page, line) {
  return page.evaluate((l) => {
    const seq = window.MA.modules.plantumlSequence;
    const parsed = seq.parseSequence(document.getElementById('editor').value);
    const p = parsed.elements.filter((x) => x.kind === 'participant' && x.line === l)[0];
    if (!p) return null;
    window.MA.selection.setSelected([{ type: 'participant', id: p.id, line: p.line }]);
    return p.id;
  }, line);
}

async function openForm(page, cls, line) {
  expect(await selectParticipant(page, line)).toBeTruthy();
  await page.locator(cls).first().click();
  await page.waitForSelector('#seq-part-alias');
}

test.describe('FEAT-142: participant 左右挿入 — 1 枚のフォーム', () => {
  test('[AC-1][AC-3] 1 クリックで modal が 1 枚開き、prompt 0 回で直前に挿入される', async ({ page }) => {
    await boot(page);
    await openForm(page, '.seq-insert-part-before', 3);
    expect(await page.locator('#seq-modal').evaluate((el) => el.style.display)).toBe('flex');
    await expect(page.locator('#seq-part-alias')).toBeVisible();
    await expect(page.locator('#seq-part-type')).toBeVisible();
    expect(await page.evaluate(() => window.__promptCalls)).toBe(0);
    await page.screenshot({ path: path.join(SHOT_DIR, 'ac1-part-form.png') });
    await page.fill('#seq-part-alias', 'X');
    await page.selectOption('#seq-part-type', 'actor');
    await page.locator('#seq-part-confirm').click();
    await page.waitForTimeout(400);

    const lines = (await page.locator('#editor').inputValue()).split('\n');
    expect(lines[2]).toBe('actor X');          // 選択行 L3 の直前
    expect(lines[3]).toBe('participant B');
    expect(await page.locator('#seq-modal').evaluate((el) => el.style.display)).toBe('none');
    expect(await page.evaluate(() => window.__promptCalls)).toBe(0);
  });

  test('[AC-4] 「右に参加者追加」で直後に挿入される', async ({ page }) => {
    await boot(page);
    await openForm(page, '.seq-insert-part-after', 2);
    await page.fill('#seq-part-alias', 'DB');
    await page.selectOption('#seq-part-type', 'database');
    await page.locator('#seq-part-confirm').click();
    await page.waitForTimeout(400);

    const lines = (await page.locator('#editor').inputValue()).split('\n');
    expect(lines[1]).toBe('participant A');
    expect(lines[2]).toBe('database DB');
    expect(await page.evaluate(() => window.__promptCalls)).toBe(0);
  });

  test('[AC-5][AC-6] 未入力確定とキャンセルは DSL を変えず、履歴も積まない', async ({ page }) => {
    await boot(page);
    const before = await page.locator('#editor').inputValue();
    // [AC-5] Alias 空のまま確定 → DSL は 1 バイトも変わらない。
    await openForm(page, '.seq-insert-part-before', 3);
    await page.locator('#seq-part-confirm').click();
    await page.waitForTimeout(400);
    expect(await page.locator('#editor').inputValue()).toBe(before);
    await page.locator('#seq-part-cancel').click();
    await page.waitForTimeout(200);
    // 直前の別操作を 1 件積む。
    await openForm(page, '.seq-insert-part-after', 2);
    await page.fill('#seq-part-alias', 'Q');
    await page.locator('#seq-part-confirm').click();
    await page.waitForTimeout(400);
    const afterInsert = await page.locator('#editor').inputValue();
    expect(afterInsert).not.toBe(before);

    // [AC-6] キャンセルは DSL を変えず modal を閉じる。
    await openForm(page, '.seq-insert-part-before', 2);
    await page.locator('#seq-part-cancel').click();
    await page.waitForTimeout(300);
    expect(await page.locator('#editor').inputValue()).toBe(afterInsert);
    expect(await page.locator('#seq-modal').evaluate((el) => el.style.display)).toBe('none');

    // キャンセルは履歴を積まないので Ctrl+Z 1 回で「直前の別操作」が戻る。
    await page.evaluate(() => {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      document.body.focus();
    });
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    expect(await page.locator('#editor').inputValue()).toBe(before);
    await page.screenshot({ path: path.join(SHOT_DIR, 'ac6-cancel-undo.png') });
  });
});
