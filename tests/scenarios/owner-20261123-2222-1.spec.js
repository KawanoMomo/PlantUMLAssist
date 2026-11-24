// @ts-check
// TICKET-owner-20261123-2222-1: 保存先を決めていない既定の画面の FILES「保存先」節で、
//   (a) 右クリックの「新しいフォルダ」が画面に出ない既定のフォルダ (./autosave) の下にフォルダを作り、節にも何も出なかった
//   (b) 節の案内は「決めていません」と言うだけで、決める入口の語「保存先のフォルダを選ぶ…」は title にしか無かった
//   (c) 節の行「ダウンロード」を押すと ⚙ 設定が開き、「保存先のフォルダを選ぶ」窓まで手が 1 つ多かった
// 期待 (principles「画面の語は指す場所を偽らない」「何を押せば何が起きるかが画面の語と配置で分かる」「同じ窓を開く入口は同じ語」):
//   - 未設定で右クリック →「新しいフォルダ」は押せず (理由を言う)、押してもディスクに何も作らない (mkdir を送らない)
//   - 節に「保存先のフォルダを選ぶ…」が見える字で出る
//   - 「ダウンロード」1 押しで窓が開き、フォルダを選ぶと節に図が並ぶ。決めた後の右クリックは今どおり
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const S = require('../e2e/scenarios/_scenario');

async function dataRoot(page) {
  const r = await page.evaluate(async () => (await fetch('/data-root')).json());
  expect(r.sandbox).toBe(true);
  return r.dataRoot;
}
async function clearSavePrefs(page) {
  await page.evaluate(async () => {
    await fetch('/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backend: '', fileDir: '' }) });
  });
}
async function mouseClick(page, locator, button) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, button ? { button } : undefined);
}
// dir 以下に name という名前のファイル・フォルダがあるか。
function findNamed(dir, name) {
  const hits = [];
  (function walk(d) {
    let list = [];
    try { list = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of list) {
      const p = path.join(d, e.name);
      if (e.name === name) hits.push(p);
      if (e.isDirectory()) walk(p);
    }
  })(dir);
  return hits;
}

test('未設定の保存先節: 新しいフォルダは押せず何も作らず、決める入口の語が見え、ダウンロードの行 1 押しで窓が開く', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const mkdirs = [];
  page.on('request', (req) => {
    if (req.url().endsWith('/file-op') && /"op":"mkdir"/.test(req.postData() || '')) mkdirs.push(req.postData());
  });
  await S.bootPlain(page);
  await clearSavePrefs(page);
  await page.reload();
  await page.waitForSelector('html[data-app-ready="1"]', { state: 'attached' });
  const root = await dataRoot(page);
  await expect(page.locator('#top-save-target')).toHaveAttribute('data-mode', 'download');

  // (a) 実マウスで保存先を右クリック →「新しいフォルダ」は押せず、理由を言う。
  await mouseClick(page, page.locator('#btn-tab-folder'), 'right');
  const nf = page.locator('#files-ctx-menu .files-ctx-item[data-action="new-folder"]');
  await expect(nf).toBeVisible();
  await expect(nf).toBeDisabled();
  expect(await nf.getAttribute('title')).toContain('保存先のフォルダを決めていません');
  // 「新しい図」は今どおり押せる。
  await expect(page.locator('#files-ctx-menu .files-ctx-item[data-action="new-doc"]')).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('unset-menu.png') });
  // 押しても名前の欄は出ず、打った名前のフォルダはどこにもできない。
  await mouseClick(page, nf);
  await expect(page.locator('#files-newfolder-input')).toHaveCount(0);
  const NAME = 'o2222_dir_' + Date.now().toString(36);
  await page.keyboard.type(NAME);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  expect(mkdirs).toEqual([]);
  expect(findNamed(root, NAME)).toEqual([]);
  // メニューの外 (エディタ) を押して閉じる。
  await mouseClick(page, page.locator('#editor'));
  await expect(page.locator('#files-ctx-menu')).toBeHidden();

  // (b) 節に決める入口の語が見える字で出る (中央の一覧と同じ 2 行)。
  const sec = page.locator('#files-target-unset');
  await expect(sec).toBeVisible();
  await expect(sec).toContainText('保存先のフォルダを決めていません');
  await expect(page.locator('#files-target-unset-hint')).toBeVisible();
  await expect(page.locator('#files-target-unset-hint')).toContainText('保存先のフォルダを選ぶ…');
  await page.screenshot({ path: testInfo.outputPath('unset-section.png') });

  // (c) 節の行「ダウンロード」を 1 押し → 保存先のフォルダを選ぶ窓 (⚙ 設定は挟まない)。
  const top = 'o2222-' + Date.now().toString(36);
  const work = path.join(root, top);
  fs.mkdirSync(work, { recursive: true });
  fs.writeFileSync(path.join(work, 'o2222_seq.puml'), '@startuml\nA -> B : x\n@enduml\n');
  await mouseClick(page, page.locator('#top-save-target'));
  const pick = page.locator('#target-pick');
  await expect(pick).toBeVisible();
  await expect(pick).toHaveAttribute('aria-label', '保存先のフォルダを選ぶ');
  await expect(page.locator('#cfg-modal')).toBeHidden();
  await mouseClick(page, pick.locator('.target-pick-dir', { hasText: top }));
  await mouseClick(page, page.locator('#target-pick-here-ok'));
  await expect(pick).toHaveCount(0);
  await expect(page.locator('#top-save-target')).toHaveAttribute('data-mode', 'file');
  await expect(page.locator('#files-parts .files-part-file[data-file-name="o2222_seq"]')).toHaveCount(1, { timeout: 10000 });
  await expect(page.locator('#files-target-unset')).toHaveCount(0);

  // 決めた後の右クリックは今どおり (新しいフォルダを押せる)。
  await mouseClick(page, page.locator('#btn-tab-folder'), 'right');
  await expect(page.locator('#files-ctx-menu .files-ctx-item[data-action="new-folder"]')).toBeEnabled();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: testInfo.outputPath('after.png') });

  expect(errors, errors.join('\n')).toEqual([]);
  await clearSavePrefs(page);
  fs.rmSync(work, { recursive: true, force: true });
});
