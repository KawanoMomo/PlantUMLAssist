// @ts-check
// FEAT-001 / [AC-1][AC-2] + E3 (Visual Verification Gate)
// 挿入 modal の From が、アンカー行の from で初期選択されることを実ブラウザで検証する。
// スクリーンショットは test-results/ にのみ保存する (docs/images は保護対象のため書かない)。
const path = require('path');
const { test, expect } = require('@playwright/test');

const SHOT_DIR = path.join(__dirname, '..', '..', 'test-results', 'feat-001');

test.describe('FEAT-001: 挿入 modal の From 初期選択', () => {
  test('[AC-1] アンカー L8 (System -> DB) で From が System になる', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    await page.waitForTimeout(500);

    // パネル動線と同じ入口 (showInsertForm) を、アンカー行 L8 を指定して開く。
    await page.evaluate(() => {
      var seq = window.MA.modules.plantumlSequence;
      var ed = document.getElementById('editor');
      var ctx = {
        getMmdText: function() { return ed.value; },
        setMmdText: function(t) { ed.value = t; ed.dispatchEvent(new Event('input')); },
        onUpdate: function() {},
      };
      seq.showInsertForm(ctx, 8, 'after', 'message');
    });
    await page.waitForSelector('#seq-mod-from');

    expect(await page.locator('#seq-mod-from').inputValue()).toBe('System');
    // Arrow の既定は従来どおり '->' のまま (回帰していないこと)
    expect(await page.locator('#seq-mod-arrow').inputValue()).toBe('->');

    await page.screenshot({ path: path.join(SHOT_DIR, 'ac1-insert-modal-from-system.png') });
  });

  test('[AC-2] アンカーが message でない行では従来どおり先頭 participant', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      var seq = window.MA.modules.plantumlSequence;
      var ed = document.getElementById('editor');
      var ctx = {
        getMmdText: function() { return ed.value; },
        setMmdText: function(t) { ed.value = t; ed.dispatchEvent(new Event('input')); },
        onUpdate: function() {},
      };
      seq.showInsertForm(ctx, 3, 'after', 'message'); // L3 = actor User (message ではない)
    });
    await page.waitForSelector('#seq-mod-from');

    expect(await page.locator('#seq-mod-from').inputValue()).toBe('User');
    await page.screenshot({ path: path.join(SHOT_DIR, 'ac2-insert-modal-no-anchor.png') });
  });

  test('E3: Properties パネルの ↑/↓ と Arrow select が従来どおり存在する', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    await page.waitForTimeout(500);

    // メッセージ選択の Properties パネルを直接描画させる (overlay 依存を避ける)。
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

    await expect(page.locator('#seq-edit-arrow')).toHaveCount(1);
    await expect(page.locator('.seq-move-up')).toHaveCount(1);
    await expect(page.locator('.seq-move-down')).toHaveCount(1);
    expect(await page.locator('#seq-edit-arrow').inputValue()).toBe('->');

    await page.screenshot({ path: path.join(SHOT_DIR, 'e3-props-panel-move-and-arrow.png') });
  });
});
