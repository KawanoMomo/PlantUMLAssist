// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText, clickOverlayByLine } = require('../helpers');

test.describe('UC-7: onboarding 用 note 多数', () => {
  test('既存 messages に note を 3 件付与', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-success-msgs.puml');
    await page.waitForTimeout(1500);

    // note を 1 件入れるたびに以降の行番号がずれるうえ、同じ message を
    // 3 回クリックすると 1 件目の note の overlay 矩形がその message の矩形に
    // 重なってクリックを奪う。題目どおり「既存 messages」3 本にそれぞれ note を
    // 付けるため、毎回 DSL を読み直して i 本目の message の現在行を求める。
    async function messageLineAt(index) {
      var text = await getEditorText(page);
      var lines = text.split('\n');
      var hits = [];
      for (var li = 0; li < lines.length; li++) {
        if (/^\s*\S+\s+-+>>?\s+\S+\s*:/.test(lines[li])) hits.push(li + 1);
      }
      return hits[index];
    }

    var notes = ['認証開始', 'トークン受信', 'リフレッシュ要求'];
    for (var i = 0; i < notes.length; i++) {
      var target = await messageLineAt(i);
      expect(target).toBeGreaterThan(0);
      await clickOverlayByLine(page, target);
      await page.waitForTimeout(300);
      await page.locator('.seq-insert-note-after').click();
      await page.waitForTimeout(500);
      await page.locator('#seq-mod-npos').selectOption('over');
      await page.locator('#seq-mod-ntarget').selectOption({ index: 0 });
      await page.locator('#seq-mod-ntext-rle .rle-textarea').fill(notes[i]);
      await page.locator('#seq-mod-confirm').click();
      await page.waitForTimeout(700);
    }

    var t = await getEditorText(page);
    var noteCount = (t.match(/^note /gm) || []).length;
    expect(noteCount).toBe(3);
  });
});
