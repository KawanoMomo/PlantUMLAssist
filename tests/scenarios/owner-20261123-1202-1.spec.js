// @ts-check
// TICKET-owner-20261123-1202-1: 保存先の一覧を開く 3 つの入口の語を「保存先の一覧を開く」1 つに揃え、Ctrl+K はその語で引ける。
// 期待:
//   (1) 既定の画面・実マウスで 3 つの入口 (FILES の保存先の右クリック・Import ▾・Ctrl+K) を順に押すと、押した入口の文字が
//       どれも「保存先の一覧を開く」で、同じ一覧 (中央の枠 #folder-panel.is-list) に保存先の図が並ぶ
//   (2) Ctrl+K に右クリックの語「保存先の一覧」を打つと、出るコマンドの行はその 1 行。前の語「保存フォルダの図」「保存先を開く」でも先頭に出る
//   (3) 開いて閉じただけでは保存先の図は 1 バイトも変わらない
const { test, expect } = require('@playwright/test');
const S = require('../e2e/scenarios/_scenario');

const WORD = '保存先の一覧を開く';
const DIR = S.dirFor(__filename);
const DSL = ['@startuml', 'participant Gpio_Driver', 'Gpio_Driver -> Hal : Gpio_Init()', '@enduml'].join('\n');

async function mouseClick(page, locator, button) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, button ? { button } : undefined);
}

test('owner 1202-1 保存先の一覧を開く 3 つの入口が同じ語で同じ一覧を開き、Ctrl+K はその語と前の語で引ける', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'gpio_seq', DSL);
  await S.reopenApp(page);
  const before = await S.readDoc(page, DIR, 'gpio_seq');
  const item = page.locator('#folder-panel .folder-item[data-file-name="gpio_seq"]');

  async function expectTheList(entryText) {
    expect(entryText.trim()).toBe(WORD);
    await expect(page.locator('#folder-panel')).toHaveClass(/is-list/);
    await expect(item.first()).toBeVisible({ timeout: 10000 });
    await mouseClick(page, page.locator('#folder-list-close'));
    await expect(page.locator('#folder-panel')).not.toHaveClass(/is-list/);
  }

  // FILES の「保存先」見出しの右クリック
  await mouseClick(page, page.locator('#btn-tab-folder'), 'right');
  const ctxItem = page.locator('#files-ctx-menu [data-action="open-list"]');
  const ctxText = await ctxItem.innerText();
  await mouseClick(page, ctxItem);
  await expectTheList(ctxText);

  // Import ▾ (前の語は出ない)
  await mouseClick(page, page.locator('#btn-import'));
  await expect(page.locator('#imp-folder')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('import-menu.png') });
  await expect(page.locator('#import-menu')).not.toContainText('保存フォルダの図を開く');
  const impText = await page.locator('#imp-folder').innerText();
  await mouseClick(page, page.locator('#imp-folder'));
  await expectTheList(impText);

  // Ctrl+K: 右クリックで覚えた語を打つと、出るコマンドはその 1 行。題は英語の併記なしで同じ語。
  await page.keyboard.press('Control+k');
  await expect(page.locator('#cp-input')).toBeVisible();
  await page.keyboard.type('保存先の一覧');
  const titles = page.locator('#cp-list .cp-item .cp-title');
  await expect(titles).toHaveText([WORD]);
  await page.screenshot({ path: testInfo.outputPath('palette.png') });
  const cpText = await titles.first().innerText();
  await page.keyboard.press('Enter');
  await expectTheList(cpText);

  // 前の語でも引ける (先頭に同じ行)
  for (const q of ['保存フォルダの図', '保存先を開く', '一覧']) {
    await page.keyboard.press('Control+k');
    await expect(page.locator('#cp-input')).toBeVisible();
    await page.keyboard.type(q);
    await expect(titles.first()).toHaveText(WORD);
    await page.keyboard.press('Escape');
    await expect(page.locator('#cp-input')).toBeHidden();
  }

  // 開け閉めしただけでは保存先の図は変わらない
  expect(await S.readDoc(page, DIR, 'gpio_seq')).toBe(before);
  expect(errors, errors.join('\n')).toEqual([]);
});
