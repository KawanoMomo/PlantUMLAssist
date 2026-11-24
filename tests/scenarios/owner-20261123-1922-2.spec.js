// @ts-check
// TICKET-owner-20261123-1922-2: シーケンス図を開いた直後の「末尾に追加」(メッセージ) が From = To = 先頭の参加者で始まり、
// 本文だけ打って Enter を押すと選んでいない自己メッセージ (`A -> A`) が入った。
// 期待 (principles「GUI の 1 操作は名指しした要素だけを変える」):
//   - 保存先から開いた直後、From は本文の最後のメッセージの送り先 (B)、To は空欄、案内は B を言う
//   - 本文だけ打って Enter → 本文はバイト一致、「終点 (To)」の語で知らせ、手は To にある
//   - 図の参加者 C を押して To にし Enter → `B -> C : 本文` の 1 行だけが足される
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const SEQ = ['@startuml', 'participant A', 'participant B', 'participant C', 'A -> B : start()', '@enduml', ''].join('\n');

test('owner 1922-2 開いた直後の「末尾に追加」は To が空欄で始まり、本文だけの Enter で自己メッセージを足さない', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  const dir = path.join(S.absDirFor(__filename), 'proj');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'seq.puml'), SEQ);
  await H.bootWithSaveDir(page, S.dirFor(__filename) + '/proj');

  // 保存先の図を FILES から開く (実マウス)。
  await page.locator('#files-parts .files-part-file[data-file-name="seq"]').click();
  await H.waitDrawn(page, ['start()']);
  const chip = page.locator('#seq-tail-kind-chip-message');
  if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click();

  const from = page.getByRole('combobox', { name: '始点 (From)' });
  const to = page.getByRole('combobox', { name: '終点 (To)' });
  await expect(from).toHaveValue('B');
  await expect(to).toHaveValue('');
  // 開いた直後は図の参加者を押す手がまだ効かないので、空欄の行は一覧で選ぶ手だけを言う (TICKET-owner-20261123-2322-1)。
  await expect(to.locator('option').first()).toHaveText('（一覧から選ぶ）');
  await expect(page.locator('#seq-tail-endpoint-note')).toContainText('B');
  await page.screenshot({ path: testInfo.outputPath('open-tail.png') });

  // 本文だけ打って Enter → 何も足さず、To の見出しの語で知らせ、手は To。
  const before = await H.getEditorText(page);
  const messages = [];
  page.on('dialog', async (d) => { messages.push(d.message()); await d.accept(); });
  await page.locator('#seq-tail-label-rle .rle-textarea').click();
  await page.keyboard.type('poll');
  await page.keyboard.press('Enter');
  await expect.poll(() => messages.length).toBe(1);
  expect(messages[0]).toBe('「終点 (To)」を選んでください');
  await expect(to).toBeFocused();
  expect(await H.getEditorText(page)).toBe(before);
  H.annotate(testInfo, 'notice', messages[0]);

  // 図の参加者 C を押して To にし、本文欄で Enter → B -> C の 1 行だけ。
  await page.locator('#overlay-layer rect[data-type="participant"][data-id="C"]').first().click();
  await expect(to).toHaveValue('C');
  await page.locator('#seq-tail-label-rle .rle-textarea').click();
  await page.keyboard.press('Enter');
  await expect.poll(() => H.getEditorText(page)).not.toBe(before);
  const after = await H.getEditorText(page);
  const bl = before.split('\n');
  const added = after.split('\n').filter((l) => bl.indexOf(l) < 0);
  expect(added.length).toBe(1);
  expect(added[0]).toMatch(/^\s*B\s*->\s*C\s*:\s*poll\s*$/);
  expect(after.split('\n').length).toBe(bl.length + 1);
  expect(after).not.toMatch(/^\s*A\s*->\s*A\b/m);
  await H.waitDrawn(page, ['poll']);
});
