// @ts-check
// FEAT-002 / [AC-1][AC-2][AC-3] + E3 (Visual Verification Gate)
// 挿入 modal の To が、アンカー行の to で初期選択されることを実ブラウザで検証する。
// FEAT-001 (From) と同一構造・同一入口 (showInsertForm) を用い、modal の起動経路を問わない
// ([AC-1] の要求。既存 RED uc-12-hover-insert から独立させるため)。
// スクリーンショットは test-results/ にのみ保存する (docs/images は保護対象のため書かない)。
const path = require('path');
const { test, expect } = require('@playwright/test');

const SHOT_DIR = path.join(__dirname, '..', '..', 'test-results', 'feat-002');

// パネル動線と同じ入口を、指定行をアンカーとして開く。
async function openInsertForm(page, line) {
  await page.evaluate((l) => {
    var seq = window.MA.modules.plantumlSequence;
    var ed = document.getElementById('editor');
    var ctx = {
      getMmdText: function() { return ed.value; },
      setMmdText: function(t) { ed.value = t; ed.dispatchEvent(new Event('input')); },
      onUpdate: function() {},
    };
    seq.showInsertForm(ctx, l, 'after', 'message');
  }, line);
  await page.waitForSelector('#seq-mod-to');
}

test.describe('FEAT-002: 挿入 modal の To 初期選択', () => {
  test('[AC-1] アンカー L8 (System -> DB) で To が DB になる', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    await page.waitForTimeout(500);

    await openInsertForm(page, 8);

    // 本 FEAT の主張。変更前は先頭 participant ('User') が選ばれるため FAIL する。
    expect(await page.locator('#seq-mod-to').inputValue()).toBe('DB');
    // FEAT-001 (From) と Arrow が回帰していないこと。
    expect(await page.locator('#seq-mod-from').inputValue()).toBe('System');
    expect(await page.locator('#seq-mod-arrow').inputValue()).toBe('->');

    await page.screenshot({ path: path.join(SHOT_DIR, 'ac1-insert-modal-to-db.png') });
  });

  test('[AC-1] 別のアンカー L9 (DB --> System) で To が System になる', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    await page.waitForTimeout(500);

    await openInsertForm(page, 9);

    // 定数ではなくアンカー行の to に追従することを、別の行で確認する。
    expect(await page.locator('#seq-mod-to').inputValue()).toBe('System');
    expect(await page.locator('#seq-mod-from').inputValue()).toBe('DB');

    await page.screenshot({ path: path.join(SHOT_DIR, 'ac1-insert-modal-to-system.png') });
  });

  test('[AC-2] アンカーが message でない行では従来どおり先頭 participant / 例外なし', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto('/');
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    await page.waitForTimeout(500);

    await openInsertForm(page, 3); // L3 = actor User (message ではない)

    expect(await page.locator('#seq-mod-to').inputValue()).toBe('User');
    expect(await page.locator('#seq-mod-from').inputValue()).toBe('User');
    expect(errors).toEqual([]);

    await page.screenshot({ path: path.join(SHOT_DIR, 'ac2-insert-modal-no-anchor.png') });
  });

  test('[AC-3] 挿入が従来どおり成立する (To の既定値が DSL に反映される)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    await page.waitForTimeout(500);

    await openInsertForm(page, 8);
    await page.locator('#seq-mod-confirm').click();
    await page.waitForTimeout(300);

    const text = await page.locator('#editor').inputValue();
    // アンカー L8 は System -> DB。既定のまま確定すれば System -> DB が 1 本増える。
    const n = (text.match(/System -> DB/g) || []).length;
    expect(n).toBeGreaterThanOrEqual(2);

    await page.screenshot({ path: path.join(SHOT_DIR, 'ac3-after-insert.png') });
  });

  test('E3: 順序入れ替え (.seq-move-up/down) と 種別変更 (#seq-edit-arrow) が無傷である', async ({ page }) => {
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

    // 前回 run の反省: ↑/↓ が表示領域外で目視できなかった。
    // 先に scrollIntoView してから、パネル自体を要素スクリーンショットに収める。
    await page.locator('.seq-move-up').first().scrollIntoViewIfNeeded();
    await expect(page.locator('.seq-move-up')).toHaveCount(1);
    await expect(page.locator('.seq-move-down')).toHaveCount(1);
    await expect(page.locator('.seq-move-up')).toBeVisible();
    await expect(page.locator('.seq-move-down')).toBeVisible();

    await expect(page.locator('#seq-edit-arrow')).toHaveCount(1);
    await expect(page.locator('#seq-edit-arrow')).toBeVisible();
    expect(await page.locator('#seq-edit-arrow').inputValue()).toBe('->');

    // 目視用: パネル要素そのもの (確実に ↑/↓ と Arrow が収まる)
    await page.locator('#props-content').screenshot({
      path: path.join(SHOT_DIR, 'e3-props-panel-move-and-arrow.png'),
    });
    await page.screenshot({ path: path.join(SHOT_DIR, 'e3-fullpage.png') });
  });
});
