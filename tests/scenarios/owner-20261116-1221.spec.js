// @ts-check
// TICKET-owner-20261116-1221-prune: FILES の見出しの「＋」(新しい図) と「新しいフォルダ」を外した後も、
// (1) FILES の見出しは「FILES」と ◍ (読むだけを表示 / 隠す)・‹ (畳む) だけ。
// (2) タブ列の ＋ と、保存先の右クリック「新しい図」で、それぞれ新しいタブが 1 つ開き、1 行足して保存すると保存先に 1 枚だけ書かれる。
// (3) どちらでも ⚙ 設定の窓は開かず、保存先は変わらない。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

async function addLineAndSave(page) {
  const cur = await page.locator('#editor').inputValue();
  await S.typeDsl(page, cur.replace('@enduml', "' 見直し\n@enduml"));
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(1200);
}

function pumls(dir) {
  return fs.readdirSync(dir).filter((n) => /\.puml$/i.test(n)).sort();
}

test('owner 1221 FILES の見出しは ◍ と ‹ だけで、新しい図はタブ列の ＋ と保存先の右クリックから 1 枚ずつ作れる', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  await S.bootWithSaveDir(page, S.dirFor(__filename));
  const target = await page.locator('#top-save-target').innerText().catch(() => '');

  // (1) 見出しのボタンは 2 つだけ。
  await page.screenshot({ path: testInfo.outputPath('files.png') });
  await expect(page.locator('#files-new-doc')).toHaveCount(0);
  await expect(page.locator('#files-new-folder')).toHaveCount(0);
  const acts = page.locator('#files-panel .files-head-acts button');
  await expect(acts).toHaveCount(2);
  await expect(acts.nth(0)).toHaveAttribute('id', 'files-show-readonly');
  await expect(acts.nth(1)).toHaveAttribute('id', 'files-collapse');
  await expect(page.locator('#files-panel .files-head')).not.toContainText('新しいフォルダ');

  const tabs = page.locator('#tab-bar .tab');
  const before = await tabs.count();
  const files0 = pumls(dir);

  // (2a) タブ列の ＋。
  await page.locator('#btn-tab-new').click();
  await expect(tabs).toHaveCount(before + 1);
  await addLineAndSave(page);
  const files1 = pumls(dir);
  expect(files1.length).toBe(files0.length + 1);

  // (2b) 保存先の右クリック「新しい図」。
  await page.locator('#btn-tab-folder').click({ button: 'right' });
  await page.locator('#files-ctx-menu [data-action="new-doc"]').click();
  await expect(tabs).toHaveCount(before + 2);
  await addLineAndSave(page);
  const files2 = pumls(dir);
  expect(files2.length).toBe(files1.length + 1);

  // (3) 設定の窓は開いていない。保存先も変わらない。
  await expect(page.locator('#cfg-modal')).toBeHidden();
  expect(await page.locator('#top-save-target').innerText().catch(() => '')).toBe(target);

  await H.expectRendered(page);
  H.annotate(testInfo, 'diffLines', 1);
  expect(errors, errors.join('\n')).toEqual([]);
  fs.rmSync(dir, { recursive: true, force: true });
});
