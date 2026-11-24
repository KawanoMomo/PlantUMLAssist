// @ts-check
// TICKET-roadmap-20261122-0855-1 (roadmap/v6.0.md 必須 1・クライテリア 1):
//   保存先のフォルダを画面から辿って選べるようにし、決める・替える窓を 1 つにする。
// 期待:
//   (1) 保存先が未設定の初回 (既定の画面・実マウス) から、窓が開いた場所の 2 階層下のフォルダを保存先にし終えるまで
//       クリック 6 以内・打鍵 0。直後に FILES の保存先節にその .puml が全部並び、パンくずがそのフォルダを言う
//   (2) 辿る・選ぶ・並ぶの前後で、そのフォルダ以下の全ファイルがバイト一致 (増えたファイル 0)
//   (3) FILES の右クリック・Import ▾・Ctrl+K・⚙ 設定の 4 つの入口が同じ 1 つの窓 (#target-pick) を開く
//   (4) 存在しないフォルダは選べず理由が出る (保存先は変わらない)
// 試験は PUA_DATA_ROOT (test-results の下) だけを辿る: 未設定の窓はそこから開く。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const S = require('../e2e/scenarios/_scenario');

async function dataRoot(page) {
  const r = await page.evaluate(async () => (await fetch('/data-root')).json());
  expect(r.sandbox).toBe(true);
  return r.dataRoot;
}

// dir 以下の全ファイル → 相対パスと中身 (バイト) の対応。
function snapshot(dir) {
  const out = {};
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = fs.readFileSync(p).toString('base64');
    }
  })(dir);
  return out;
}

// 保存先が未設定の初回で開く。保存先はこのマシンの設定 (/prefs) にも残るので、前の試験が決めた保存先を外してから開き直す。
async function clearSavePrefs(page) {
  await page.evaluate(async () => {
    await fetch('/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backend: '', fileDir: '' }) });
  });
}
async function bootFirstTime(page) {
  await S.bootPlain(page);
  await clearSavePrefs(page);
  await page.reload();
  await page.waitForSelector('html[data-app-ready="1"]', { state: 'attached' });
  await expect(page.locator('#top-save-target')).toHaveAttribute('data-mode', 'download');
}

async function mouseClick(page, locator, button) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, button ? { button } : undefined);
}

test('roadmap 0855-1 未設定の初回から 2 階層下のフォルダをクリック 6 以内・打鍵 0 で保存先にし、FILES に並ぶ。中身は 1 バイトも変わらない', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  await bootFirstTime(page);
  const root = await dataRoot(page);
  // 窓が開く場所 (試験用のフォルダ) の下に、作業木 → docs の 2 階層を作る。
  const top = 'pick-' + Date.now().toString(36);
  const work = path.join(root, top);
  const docs = path.join(work, 'docs');
  fs.mkdirSync(path.join(docs, 'old'), { recursive: true });
  fs.writeFileSync(path.join(docs, 'gpio_seq.puml'), '@startuml\r\nA -> B : init\r\n@enduml\r\n');
  fs.writeFileSync(path.join(docs, 'spi_state.puml'), '@startuml\n[*] --> Idle\n@enduml\n');
  fs.writeFileSync(path.join(work, 'README.md'), '# work\n');
  const before = snapshot(work);
  await expect(page.locator('#top-save-target')).toHaveAttribute('data-mode', 'download');

  let clicks = 0;
  const keys = 0;
  const t0 = Date.now();
  // FILES の「保存先」見出しを右クリック →「保存先のフォルダを選ぶ…」(TICKET-owner-20261122-1240-1 で入口の語を窓の見出しに揃えた)。
  await mouseClick(page, page.locator('#btn-tab-folder'), 'right'); clicks++;
  await mouseClick(page, page.locator('#files-ctx-menu .files-ctx-item', { hasText: '保存先のフォルダを選ぶ…' })); clicks++;
  const pick = page.locator('#target-pick');
  await expect(pick).toBeVisible();
  await expect(page.locator('#target-pick-here')).toContainText(root.split(/[\\/]/).pop());
  await mouseClick(page, pick.locator('.target-pick-dir', { hasText: top })); clicks++;
  await mouseClick(page, pick.locator('.target-pick-dir', { hasText: 'docs' })); clicks++;
  // 図が 2 枚あるフォルダだと窓の中で読める。図の無いフォルダ (old) も行として出る。
  await expect(page.locator('#target-pick-here')).toContainText('2 図');
  await expect(pick.locator('.target-pick-dir', { hasText: 'old' })).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('target-pick.png') });
  await mouseClick(page, page.locator('#target-pick-here-ok')); clicks++;
  await expect(pick).toHaveCount(0);

  // 直後に FILES の保存先節にその .puml が全部並び、パンくずがそのフォルダを言う。
  await expect(page.locator('#files-parts .files-part-file[data-file-name="gpio_seq"]')).toHaveCount(1);
  await expect(page.locator('#files-parts .files-part-file[data-file-name="spi_state"]')).toHaveCount(1);
  await expect(page.locator('#top-save-target')).toHaveAttribute('data-mode', 'file');
  await expect(page.locator('#top-crumbs .top-crumb').last()).toHaveText('docs');
  const ms = Date.now() - t0;
  testInfo.annotations.push({ type: 'hands', description: 'clicks=' + clicks + ' keys=' + keys + ' ms=' + ms });
  expect(clicks).toBeLessThanOrEqual(6);
  expect(keys).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('after.png') });

  // 辿る・選ぶ・並ぶの前後で、そのフォルダ以下の全ファイルがバイト一致 (増えたファイル 0)。
  await page.waitForTimeout(1500);   // 自動保存の間隔より長く待ってから比べる
  expect(snapshot(work)).toEqual(before);
  expect(errors, errors.join('\n')).toEqual([]);
  // 後の試験のために、このマシンの設定に残った保存先を外す。
  await clearSavePrefs(page);
});

test('roadmap 0855-1 FILES・Import ▾・Ctrl+K・⚙ 設定の 4 つの入口が同じ 1 つの窓を開く。存在しないフォルダは選べず理由が出る', async ({ page }) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  await bootFirstTime(page);
  const root = await dataRoot(page);
  const pick = page.locator('#target-pick');

  async function expectOneWindow() {
    await expect(pick).toHaveCount(1);
    // 開いただけでは保存先は変わらない (未設定のまま)。
    await expect(page.locator('#top-save-target')).toHaveAttribute('data-mode', 'download');
    await expect(pick).toHaveAttribute('aria-label', '保存先のフォルダを選ぶ');
    await expect(page.locator('#target-pick-here-ok')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(pick).toHaveCount(0);
  }

  // FILES
  await mouseClick(page, page.locator('#btn-tab-folder'), 'right');
  await mouseClick(page, page.locator('#files-ctx-menu .files-ctx-item', { hasText: '保存先のフォルダを選ぶ…' }));
  await expectOneWindow();
  // Import ▾
  await mouseClick(page, page.locator('#btn-import'));
  await mouseClick(page, page.locator('#imp-target'));
  await expectOneWindow();
  // Ctrl+K
  await page.keyboard.press('Control+k');
  await expect(page.locator('#cp-input')).toBeVisible();
  await page.keyboard.type('保存先を変える');
  await expect(page.locator('#cp-list .cp-item').first()).toContainText('保存先');
  await page.keyboard.press('Enter');
  await expectOneWindow();
  // ⚙ 設定
  await mouseClick(page, page.locator('#rail-config'));
  await expect(page.locator('#cfg-modal')).toBeVisible();
  await page.locator('#cfg-tab-autosave').click();
  await mouseClick(page, page.locator('#cfg-file-dir-pick'));
  await expect(page.locator('#cfg-modal')).toBeHidden();
  await expectOneWindow();

  // 存在しないフォルダは選べず理由が出る。保存先は未設定のまま。
  await mouseClick(page, page.locator('#btn-import'));
  await mouseClick(page, page.locator('#imp-target'));
  const missing = path.join(root, 'no-such-' + Date.now().toString(36));
  await page.locator('#target-pick-path').fill(missing);
  await mouseClick(page, page.locator('#target-pick-ok'));
  await expect(page.locator('#target-pick-msg')).toContainText('ありません');
  await expect(pick).toHaveCount(1);
  expect(fs.existsSync(missing)).toBe(false);
  await page.keyboard.press('Escape');
  await expect(page.locator('#top-save-target')).toHaveAttribute('data-mode', 'download');
  expect(errors, errors.join('\n')).toEqual([]);
});
