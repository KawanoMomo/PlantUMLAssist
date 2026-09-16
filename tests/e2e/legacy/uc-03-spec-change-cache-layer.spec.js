// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText, clickOverlayByLine } = require('../helpers');

test.describe('UC-3: 仕様変更 (Cache 層)', () => {
  test('Cache 参加者を末尾追加 + 既存メッセージの 1本の to を Cache に変更', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-cache-spec.puml');
    await page.waitForTimeout(1500);

    // 1. Cache 参加者を末尾追加 (位置駆動挿入は Sprint 7 で完成、ここでは末尾追加で代替)
    await page.locator('#seq-tail-kind').selectOption('participant');
    await page.locator('#seq-tail-ptype').selectOption('participant');
    await page.locator('#seq-tail-alias').fill('Cache');
    await page.locator('#seq-tail-add').click();
    await page.waitForTimeout(300);

    // 2. 既存 query1 message をクリックして to を Cache に変更
    // BLK-human-20260915-1205: 参加者の宣言は末尾ではなく「参加者の欄」に入るように
    // なったので、追加した Cache の宣言のぶんメッセージの行番号が下にずれる。
    // 固定の行番号 (以前の 6) ではなく、本文から今の行番号を引く。
    const query1Line = await page.evaluate(() => {
      var lines = document.getElementById('editor').value.split('\n');
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf('query1') >= 0) return i + 1;
      }
      return -1;
    });
    expect(query1Line).toBeGreaterThan(0);
    await clickOverlayByLine(page, query1Line);
    await page.waitForTimeout(300);
    await page.locator('#seq-edit-to').selectOption('Cache');
    await page.waitForTimeout(500);

    var t = await getEditorText(page);
    expect(t).toContain('participant Cache');
    expect(t).toContain('System -> Cache : query1');
  });
});
