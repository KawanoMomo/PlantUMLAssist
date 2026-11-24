// @ts-check
// TICKET-roadmap-20261122-0855-3 (roadmap/v6.0.md 必須 4・クライテリア 4):
//   FILES ツリーの右クリックだけで、そのフォルダに新しい図・新しいフォルダ・移動・名前変更・削除を終え、開いているタブの書き先を付いていかせる。
// 期待 (利用者の初回と同じ既定の画面・実マウスと打鍵):
//   (a) サブフォルダの右クリック「新しい図」→ 1 行足して Ctrl+S → そのフォルダに .puml が 1 枚増える
//   (b) 「新しいフォルダ」→ 名前を打って Enter → ディスクにフォルダができ、ツリーに行が出る
//   (c) 図をタブで開き 1 行足したまま、右クリック「別のフォルダへ移動…」で (b) のフォルダへ移す → 足した行はタブに残り、
//       続く Ctrl+S は新しい場所の 1 枚だけに書き、元の場所にファイルが戻らない。パンくずは新しい場所を言う
//   (d) 同じ図を右クリック「名前を変更」→ 行の欄に打って Enter → タブも新しい名前。続く Ctrl+S は新しい名前の 1 枚だけ
//   (e) 右クリック「削除」→ その 1 枚だけ消え、「この図の履歴」の「戻す」で中身が戻る
//   各操作の後、触っていない全ファイルがバイト一致。行き先に同じ名前の図があれば移動・名前変更は断られ、どちらもバイト一致
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

function snapshot(dir) {
  const out = {};
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { out[path.relative(dir, p).split(path.sep).join('/') + '/'] = 'DIR'; walk(p); }
      else out[path.relative(dir, p).split(path.sep).join('/')] = fs.readFileSync(p).toString('base64');
    }
  })(dir);
  return out;
}
// before と after を比べ、keys (変わってよいもの) 以外が全部同じか。
function expectOthersSame(before, after, keys) {
  const skip = new Set(keys);
  const a = Object.keys(before).filter((k) => !skip.has(k)).sort();
  const b = Object.keys(after).filter((k) => !skip.has(k)).sort();
  expect(b).toEqual(a);
  for (const k of a) expect(after[k], k).toBe(before[k]);
}

// 実マウスで押す (Playwright の click は行の真ん中を実マウスで押し、描き直しで行が差し替わっても押し直す)。
async function mouseClick(page, locator, opts) {
  await expect(locator).toBeVisible();
  await locator.click(opts);
}
async function ctx(page, row, label) {
  await mouseClick(page, row, { button: 'right' });
  const item = page.locator('#files-ctx-menu .files-ctx-item', { hasText: label });
  await mouseClick(page, item.first());
}
const subDir = (page, rel) => page.locator('#files-subtree .files-sub-dir[data-sub-rel="' + rel + '"]');
const subFile = (page, rel, name) => page.locator('#files-subtree .files-sub-file[data-sub-rel="' + rel + '"][data-file-name="' + name + '"]');
async function openDir(page, rel) {
  const d = subDir(page, rel);
  await expect(d).toHaveCount(1, { timeout: 10000 });
  if ((await d.getAttribute('aria-expanded')) !== 'true') await mouseClick(page, d);
  await expect(d).toHaveAttribute('aria-expanded', 'true');
}
// 本文の @enduml の手前に 1 行打つ (実キー)。
async function typeLineBeforeEnd(page, line) {
  const text = await H.getEditorText(page);
  const at = text.lastIndexOf('@enduml');
  await page.locator('#editor').click();
  await page.evaluate((i) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.focus();
    ed.setSelectionRange(i, i);
  }, at);
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
}

const GPIO = '@startuml\nparticipant App\nparticipant GpioDrv\nApp -> GpioDrv : Gpio_Init()\n@enduml\n';

test('roadmap 0855-3 右クリックだけでサブフォルダに新しい図・新しいフォルダ・移動・名前変更・削除ができ、開いているタブが付いていく', async ({ page }, testInfo) => {
  test.setTimeout(150 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  page.on('dialog', (d) => d.accept());
  const dir = path.join(S.absDirFor(__filename), 't1');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'design', 'api'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'top.puml'), '@startuml\nA -> B : top\n@enduml\n');
  fs.writeFileSync(path.join(dir, 'design', 'gpio_seq.puml'), GPIO);
  fs.writeFileSync(path.join(dir, 'design', 'api', 'spi.puml'), '@startuml\nX -> Y : spi\n@enduml\n');
  let before = snapshot(dir);

  await H.bootWithSaveDir(page, S.dirFor(__filename) + '/t1');
  await openDir(page, 'design');

  // (a) サブフォルダに新しい図 → 1 行足して Ctrl+S → design に 1 枚増える。
  await mouseClick(page, subDir(page, 'design'), { button: 'right' });
  await expect(page.locator('#files-ctx-menu')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('folder-menu.png') });
  await mouseClick(page, page.locator('#files-ctx-menu .files-ctx-item', { hasText: '新しい図' }).first());
  await expect(page.locator('#top-crumbs .top-crumb')).toHaveText(['t1', 'design']);
  await typeLineBeforeEnd(page, 'participant NewOne');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#status-save-result')).toContainText('保存しました', { timeout: 20000 });
  await page.waitForTimeout(1000);
  let after = snapshot(dir);
  const added = Object.keys(after).filter((k) => !(k in before));
  expect(added.length).toBe(1);
  expect(added[0]).toMatch(/^design\/diagram\d+\.puml$/);
  expect(Buffer.from(after[added[0]], 'base64').toString('utf8')).toContain('participant NewOne');
  expectOthersSame(before, after, added);
  before = after;

  // (b) 新しいフォルダ → ディスクにでき、ツリーに行が出る。
  await ctx(page, subDir(page, 'design'), '新しいフォルダ');
  await expect(page.locator('#files-newfolder-input')).toBeFocused();
  await page.keyboard.type('archive');
  await page.keyboard.press('Enter');
  await expect(subDir(page, 'design/archive')).toHaveCount(1, { timeout: 10000 });
  expect(fs.statSync(path.join(dir, 'design', 'archive')).isDirectory()).toBe(true);
  after = snapshot(dir);
  expectOthersSame(before, after, ['design/archive/']);
  before = after;
  await page.screenshot({ path: testInfo.outputPath('new-folder.png') });

  // (c) gpio_seq を開いて 1 行足したまま、archive へ移す。
  await mouseClick(page, subFile(page, 'design', 'gpio_seq'));
  await expect.poll(() => H.getEditorText(page), { timeout: 10000 }).toBe(GPIO);
  await typeLineBeforeEnd(page, 'GpioDrv --> App : E_OK');
  const edited = await H.getEditorText(page);
  await ctx(page, subFile(page, 'design', 'gpio_seq'), '別のフォルダへ移動…');
  await mouseClick(page, page.locator('#files-ctx-menu .files-ctx-item', { hasText: 'design/archive' }));
  await expect.poll(() => fs.existsSync(path.join(dir, 'design', 'archive', 'gpio_seq.puml')), { timeout: 10000 }).toBe(true);
  expect(await H.getEditorText(page)).toBe(edited);   // 足した行はタブに残る
  await expect(page.locator('#top-crumbs .top-crumb')).toHaveText(['t1', 'design', 'archive']);
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  await expect(page.locator('#status-save-result')).toContainText('保存しました', { timeout: 20000 });
  await expect.poll(() => fs.readFileSync(path.join(dir, 'design', 'archive', 'gpio_seq.puml'), 'utf8').replace(/\r\n/g, '\n'), { timeout: 10000 }).toBe(edited);
  await page.waitForTimeout(1200);
  expect(fs.existsSync(path.join(dir, 'design', 'gpio_seq.puml')), '元の場所にファイルが戻らない').toBe(false);
  after = snapshot(dir);
  expectOthersSame(before, after, ['design/gpio_seq.puml', 'design/archive/gpio_seq.puml']);
  before = after;

  // (d) 未保存の 1 行を持ったまま名前を変える (行の欄に打つ)。足した行はタブに残り、タブも新しい名前を指し、
  //     続く Ctrl+S は新しい名前の 1 枚だけ。
  await openDir(page, 'design/archive');
  await typeLineBeforeEnd(page, "' renamed");
  const edited2 = await H.getEditorText(page);
  await ctx(page, subFile(page, 'design/archive', 'gpio_seq'), '名前を変更');
  await expect(page.locator('#files-rename-input')).toBeFocused();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('gpio_init');
  await page.keyboard.press('Enter');
  await expect.poll(() => fs.existsSync(path.join(dir, 'design', 'archive', 'gpio_init.puml')), { timeout: 10000 }).toBe(true);
  expect(fs.existsSync(path.join(dir, 'design', 'archive', 'gpio_seq.puml'))).toBe(false);
  await expect(page.locator('#tab-bar .tab.active')).toHaveAttribute('data-doc-name', 'gpio_init');
  expect(await H.getEditorText(page)).toBe(edited2);   // 足した行はタブに残る
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  await expect.poll(() => fs.readFileSync(path.join(dir, 'design', 'archive', 'gpio_init.puml'), 'utf8').replace(/\r\n/g, '\n'), { timeout: 10000 }).toBe(edited2);
  await page.waitForTimeout(1200);
  expect(fs.existsSync(path.join(dir, 'design', 'archive', 'gpio_seq.puml')), '前の名前のファイルが戻らない').toBe(false);
  after = snapshot(dir);
  expectOthersSame(before, after, ['design/archive/gpio_seq.puml', 'design/archive/gpio_init.puml']);
  before = after;
  await page.screenshot({ path: testInfo.outputPath('renamed.png') });

  // (e) 削除 → その 1 枚だけ消え、「この図の履歴」の「戻す」で中身が戻る。
  await ctx(page, subFile(page, 'design/archive', 'gpio_init'), '削除');
  await expect.poll(() => fs.existsSync(path.join(dir, 'design', 'archive', 'gpio_init.puml')), { timeout: 10000 }).toBe(false);
  after = snapshot(dir);
  expectOthersSame(before, after, ['design/archive/gpio_init.puml']);
  // 消した図のタブは開いたまま。そのタブで Ctrl+K「この図の履歴を表示」(ファイルの行はもう無い)。
  await page.locator('#editor').click();
  await page.keyboard.press('Control+k');
  await expect(page.locator('#cp-input')).toBeFocused();
  await page.keyboard.type('この図の履歴');
  await mouseClick(page, page.locator('.cp-item', { hasText: 'この図の履歴を表示' }).first());
  await expect(page.locator('#vt-modal')).toBeVisible();
  const restore = page.locator('#vt-modal .folder-version-restore').first();
  await mouseClick(page, restore);
  await expect.poll(() => fs.existsSync(path.join(dir, 'design', 'archive', 'gpio_init.puml')), { timeout: 15000 }).toBe(true);
  await expect.poll(() => fs.readFileSync(path.join(dir, 'design', 'archive', 'gpio_init.puml'), 'utf8').replace(/\r\n/g, '\n'), { timeout: 10000 }).toBe(edited2);
  await page.waitForTimeout(1200);
  after = snapshot(dir);
  expectOthersSame(before, after, ['design/archive/gpio_init.puml']);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('roadmap 0855-3 行き先に同じ名前の図があれば、移動・名前変更は断られ、どちらのファイルもバイト一致', async ({ page }) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const dir = path.join(S.absDirFor(__filename), 't2');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'design', 'archive'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'design', 'a.puml'), '@startuml\nA -> B : design-a\n@enduml\n');
  fs.writeFileSync(path.join(dir, 'design', 'b.puml'), '@startuml\nA -> B : design-b\n@enduml\n');
  fs.writeFileSync(path.join(dir, 'design', 'archive', 'a.puml'), '@startuml\nA -> B : archive-a\n@enduml\n');
  const before = snapshot(dir);

  await H.bootWithSaveDir(page, S.dirFor(__filename) + '/t2');
  await openDir(page, 'design');
  // 移動: archive に a がある。
  await ctx(page, subFile(page, 'design', 'a'), '別のフォルダへ移動…');
  await mouseClick(page, page.locator('#files-ctx-menu .files-ctx-item', { hasText: 'design/archive' }));
  await expect(page.getByText('移動できませんでした').first()).toBeVisible({ timeout: 10000 });
  // 名前変更: b を a に (同じフォルダに a がある)。
  await ctx(page, subFile(page, 'design', 'b'), '名前を変更');
  await expect(page.locator('#files-rename-input')).toBeFocused();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('a');
  await page.keyboard.press('Enter');
  await expect(page.locator('#files-rename-note')).toBeVisible({ timeout: 10000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  expect(snapshot(dir)).toEqual(before);
  expect(errors, errors.join('\n')).toEqual([]);
});
