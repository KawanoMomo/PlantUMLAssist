// @ts-check
// TICKET-owner-20261124-0822-2: 保存先を決めていない既定の画面で、開いて直した図のタブを × で閉じると、
// 確かめも知らせも無くタブが消え、直した内容がどこにも残らなかった。
// 期待 (principles.md「未保存で離れるときは知らせる」「利用者の図を失わない」「押した対象だけが変わる」):
//   - 「● 保存」の図のタブの × は、閉じる前にアプリ内の窓で知らせる (ブラウザの confirm は使わない)。最初のボタンに手が入る
//   - やめる / Esc ではタブも本文もそのまま
//   - 「保存して閉じる」でダウンロードが 1 回起き、その中身は足した後の本文。タブは閉じる
//   - 開いただけ (直していない) のタブと、保存済みのタブの × は窓を出さずに 1 押しで閉じる
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

const PARTS = ['利用者', '画面', '制御部', 'サーバ'];

async function openFile(page, file) {
  await page.locator('#btn-import').click();
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#imp-file').click()]);
  await fc.setFiles(file);
  await H.waitDrawn(page, PARTS);
}

test('owner 0822-2 未保存の図のタブを × で閉じる前に知らせ、保存して閉じるとダウンロードの中身が直した後の本文', async ({ page }, testInfo) => {
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.type()); d.dismiss(); });
  const src = H.fixture('junior-s1-out.puml');
  const file = testInfo.outputPath('s1-out.puml');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, src);
  await H.bootWith(page, null);

  // 開いただけのタブの × は 1 押しで閉じる (ファイルは既にこの内容)。
  await openFile(page, file);
  const tabs0 = await page.locator('#tab-bar .tab').count();
  expect(tabs0).toBe(2);
  await page.locator('#tab-bar .tab.active .tab-close').click();
  await expect(page.locator('#close-confirm')).toHaveCount(0);
  await expect(page.locator('#tab-bar .tab')).toHaveCount(1);

  // 開き直して、末尾に 1 本足す。
  await openFile(page, file);
  const opened = await H.getEditorText(page);
  await page.getByRole('combobox', { name: '終点 (To)' }).selectOption('Ui');
  await page.getByRole('button', { name: /^\+ 追加/ }).click();
  await expect.poll(async () => H.diffLines(opened, await H.getEditorText(page))).toBe(1);
  const edited = await H.getEditorText(page);
  await expect(page.locator('#top-save')).toContainText('● 保存');

  // × → 窓。手は最初のボタン (保存して閉じる) に入る。
  const close = page.locator('#tab-bar .tab.active .tab-close');
  await close.click();
  const box = page.locator('#close-confirm');
  await expect(box).toBeVisible();
  await expect(box).toContainText('s1-out.puml');
  await expect(box.locator('button[data-choice="save"]')).toBeFocused();
  await expect(page.locator('#tab-bar .tab')).toHaveCount(2);

  // やめる → 何も変わらない。
  await box.getByRole('button', { name: 'やめる' }).click();
  await expect(box).toHaveCount(0);
  await expect(page.locator('#tab-bar .tab')).toHaveCount(2);
  expect(await H.getEditorText(page)).toBe(edited);

  // Esc → 何も変わらない。
  await close.click();
  await expect(box).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(box).toHaveCount(0);
  await expect(page.locator('#tab-bar .tab')).toHaveCount(2);
  expect(await H.getEditorText(page)).toBe(edited);

  // 保存して閉じる → ダウンロード 1 回、中身は直した後の本文。タブは閉じる。
  let downloads = 0;
  page.on('download', () => { downloads++; });
  await close.click();
  await expect(box).toBeVisible();
  const dlP = page.waitForEvent('download');
  await box.getByRole('button', { name: '保存して閉じる' }).click();
  const dl = await dlP;
  const out = testInfo.outputPath('saved.puml');
  await dl.saveAs(out);
  expect(fs.readFileSync(out, 'utf8').replace(/\r\n/g, '\n')).toBe(edited.replace(/\r\n/g, '\n'));
  await expect(page.locator('#tab-bar .tab')).toHaveCount(1);
  await expect(page.locator('#tab-bar .tab[data-doc-name="s1-out"]')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(downloads).toBe(1);

  // 保存済みのタブの × は窓を出さない: 開き直して直し、Ctrl+S で保存してから ×。
  await openFile(page, file);
  const o2 = await H.getEditorText(page);
  await page.getByRole('combobox', { name: '終点 (To)' }).selectOption('Srv');
  await page.getByRole('button', { name: /^\+ 追加/ }).click();
  await expect.poll(async () => H.diffLines(o2, await H.getEditorText(page))).toBe(1);
  const dl2P = page.waitForEvent('download');
  await page.locator('#top-save').click();
  await dl2P;
  await expect(page.locator('#top-save')).toContainText('保存済み');
  await page.locator('#tab-bar .tab.active .tab-close').click();
  await expect(page.locator('#close-confirm')).toHaveCount(0);
  await expect(page.locator('#tab-bar .tab')).toHaveCount(1);

  expect(dialogs).toEqual([]);
  await H.expectRendered(page);
});
