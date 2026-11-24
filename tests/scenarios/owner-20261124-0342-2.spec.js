// @ts-check
// TICKET-owner-20261124-0342-2: 「保存先のフォルダを選ぶ」の窓と「この図の履歴」の窓は、開いても手が窓に入らなかった (BODY)。
// 期待 (principles「窓はどれも開いたら最初の打てる欄に手が入り、Esc で保存せずに閉じる」):
//   (1) 「保存先のフォルダを選ぶ」の窓は、どの入口 (FILES の右クリック・Ctrl+K・⚙ 設定・Import ▾) から開いても手がパスの欄にあり、
//       Esc 1 回で何も変えずに閉じる。Import ▾ から開いてキーボードだけでパスを打って Enter で保存先が替わる
//   (2) FILES のファイルの右クリック「この図の履歴を表示」の直後、手は窓の中 (図の選び)。Esc 1 回で閉じる
//   (3) 窓を開いて閉じただけでは保存先の図は 1 バイトも変わらない
const { test, expect } = require('@playwright/test');
const S = require('../e2e/scenarios/_scenario');

const DIR = S.dirFor(__filename);
const DIR_B = DIR + '-b';
const DSL = ['@startuml', 'participant Gpio_Driver', 'Gpio_Driver -> Hal : Gpio_Init()', '@enduml'].join('\n');

async function mouseClick(page, locator, button) {
  await expect(locator).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, button ? { button } : undefined);
}

// 手 (document.activeElement) が sel の窓の中ならその id、外なら 'OUT:{tag}#{id}'。
function focusIn(page, sel) {
  return page.evaluate((s) => {
    const a = document.activeElement;
    if (a && a.closest && a.closest(s)) return a.id || a.tagName;
    return 'OUT:' + (a ? a.tagName + '#' + (a.id || '') : 'null');
  }, sel);
}

function fileDir(page) {
  return page.evaluate(() => window.MA.autoSave.getConfig().fileDir);
}

test('owner 0342-2 保存先のフォルダを選ぶ窓と この図の履歴の窓は、開くと手が窓の最初の欄に入り Esc 1 回で閉じる', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.clearDir(page, DIR_B);
  await S.putDoc(page, DIR, 'gpio_seq', DSL);
  await S.putDoc(page, DIR_B, 'other_state', ['@startuml', '[*] --> Idle', '@enduml'].join('\n'));
  await S.reopenApp(page);
  const row = page.locator('#files-parts .files-part-file[data-file-name="gpio_seq"]').first();
  await expect(row).toBeVisible({ timeout: 10000 });
  const before = await S.readDoc(page, DIR, 'gpio_seq');
  const pick = page.locator('#target-pick');

  async function expectPathFocusedThenEsc(label) {
    await expect(pick, label).toHaveCount(1);
    await expect.poll(() => focusIn(page, '#target-pick'), { message: label, timeout: 2000 }).toBe('target-pick-path');
    // 押した直後だけでなく、開いた操作の後始末が済んだ後も窓の中
    await page.waitForTimeout(300);
    expect(await focusIn(page, '#target-pick'), label + ' (後始末の後)').toBe('target-pick-path');
    await page.keyboard.press('Escape');
    await expect(pick, label + ' Esc 1 回で閉じる').toHaveCount(0);
  }

  // FILES の「保存先」見出しの右クリック
  await mouseClick(page, page.locator('#btn-tab-folder'), 'right');
  await mouseClick(page, page.locator('#files-ctx-menu .files-ctx-item', { hasText: '保存先のフォルダを' }));
  await expectPathFocusedThenEsc('FILES の右クリック');

  // Ctrl+K
  await page.keyboard.press('Control+k');
  await expect(page.locator('#cp-input')).toBeVisible();
  await page.keyboard.type('保存先のフォルダを選ぶ');
  await page.keyboard.press('Enter');
  await expectPathFocusedThenEsc('Ctrl+K');

  // ⚙ 設定 → 自動保存 → 「保存先のフォルダを選ぶ…」
  await mouseClick(page, page.locator('#rail-config'));
  await expect(page.locator('#cfg-modal')).toBeVisible();
  await mouseClick(page, page.locator('#cfg-tab-autosave'));
  await mouseClick(page, page.locator('#cfg-file-dir-pick'));
  await expect(page.locator('#cfg-modal')).toBeHidden();
  await expectPathFocusedThenEsc('⚙ 設定');
  expect(await fileDir(page)).toBe(DIR);

  // FILES のファイルの右クリック「この図の履歴を表示」: 手は窓の中 (図の選び)。Esc 1 回で閉じる。
  await mouseClick(page, row, 'right');
  await mouseClick(page, page.locator('#files-ctx-menu [data-action="history"]'));
  await expect(page.locator('#vt-modal')).toBeVisible();
  await expect.poll(() => focusIn(page, '#vt-modal'), { timeout: 2000 }).toBe('vt-file');
  await page.waitForTimeout(300);
  expect(await focusIn(page, '#vt-modal'), '履歴の窓 (後始末の後)').toBe('vt-file');
  await page.screenshot({ path: testInfo.outputPath('history-focus.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#vt-modal')).toBeHidden();

  // 開いて閉じただけでは図は 1 バイトも変わらない
  await page.waitForTimeout(800);
  expect(await S.readDoc(page, DIR, 'gpio_seq')).toBe(before);

  // Import ▾ →「保存先のフォルダを選ぶ…」: 手はパスの欄。キーボードだけで打って Enter で保存先が替わる。
  await mouseClick(page, page.locator('#btn-import'));
  await mouseClick(page, page.locator('#imp-target'));
  await expect(pick).toHaveCount(1);
  await expect.poll(() => focusIn(page, '#target-pick'), { timeout: 2000 }).toBe('target-pick-path');
  await page.screenshot({ path: testInfo.outputPath('target-pick-focus.png') });
  await page.keyboard.type(DIR_B);
  await page.keyboard.press('Enter');
  await expect(pick).toHaveCount(0, { timeout: 10000 });
  await expect(page.locator('#files-parts .files-part-file[data-file-name="other_state"]')).toHaveCount(1, { timeout: 10000 });
  expect((await fileDir(page)).replace(/\\/g, '/')).toMatch(/owner-20261124-0342-2-b$/);
  expect(await S.readDoc(page, DIR, 'gpio_seq')).toBe(before);
  expect(errors, errors.join('\n')).toEqual([]);
});
