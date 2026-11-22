// @ts-check
// TICKET-owner-20261122-1240-1: 保存先を選ぶ 1 つの窓を開く 4 つの入口の語を、窓の見出し「保存先のフォルダを選ぶ…」に揃え、
// ⚙ 設定に残っていた保存先のパスの手打ちの欄を外して、パスを打つ所を窓の中の 1 か所に寄せる。
// 期待:
//   (1) 既定の画面・実マウスで 4 つの入口 (FILES の右クリック・Import ▾・Ctrl+K・⚙ 設定) を順に押すと、同じ #target-pick が開き、
//       押した入口の文字が窓の見出しと同じ語 (Ctrl+K は英語の併記なし)
//   (2) ⚙ 設定の自動保存に保存先のパスを打つ input が 0。今の保存先の表示と窓を開くボタンだけがある
//   (3) 前の版の設定 (⚙ の欄で決めた保存先) で起こしても、保存先と FILES の図が同じに出る。「設定を保存」で保存先は変わらない
//   (4) 窓で決めた保存先は ⚙ の「設定を保存」で前の値に戻らない
const { test, expect } = require('@playwright/test');
const S = require('../e2e/scenarios/_scenario');

const WORD = '保存先のフォルダを選ぶ…';
const DIR = S.dirFor(__filename);
const DIR_B = DIR + '-b';
const DSL = ['@startuml', 'participant Gpio_Driver', 'Gpio_Driver -> Hal : Gpio_Init()', '@enduml'].join('\n');

async function mouseClick(page, locator, button) {
  await expect(locator).toBeVisible();
  // ⚙ 設定の中身は縦に流れる。利用者と同じく、見える所まで送ってから押す。
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, button ? { button } : undefined);
}

async function clearSavePrefs(page) {
  await page.evaluate(async () => {
    await fetch('/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backend: '', fileDir: '' }) });
  });
}

async function openAutosaveSettings(page) {
  await mouseClick(page, page.locator('#rail-config'));
  await expect(page.locator('#cfg-modal')).toBeVisible();
  await mouseClick(page, page.locator('#cfg-tab-autosave'));
  await expect(page.locator('#cfg-pane-autosave')).toBeVisible();
}

function fileDir(page) {
  return page.evaluate(() => window.MA.autoSave.getConfig().fileDir);
}

test('owner 1240-1 4 つの入口が窓の見出しと同じ語で同じ 1 つの窓を開き、⚙ 設定に保存先のパスを打つ欄が無い', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  await S.bootPlain(page);
  await clearSavePrefs(page);
  await page.reload();
  await page.waitForSelector('html[data-app-ready="1"]', { state: 'attached' });
  await expect(page.locator('#top-save-target')).toHaveAttribute('data-mode', 'download');
  const pick = page.locator('#target-pick');

  async function expectTheWindow(entryText) {
    await expect(pick).toHaveCount(1);
    await expect(pick.locator('.target-pick-title')).toHaveText(WORD.replace(/…$/, ''));
    expect(entryText.trim()).toBe(WORD);
    await page.keyboard.press('Escape');
    await expect(pick).toHaveCount(0);
  }

  // FILES の「保存先」見出しの右クリック
  await mouseClick(page, page.locator('#btn-tab-folder'), 'right');
  const ctxItem = page.locator('#files-ctx-menu .files-ctx-item', { hasText: '保存先のフォルダを' });
  const ctxText = await ctxItem.innerText();
  await mouseClick(page, ctxItem);
  await expectTheWindow(ctxText);
  // 前の語はどの入口にも出ない
  await mouseClick(page, page.locator('#btn-tab-folder'), 'right');
  await expect(page.locator('#files-ctx-menu')).not.toContainText('別のフォルダを保存先にする');
  await page.keyboard.press('Escape');

  // Import ▾
  await mouseClick(page, page.locator('#btn-import'));
  const impText = await page.locator('#imp-target').innerText();
  await mouseClick(page, page.locator('#imp-target'));
  await expectTheWindow(impText);

  // Ctrl+K: 前の語で引いても、出る行は窓と同じ語 (英語の併記なし)
  await page.keyboard.press('Control+k');
  await expect(page.locator('#cp-input')).toBeVisible();
  await page.keyboard.type('保存先を変える');
  const cpTitle = page.locator('#cp-list .cp-item').first().locator('.cp-title');
  await expect(cpTitle).toHaveText(WORD);
  const cpText = await cpTitle.innerText();
  await page.keyboard.press('Enter');
  await expectTheWindow(cpText);

  // ⚙ 設定 → 自動保存: パスを打つ欄は無い。今の保存先の表示と窓を開くボタンだけ。見出しに英語の併記は無い。
  await openAutosaveSettings(page);
  await mouseClick(page, page.locator('#cfg-backend-cards input[value="file"]'));
  await expect(page.locator('#cfg-pane-autosave input[type="text"]')).toHaveCount(0);
  await expect(page.locator('#cfg-file-dir')).toHaveCount(0);
  await expect(page.locator('#cfg-file-dir-cur')).toContainText('今の保存先');
  await expect(page.locator('#cfg-pane-autosave')).not.toContainText('Backend');
  await expect(page.locator('#cfg-backend-cards')).not.toContainText('/ File');
  await page.locator('#cfg-file-dir-pick').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('cfg-autosave.png') });
  const cfgText = await page.locator('#cfg-file-dir-pick').innerText();
  await mouseClick(page, page.locator('#cfg-file-dir-pick'));
  await expect(page.locator('#cfg-modal')).toBeHidden();
  await expectTheWindow(cfgText);

  // 開いて閉じただけでは保存先は変わらない
  await expect(page.locator('#top-save-target')).toHaveAttribute('data-mode', 'download');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('owner 1240-1 前の版の ⚙ の欄で決めた保存先はそのまま開け、窓で決めた保存先は ⚙ の「設定を保存」で前の値に戻らない', async ({ page }) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  // 前の版の設定 = localStorage に ⚙ の欄で打った保存先 (相対パス) が入っている。
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.clearDir(page, DIR_B);
  await S.putDoc(page, DIR, 'legacy_seq', DSL);
  await S.putDoc(page, DIR_B, 'other_state', ['@startuml', '[*] --> Idle', '@enduml'].join('\n'));
  await S.reopenApp(page);

  // 保存先と FILES の図が前と同じに出る。
  await expect(page.locator('#files-parts .files-part-file[data-file-name="legacy_seq"]')).toHaveCount(1, { timeout: 10000 });
  await expect(page.locator('#top-save-target')).toHaveAttribute('data-mode', 'file');
  expect(await fileDir(page)).toBe(DIR);

  // ⚙ には今の保存先が文字で出て、「設定を保存」で保存先は変わらない。
  await openAutosaveSettings(page);
  await expect(page.locator('#cfg-backend-cards input[value="file"]')).toBeChecked();
  await expect(page.locator('#cfg-file-dir-cur')).toContainText(DIR);
  await mouseClick(page, page.locator('#cfg-ok'));
  await expect(page.locator('#cfg-modal')).toBeHidden();
  expect(await fileDir(page)).toBe(DIR);
  await expect(page.locator('#files-parts .files-part-file[data-file-name="legacy_seq"]')).toHaveCount(1);

  // ⚙ のボタンから窓を開き、窓の中のパスの欄 (打つ所はここ 1 か所) で別のフォルダを保存先にする。
  await openAutosaveSettings(page);
  await mouseClick(page, page.locator('#cfg-file-dir-pick'));
  await expect(page.locator('#target-pick')).toHaveCount(1);
  await page.locator('#target-pick-path').fill(DIR_B);
  await mouseClick(page, page.locator('#target-pick-ok'));
  await expect(page.locator('#target-pick')).toHaveCount(0);
  await expect(page.locator('#files-parts .files-part-file[data-file-name="other_state"]')).toHaveCount(1, { timeout: 10000 });
  const chosen = await fileDir(page);
  expect(chosen.replace(/\\/g, '/')).toMatch(/owner-20261122-1240-1-b$/);

  // ⚙ を開くと選んだ保存先が出て、「設定を保存」しても前の保存先へ戻らない。
  await openAutosaveSettings(page);
  await expect(page.locator('#cfg-file-dir-cur')).toContainText('owner-20261122-1240-1-b');
  await mouseClick(page, page.locator('#cfg-ok'));
  await expect(page.locator('#cfg-modal')).toBeHidden();
  expect(await fileDir(page)).toBe(chosen);
  await expect(page.locator('#files-parts .files-part-file[data-file-name="other_state"]')).toHaveCount(1);
  await expect(page.locator('#files-parts .files-part-file[data-file-name="legacy_seq"]')).toHaveCount(0);
  expect(errors, errors.join('\n')).toEqual([]);
  await clearSavePrefs(page);
});
