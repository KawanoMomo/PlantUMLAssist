// @ts-check
// TICKET-owner-20261123-2322-1: シーケンス図を開いた直後の「末尾に追加」(メッセージ) の案内が
// 「To は図の参加者を押すか選んでください」と言うのに、そのとおり図の参加者を押すと To に入らず参加者の選択に替わった。
// 期待 (principles「画面の語は指す場所を偽らない」):
//   - 開いた直後の案内は、その間に効く手だけを言う (To の一覧で選ぶ)。案内の言う手で To を埋めて Enter → `B -> C` の 1 行だけ
//   - 案内が「図の参加者を押す」と言っている間に図の参加者を押すと、必ずその参加者が To に入る
//   - 開いた直後の参加者の押下が選択になる今の働きは崩さない
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const SEQ = ['@startuml', 'participant A', 'participant B', 'participant C', 'A -> B : start()', '@enduml', ''].join('\n');
const PRESS = '図の参加者を押す';

async function openSeq(page) {
  const dir = path.join(S.absDirFor(__filename), 'proj');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'seq.puml'), SEQ);
  await H.bootWithSaveDir(page, S.dirFor(__filename) + '/proj');
  await page.locator('#files-parts .files-part-file[data-file-name="seq"]').click();
  await H.waitDrawn(page, ['start()']);
  const chip = page.locator('#seq-tail-kind-chip-message');
  if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click();
}

test('owner 2322-1 開いた直後の案内は効く手だけを言い、その手で To を埋めて Enter で B -> C の 1 行だけ', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  await openSeq(page);
  const note = page.locator('#seq-tail-endpoint-note');
  const to = page.getByRole('combobox', { name: '終点 (To)' });
  await expect(to).toHaveValue('');
  const said = (await note.textContent()) || '';
  H.annotate(testInfo, 'note', said);
  expect(said).toContain('B');
  const before = await H.getEditorText(page);

  if (said.indexOf(PRESS) >= 0) {
    // 案内が図を押す手を言うなら、押せば To に入らなければならない (以前はここで選択に替わり To が空のまま)。
    await page.locator('#overlay-layer rect[data-type="participant"][data-id="C"]').first().click();
    await expect(to).toHaveValue('C');
  } else {
    // 案内の言う手: To の一覧で選ぶ (実マウスで欄を押して選ぶ)。
    expect(said).toContain('一覧で選');
    await to.click();
    await to.selectOption('C');
    await expect(to).toHaveValue('C');
  }
  await page.locator('#seq-tail-label-rle .rle-textarea').click();
  await page.keyboard.type('poll');
  await page.keyboard.press('Enter');
  await expect.poll(() => H.getEditorText(page)).not.toBe(before);
  const after = await H.getEditorText(page);
  const bl = before.split('\n');
  const added = after.split('\n').filter((l) => bl.indexOf(l) < 0);
  expect(added.length).toBe(1);
  expect(added[0]).toMatch(/^\s*B\s*->\s*C\s*:\s*poll\s*$/);
  expect(after.split('\n').length).toBe(bl.length + 1);
  await H.waitDrawn(page, ['poll']);
});

test('owner 2322-1 欄に触れると案内が「図の参加者を押す」に替わり、その間に押した参加者が To に入る', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  await openSeq(page);
  const note = page.locator('#seq-tail-endpoint-note');
  const to = page.getByRole('combobox', { name: '終点 (To)' });
  await expect(note).not.toContainText(PRESS);
  await expect(to.locator('option').first()).toHaveText('（一覧から選ぶ）');

  // 欄 (本文) に触れる → 押す手が効き、案内がそれを言う。
  await page.locator('#seq-tail-label-rle .rle-textarea').click();
  await expect(note).toContainText(PRESS);
  await expect(to.locator('option').first()).toHaveText('（図の参加者を押すか選ぶ）');
  await page.screenshot({ path: testInfo.outputPath('armed-note.png') });
  const before = await H.getEditorText(page);
  await page.locator('#overlay-layer rect[data-type="participant"][data-id="A"]').first().click();
  await expect(to).toHaveValue('A');
  // 押しただけでは本文は変わらない。
  expect(await H.getEditorText(page)).toBe(before);
});
