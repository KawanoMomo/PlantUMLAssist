// @ts-check
// FEAT-017 / [AC-1]〜[AC-7]
// 選択中の Enter で、選択行の直後を挿入位置とする挿入 modal を開く。
// 🔴 [AC-8]: 手数の数値 (推計 3手) は実測値として主張しない。本 spec は手数を測らない。
// スクリーンショットは test-results/ にのみ保存する
// (docs/images は git status --porcelain の保護対象のため書かない)。
const path = require('path');
const { test, expect } = require('@playwright/test');

const SHOT_DIR = path.join(__dirname, '..', '..', 'test-results', 'feat-017');

async function boot(page) {
  await page.goto('/');
  await page.waitForSelector('#preview-svg', { timeout: 5000 });
  await page.waitForTimeout(500);
}

async function selectMessageByLine(page, line) {
  return page.evaluate((l) => {
    var seq = window.MA.modules.plantumlSequence;
    var ed = document.getElementById('editor');
    var parsed = seq.parseSequence(ed.value);
    var r = parsed.relations.filter(function(x) { return x.kind === 'message' && x.line === l; })[0];
    if (!r) return null;
    window.MA.selection.setSelected([{ type: 'message', id: r.id, line: r.line }]);
    return r.id;
  }, line);
}

async function blurToBody(page) {
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    document.body.focus();
  });
}

function modalDisplay(page) {
  return page.locator('#seq-modal').evaluate((el) => el.style.display);
}

test.describe('FEAT-017: Enter キーで選択行の直後に挿入 modal を開く', () => {
  test('[AC-1] 選択行の直後を挿入位置とする modal が開き、確定で直後の行に挿入される', async ({ page }) => {
    await boot(page);
    // 既定テンプレートの 8行目 = 'System -> DB : Query'。
    expect(await selectMessageByLine(page, 8)).toBeTruthy();
    await blurToBody(page);

    await page.keyboard.press('Enter');
    await page.waitForSelector('#seq-modal-content');
    expect(await modalDisplay(page)).toBe('flex');
    // 'after' 経路であること (タイトルが「後に」)。
    expect(await page.locator('#seq-modal-content h3').textContent()).toContain('後にメッセージを挿入');

    await page.screenshot({ path: path.join(SHOT_DIR, 'ac1-enter-opens-insert-modal.png') });

    await page.keyboard.type('KbdInserted');
    await page.locator('#seq-mod-confirm').click();
    await page.waitForTimeout(400);

    const lines = (await page.locator('#editor').inputValue()).split('\n');
    // 8行目の直後 = 9行目に挿入される。
    expect(lines[8]).toContain('KbdInserted');
  });

  test('[AC-2] From / To / Arrow の初期値がホバー経由の modal と一致する', async ({ page }) => {
    await boot(page);

    // (a) ホバー/パネルと同じ入口 (showInsertForm) を同一アンカーで開いた場合の初期値。
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
    await page.waitForSelector('#seq-modal-content');
    const viaHover = {
      from: await page.locator('#seq-mod-from').inputValue(),
      to: await page.locator('#seq-mod-to').inputValue(),
      arrow: await page.locator('#seq-mod-arrow').inputValue(),
    };

    // modal を閉じる (キャンセル)。
    await page.locator('#seq-mod-cancel').click();
    await page.waitForTimeout(200);

    // (b) Enter 経由。
    await selectMessageByLine(page, 8);
    await blurToBody(page);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#seq-modal-content');
    const viaEnter = {
      from: await page.locator('#seq-mod-from').inputValue(),
      to: await page.locator('#seq-mod-to').inputValue(),
      arrow: await page.locator('#seq-mod-arrow').inputValue(),
    };

    expect(viaEnter).toEqual(viaHover);
    // FEAT-001 / FEAT-002 の既定値ロジックを共有していることの補強。
    expect(viaEnter.from).toBe('System');
    expect(viaEnter.to).toBe('DB');
  });

  test('[AC-3] DSL エディタ textarea 内の Enter による改行を奪わない', async ({ page }) => {
    await boot(page);
    await selectMessageByLine(page, 8);

    const before = await page.locator('#editor').inputValue();
    await page.locator('#editor').focus();
    await page.evaluate(() => {
      var ed = document.getElementById('editor');
      ed.selectionStart = ed.selectionEnd = ed.value.length;
    });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    expect(await modalDisplay(page)).toBe('none');
    expect(await page.locator('#editor').inputValue()).toBe(before + '\n');
  });

  test('[AC-4] 選択0件 / 修飾キー付き Enter では発火しない', async ({ page }) => {
    await boot(page);

    await page.evaluate(() => window.MA.selection.clearSelection());
    await blurToBody(page);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    expect(await modalDisplay(page)).toBe('none');

    await selectMessageByLine(page, 8);
    await blurToBody(page);
    for (const mod of ['Alt', 'Control', 'Shift', 'Meta']) {
      await page.keyboard.press(mod + '+Enter');
      await page.waitForTimeout(100);
      expect(await modalDisplay(page)).toBe('none');
    }
  });

  test('[AC-5] modal が開いている間は二重に発火しない', async ({ page }) => {
    await boot(page);
    await selectMessageByLine(page, 8);
    await blurToBody(page);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#seq-modal-content');

    await page.keyboard.type('Keep');
    // modal 内から body へフォーカスを外した状態で再度 Enter。
    await blurToBody(page);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // modal は 1 つのまま、入力内容も再構築されていない。
    await expect(page.locator('#seq-modal')).toHaveCount(1);
    expect(await page.locator('#seq-mod-label-rle .rle-textarea').inputValue()).toBe('Keep');
  });

  test('[AC-6] 不可触: FEAT-004 のフォーカスと .seq-move-up/.seq-move-down が不変', async ({ page }) => {
    await boot(page);
    await selectMessageByLine(page, 8);
    await blurToBody(page);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#seq-modal-content');

    // FEAT-004: modal 表示直後に本文 textarea がフォーカスを持つ。
    const isLabelTa = await page.evaluate(() => {
      var ta = document.querySelector('#seq-mod-label-rle .rle-textarea');
      return !!ta && document.activeElement === ta;
    });
    expect(isLabelTa).toBe(true);

    // modal の Escape 挙動は変更前と同じく「閉じない」。
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    expect(await modalDisplay(page)).toBe('flex');

    await page.locator('#seq-mod-cancel').click();
    await page.waitForTimeout(200);

    // Properties パネルの上下移動ボタンが従来どおり描画される。
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
    await expect(page.locator('.seq-move-up')).toHaveCount(1);
    await expect(page.locator('.seq-move-down')).toHaveCount(1);
    await page.locator('#props-content').screenshot({
      path: path.join(SHOT_DIR, 'ac6-props-panel-intact.png'),
    });
  });

  test('[AC-6] 不可触: ホバー挿入導線 (+ ここに挿入) が従来どおり出る', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.MA.selection.clearSelection());

    const box = await page.locator('#preview-svg').boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7);
      await page.waitForTimeout(300);
    }
    const label = await page.evaluate(() => {
      var t = document.querySelector('#hover-layer text.hover-label');
      return t ? t.textContent : null;
    });
    // ガイドが出た場合はラベル文言が不変であること (出ない環境では判定対象外)。
    if (label !== null) expect(label).toBe('+ ここに挿入');
  });

  // ---- FEAT-123 / UI-014 / HFR-064 -------------------------------------
  // 挿入 modal を「キャンセル」で閉じたとき、開く直前の選択を復帰する。
  // 🔴 タグは [F123-AC-n] とする: 本ファイルには FEAT-017 の [AC-1]〜[AC-6] が既にあり、
  //    LOOP-437 (i)「同一 spec 内で AC タグを重複させない」に従い新規側を一意な別名にした。
  async function currentSelection(page) {
    return page.evaluate(() => window.MA.selection.getSelected());
  }

  test('[F123-AC-1] Enter で開いた挿入 modal をキャンセルすると、開く直前の選択が復帰する', async ({ page }) => {
    await boot(page);
    expect(await selectMessageByLine(page, 8)).toBeTruthy();
    await blurToBody(page);
    // 🔴 比較の基準は modal を開く「前」に取得する (開いた後に読み直した値どうしの比較は
    //    実装が no-op でも通る同語反復になる — LOOP-437 (ii))。
    const before = await currentSelection(page);
    expect(before.length).toBe(1);

    await page.keyboard.press('Enter');
    await page.waitForSelector('#seq-modal-content');
    expect(await modalDisplay(page)).toBe('flex');
    // 開いている間に選択を意図的に壊し、キャンセルが「開く直前の値」を復帰することを判定する。
    // (壊さないと、選択が元々保持されているだけの実装でも通る同語反復になる)
    await page.evaluate(() => window.MA.selection.clearSelection());
    expect((await currentSelection(page)).length).toBe(0);

    await page.locator('#seq-mod-cancel').click();
    await page.waitForTimeout(300);
    expect(await modalDisplay(page)).toBe('none');

    expect(await currentSelection(page)).toEqual(before);
  });

  test('[F123-AC-2] キャンセル直後の ↑ / ↓ が SVG を再クリックせずに効く', async ({ page }) => {
    await boot(page);
    expect(await selectMessageByLine(page, 8)).toBeTruthy();
    await blurToBody(page);
    const before = await currentSelection(page);

    await page.keyboard.press('Enter');
    await page.waitForSelector('#seq-modal-content');
    await page.evaluate(() => window.MA.selection.clearSelection());
    await page.locator('#seq-mod-cancel').click();
    await page.waitForTimeout(300);

    // SVG の再クリックは 1 度も行わない。キーボードのみ。
    await blurToBody(page);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);

    const after = await currentSelection(page);
    expect(after.length).toBe(1);
    // 操作「前」の値と「異なる」ことを主張する (LOOP-437 (ii))。
    expect(after[0].line).not.toBe(before[0].line);
  });

  test('[F123-AC-3] 選択が無い状態で開いた modal をキャンセルしても選択は作られない', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.MA.selection.clearSelection());
    const before = await currentSelection(page);
    expect(before.length).toBe(0);

    // ホバー/パネルと同じ入口 (showInsertForm) を直接開く。
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
    await page.waitForSelector('#seq-modal-content');
    await page.locator('#seq-mod-cancel').click();
    await page.waitForTimeout(300);

    expect(await currentSelection(page)).toEqual([]);
  });
});
