// @ts-check
// junior 台本 手順9: 「先輩の図」の枠を、要るときだけ横に出して読む。
//
// BLK-human-20260915-1203: 枠が起動時から出ていて × を押しても隠れず、幅も変えられなかった
// (CSS の `display: flex` が `hidden` 属性より強く、枠を消す手立てが無かった)。
// 既定は閉じ・× で閉じる・閉じたまま覚える・境目で幅が変わる、をここで守る。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順9 先輩の枠は既定で出ず、👀 先輩で開き、× で閉じ、開き直しても閉じたまま', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);

  const pane = page.locator('#senior-pane');
  const status = page.locator('#status-senior');

  // 到達条件その1: 起動直後は枠が無い (自分の図とプレビューだけが見えている)。
  await expect(pane).toBeHidden();

  // 到達条件その2: 下端の「👀 先輩」1 クリックで開く。
  await status.click();
  await expect(pane).toBeVisible();

  // 到達条件その3: 初めて開いたときだけ「この枠は何か」が 1 行出る。
  const note = page.locator('#senior-first-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('読むだけ');

  // 到達条件その4: × で確実に閉じる。
  await page.locator('#senior-close').click();
  await expect(pane).toBeHidden();

  // 到達条件その5: 読み込み直しても閉じたまま (既定に戻らない)。
  await S.reopenApp(page);
  await expect(page.locator('#senior-pane')).toBeHidden();

  // 2 回目に開いたときは説明を繰り返さない。
  await page.locator('#status-senior').click();
  await expect(page.locator('#senior-pane')).toBeVisible();
  await expect(page.locator('#senior-first-note')).toBeHidden();
});

test('手順9 枠とプレビューの境目をドラッグして幅を変えられ、幅は覚えている', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await page.locator('#status-senior').click();
  await expect(page.locator('#senior-pane')).toBeVisible();

  const handle = page.locator('#resizer-senior');
  // 到達条件その1: 枠が開いていれば取っ手も出ている (閉じている間は出ない)。
  await expect(handle).toBeVisible();

  const before = await page.locator('#senior-pane').boundingBox();
  const hb = await handle.boundingBox();
  if (!before || !hb) throw new Error('枠か取っ手が描かれていない');

  // 到達条件その2: 左へ 120px 引けば枠がその分広がる。
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 - 120, hb.y + hb.height / 2, { steps: 6 });
  await page.mouse.up();

  const after = await page.locator('#senior-pane').boundingBox();
  if (!after) throw new Error('枠が消えた');
  expect(after.width).toBeGreaterThan(before.width + 60);

  // 到達条件その3: 読み込み直しても広げた幅のまま。
  await S.reopenApp(page);
  await expect(page.locator('#senior-pane')).toBeVisible();
  const reopened = await page.locator('#senior-pane').boundingBox();
  if (!reopened) throw new Error('開いたままのはずの枠が無い');
  expect(Math.abs(reopened.width - after.width)).toBeLessThan(12);
});

// 参照ペイン (別タブの図を並べる方) と操作を揃える: 片方だけ挙動が違う状態にしない。
test('手順9 参照ペインも同じく ✕ で閉じ、境目で幅を変えられる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);

  const pane = page.locator('#compare-pane');
  await expect(pane).toBeHidden();

  await page.evaluate(() => { window.toggleCompareView(true, 'ref'); });
  await expect(pane).toBeVisible();

  const handle = page.locator('#resizer-compare');
  await expect(handle).toBeVisible();

  const before = await pane.boundingBox();
  const hb = await handle.boundingBox();
  if (!before || !hb) throw new Error('参照ペインか取っ手が描かれていない');
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 - 100, hb.y + hb.height / 2, { steps: 6 });
  await page.mouse.up();
  const after = await pane.boundingBox();
  if (!after) throw new Error('参照ペインが消えた');
  expect(after.width).toBeGreaterThan(before.width + 50);

  await page.locator('#btn-compare-close').click();
  await expect(pane).toBeHidden();
  await expect(handle).toBeHidden();
});
