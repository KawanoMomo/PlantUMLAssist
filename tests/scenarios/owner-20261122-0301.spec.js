// @ts-check
// TICKET-owner-20261122-0301-1: シーケンス図の右パネル「↓ この後に注釈追加」で開く挿入の窓に手が入らず、Esc でも閉じなかった
//   (Esc は背後の選択を外すだけで、開いたままの窓の幕が図のクリックを塞いだ)。
// 期待 (principles.md「窓はどれも Esc で保存せずに閉じる」「押した対象だけが変わる」「描ける」):
//   (1) メッセージを図で押す →「↓ この後に注釈追加」→ そのまま打って Enter で、notify の行の直後に注釈 1 行だけが増える
//   (2) もう一度開いて Esc 1 回で窓が閉じ、本文は変わらず、右パネルは押したメッセージの選択のまま。続けて図の別のメッセージを押すとそれが選ばれる
//   (3) 白紙のシーケンス図で参加者を Enter で 1 件足した直後に打った字は名前欄に入る
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

const DSL = ['@startuml', 'participant Sensor', 'participant Driver', 'participant App',
  'Sensor -> Driver : irq', 'Driver -> App : notify', 'App -> Driver : read', '@enduml'].join('\n');

// 図のメッセージ (本文の lineNo 行目) を当たり判定の中央で実マウスで押す。
async function clickMessage(page, lineNo) {
  const hit = page.locator('#overlay-layer rect[data-type="message"][data-line="' + lineNo + '"]').first();
  await expect(hit).toBeAttached({ timeout: 15000 });
  await hit.scrollIntoViewIfNeeded();
  const box = await hit.boundingBox();
  if (!box) throw new Error('message not found: line ' + lineNo);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test('owner 0301 挿入の窓は開いたら本文欄に手があり、Enter で 1 行足せ、Esc 1 回で選択を残して閉じる', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  await H.bootWith(page, DSL);
  await H.waitDrawn(page, ['notify', 'read']);
  const modal = page.locator('#seq-modal');

  // (1) notify を図で押し、「↓ この後に注釈追加」→ そのまま打って Enter。
  await clickMessage(page, 6);
  await expect(page.locator('#props-content')).toContainText('6 行目');
  const r =await H.measure(page, testInfo, async () => {
    await page.locator('#props-content button', { hasText: 'この後に注釈追加' }).first().click();
    await expect(modal).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const m = document.getElementById('seq-modal');
      return !!(m && document.activeElement && m.contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA');
    })).toBe(true);
    await page.keyboard.type('1ms 周期');
    await page.keyboard.press('Enter');
    await expect(modal).toBeHidden();
    await expect.poll(() => H.getEditorText(page)).toContain('1ms 周期');
  }, ['1ms 周期']);
  expect(r.diffLines).toBe(1);
  expect(H.removedLines(r.before, r.after)).toEqual([]);
  const lines = r.after.split('\n');
  const at = lines.findIndex((l) => /notify/.test(l));
  expect(lines[at + 1]).toMatch(/^\s*note\b.*1ms 周期/);
  await page.screenshot({ path: testInfo.outputPath('note-added.png') });

  // (2) もう一度開いて Esc 1 回。窓は閉じ、本文は変わらず、選択は残る。
  // 足した後も notify の選択は残っている (押し直すと選択が外れるので押さない)。
  await expect(page.locator('#props-content')).toContainText('6 行目');
  const before = await H.getEditorText(page);
  await page.locator('#props-content button', { hasText: 'この後に注釈追加' }).first().click();
  await expect(modal).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('modal-open.png') });
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  expect(await H.getEditorText(page)).toBe(before);
  await expect(page.locator('#props-content')).toContainText('6 行目');
  // 窓の幕が残っていなければ、図の別のメッセージ (read) を押すとそれが選ばれる。
  await clickMessage(page, 8);
  await expect(page.locator('#props-content')).toContainText('8 行目');
  await H.expectRendered(page);

  // (3) 白紙のシーケンス図で参加者を Enter で 1 件足した直後に打つと名前欄に入る。
  await page.locator('#btn-tab-new').click();
  await page.locator('#rail-types button').filter({ hasText: /SEQ/ }).first().click();
  await expect.poll(() => H.getEditorText(page)).toBe('@startuml\n@enduml');
  await page.locator('#seq-tail-kind-chip-participant').click();
  await page.getByRole('textbox', { name: '名前', exact: true }).fill('Sensor');
  await page.keyboard.press('Enter');
  await H.waitDrawn(page, ['Sensor']);
  await page.keyboard.type('B');
  await expect(page.getByRole('textbox', { name: '名前', exact: true })).toHaveValue('B');

  expect(errors, errors.join('\n')).toEqual([]);
});
