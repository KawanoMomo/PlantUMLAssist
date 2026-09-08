// @ts-check
// primary 台本 手順5.5: persona-data\reviewer\指摘.md を読み、そこにある指摘を全部反映する。
// 参加者名だけの変更は「⇄一括置換」の #rename-all-docs を外して対象図だけに絞る。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順5.5 参加者名だけの指摘は、対象図だけに絞って反映できる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // 指摘: can_state の Can_Driver だけを Can_Ctrl に改める(can_init_sequence は触らない)。
  await S.putDoc(page, DIR, 'can_state', S.docFor('can_state'));
  await S.putDoc(page, DIR, 'can_init_sequence', S.docFor('can_init_sequence'));
  await S.openFolderItem(page, 'can_init_sequence');
  expect(await page.locator('#editor').inputValue()).toContain('participant Can_Driver');

  await S.runCommand(page, '一括置換');
  const allDocs = page.locator('#rename-all-docs');
  if (await allDocs.isChecked()) await allDocs.uncheck();
  await page.locator('#rename-from').fill('Can_Driver');
  await page.locator('#rename-to').fill('Can_Ctrl');
  await page.waitForTimeout(1200);

  // 到達条件その1: 影響の一覧が、対象の図だけを件数つきで挙げる。
  const listed = (await page.locator('#rename-folder').textContent()) || '';
  expect(listed).toMatch(/can_init_sequence(開いている)?\s*3\s*件/);

  // 到達条件その2: 絞ったうえで適用でき、開いている図が新しい名前になる。
  await expect(page.locator('#btn-rename-apply')).toBeEnabled();
  await page.locator('#btn-rename-apply').click();
  await page.waitForTimeout(1500);
  expect(await page.locator('#editor').inputValue()).toContain('Can_Ctrl');

  // 到達条件その3: 絞ったので、触っていない図は元のまま残る。
  expect(await S.readDoc(page, DIR, 'can_state')).not.toContain('Can_Ctrl');
});
