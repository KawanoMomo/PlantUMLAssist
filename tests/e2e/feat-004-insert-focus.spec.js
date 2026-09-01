// @ts-check
// FEAT-004 / [AC-1][AC-3][AC-4][AC-7] + E3 (Visual Verification Gate)
// 挿入 modal (seq-modal) を message 種別で開いた直後、本文 (rich-label-editor) の
// textarea にフォーカスが当たっていることを実ブラウザで検証する。
// FEAT-001 / FEAT-002 と同一の入口 (showInsertForm) を用い、modal の起動経路を問わない
// ([AC-1] の要求)。スクリーンショットは test-results/ にのみ保存する
// (docs/images は git status --porcelain の保護対象のため書かない)。
const path = require('path');
const { test, expect } = require('@playwright/test');

const SHOT_DIR = path.join(__dirname, '..', '..', 'test-results', 'feat-004');

// パネル動線と同じ入口を、指定行をアンカーとして開く。
async function openInsertForm(page, line, kind) {
  await page.evaluate(({ l, k }) => {
    var seq = window.MA.modules.plantumlSequence;
    var ed = document.getElementById('editor');
    var ctx = {
      getMmdText: function() { return ed.value; },
      setMmdText: function(t) { ed.value = t; ed.dispatchEvent(new Event('input')); },
      onUpdate: function() {},
    };
    seq.showInsertForm(ctx, l, 'after', k);
  }, { l: line, k: kind });
  await page.waitForSelector('#seq-modal-content');
}

test.describe('FEAT-004: 挿入 modal の本文欄への初期フォーカス', () => {
  test('[AC-1] message 種別で開いた直後、本文 textarea が activeElement である', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    await page.waitForTimeout(500);

    await openInsertForm(page, 8, 'message');

    // 本 FEAT の主張。変更前は body が activeElement のため FAIL する。
    const isLabelTa = await page.evaluate(() => {
      var ta = document.querySelector('#seq-mod-label-rle .rle-textarea');
      return !!ta && document.activeElement === ta;
    });
    expect(isLabelTa).toBe(true);

    await page.screenshot({ path: path.join(SHOT_DIR, 'ac1-insert-modal-focus.png') });
  });

  test('[AC-1] キー入力がクリックなしでラベル本文に入る (効果測定)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    await page.waitForTimeout(500);

    await openInsertForm(page, 8, 'message');

    // 本文欄をクリックせずにタイプする。
    await page.keyboard.type('Query2');
    expect(await page.locator('#seq-mod-label-rle .rle-textarea').inputValue()).toBe('Query2');

    await page.locator('#seq-mod-confirm').click();
    await page.waitForTimeout(300);
    expect(await page.locator('#editor').inputValue()).toContain('Query2');

    await page.screenshot({ path: path.join(SHOT_DIR, 'ac1-typed-without-click.png') });
  });

  test('[AC-3] note 種別のフォーカス挙動は変えない', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    await page.waitForTimeout(500);

    await openInsertForm(page, 8, 'note');

    const focusedNote = await page.evaluate(() => {
      var ta = document.querySelector('#seq-mod-ntext-rle .rle-textarea');
      return !!ta && document.activeElement === ta;
    });
    // note では従来どおりフォーカスは移らない。
    expect(focusedNote).toBe(false);
  });

  test('[AC-4] From / Arrow / To の初期選択値と Escape 挙動が不変である', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto('/');
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    await page.waitForTimeout(500);

    await openInsertForm(page, 8, 'message');

    // FEAT-001 / FEAT-002 の成果が回帰していないこと。
    expect(await page.locator('#seq-mod-from').inputValue()).toBe('System');
    expect(await page.locator('#seq-mod-to').inputValue()).toBe('DB');
    expect(await page.locator('#seq-mod-arrow').inputValue()).toBe('->');

    // 変更前も Escape で modal は閉じない (rle-escape の listener が存在しない)。
    // フォーカス移動によってこの挙動が変わっていないことを確認する。
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    expect(await page.locator('#seq-modal').evaluate((el) => el.style.display)).toBe('flex');
    expect(errors).toEqual([]);
  });

  test('E3: 順序入れ替え (.seq-move-up/down) と 種別変更 (#seq-edit-arrow) が無傷である', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      var seq = window.MA.modules.plantumlSequence;
      var ed = document.getElementById('editor');
      var parsed = seq.parseSequence(ed.value);
      var msg = parsed.relations.filter(function(r) { return r.kind === 'message'; })[1];
      var propsEl = document.getElementById('props-content');
      var ctx = {
        getMmdText: function() { return ed.value; },
        setMmdText: function(t) { ed.value = t; ed.dispatchEvent(new Event('input')); },
        onUpdate: function() {},
      };
      seq.renderProps([{ type: 'message', id: msg.id }], parsed, propsEl, ctx);
    });
    await page.waitForTimeout(300);

    await page.locator('.seq-move-up').first().scrollIntoViewIfNeeded();
    await expect(page.locator('.seq-move-up')).toHaveCount(1);
    await expect(page.locator('.seq-move-down')).toHaveCount(1);
    await expect(page.locator('.seq-move-up')).toBeVisible();
    await expect(page.locator('.seq-move-down')).toBeVisible();

    await expect(page.locator('#seq-edit-arrow')).toHaveCount(1);
    await expect(page.locator('#seq-edit-arrow')).toBeVisible();
    expect(await page.locator('#seq-edit-arrow').inputValue()).toBe('->');

    await page.locator('#props-content').screenshot({
      path: path.join(SHOT_DIR, 'e3-props-panel-move-and-arrow.png'),
    });
    await page.screenshot({ path: path.join(SHOT_DIR, 'e3-fullpage.png') });
  });
});
