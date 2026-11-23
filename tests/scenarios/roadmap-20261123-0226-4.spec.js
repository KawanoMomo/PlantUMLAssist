// @ts-check
// TICKET-roadmap-20261123-0226-4 (roadmap/v7.0.md できれば 3):
//   サブフォルダの図にも、保存の入れ替わりの検知と版の通し (この図の履歴) が直下の図と同じに効く。
// 期待 (利用者の初回と同じ既定の画面・実マウスと打鍵。保存先は PUA_DATA_ROOT の試験用フォルダの下):
//   (a) 1 階層下の図を 2 回直して Ctrl+S → FILES のその図の右クリック「この図の履歴」に版が 2 つ (開いたときの版と 1 回目の版) 並び、
//       前の版に戻すと本文とファイルがその版のバイト列になる
//   (b) 直下に同じ名前の図があるとき、サブフォルダの図の履歴に直下の図の版が出ず、直下の図の履歴にサブフォルダの図の版が出ない
//   (c) サブフォルダの図で、直下の図と同じ入れ替わりの形 (別の図と同じ中身・行の激減) の保存をすると、直下の図と同じ知らせが出る
//   各操作の後、保存先以下に増えたファイル 0・保存した 1 枚以外はバイト一致
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
// before と after を比べ、keys (変わってよいもの) 以外が全部同じで、ファイルが増えていないか。
function expectOthersSame(before, after, keys) {
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  for (const k of Object.keys(before)) if (keys.indexOf(k) < 0) expect(after[k], k).toBe(before[k]);
}
const norm = (t) => String(t).replace(/\r\n/g, '\n');
const readN = (p) => norm(fs.readFileSync(p, 'utf8'));

async function mouseClick(page, locator, opts) {
  await expect(locator).toBeVisible();
  await locator.click(opts);
}
const subDir = (page, rel) => page.locator('#files-subtree .files-sub-dir[data-sub-rel="' + rel + '"]');
const subFile = (page, rel, name) => page.locator('#files-subtree .files-sub-file[data-sub-rel="' + rel + '"][data-file-name="' + name + '"]');
const rootFile = (page, name) => page.locator('#files-parts .files-part-file[data-file-name="' + name + '"]');
async function openDir(page, rel) {
  const d = subDir(page, rel);
  await expect(d).toHaveCount(1, { timeout: 10000 });
  if ((await d.getAttribute('aria-expanded')) !== 'true') await mouseClick(page, d);
  await expect(d).toHaveAttribute('aria-expanded', 'true');
}
async function typeLineBeforeEnd(page, line) {
  const text = await H.getEditorText(page);
  const at = text.lastIndexOf('@enduml');
  await page.locator('#editor').click();
  await page.evaluate((i) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.focus();
    ed.setSelectionRange(i, i);
  }, at);
  // 1 行を 1 回の入力で入れる (貼り付けと同じ)。1 文字ずつ打つと自動保存が打鍵ごとに書き、版も打鍵ごとに積まれる
  // (直下の図でも同じ。ここで見たいのは「直して保存した回」の版なので、1 回の直しを 1 回の入力にする)。
  await page.keyboard.insertText(line + '\n');
}
async function ctrlS(page) {
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  await expect(page.locator('#status-save-result')).toContainText('保存しました', { timeout: 20000 });
}
// FILES の行を右クリック →「この図の履歴を表示」。並んだ版の刻印を返す。
async function openHistory(page, row) {
  await mouseClick(page, row, { button: 'right' });
  await mouseClick(page, page.locator('#files-ctx-menu .files-ctx-item', { hasText: 'この図の履歴' }).first());
  await expect(page.locator('#vt-modal')).toBeVisible();
  await expect(page.locator('#vt-modal .folder-version-row').first()).toBeVisible({ timeout: 10000 });
  return page.locator('#vt-modal .folder-version[data-version-stamp]').evaluateAll(
    (els) => els.map((e) => e.getAttribute('data-version-stamp')));
}
// 版の中身 (server の控え)。dir は保存先からのフォルダ。
async function versionText(page, dir, name, stamp) {
  return page.evaluate(async (a) => {
    const r = await fetch('/autosave-versions?dir=' + encodeURIComponent(a.dir) + '&type=' + encodeURIComponent(a.name)
      + '&stamp=' + encodeURIComponent(a.stamp));
    return r.ok ? r.text() : null;
  }, { dir, name, stamp });
}

const ROOT_SPI = '@startuml\nparticipant RootOnly\nRootOnly -> Spi : root\n@enduml\n';
const SUB_SPI = '@startuml\nparticipant SubOnly\nparticipant Spi\nSubOnly -> Spi : Spi_Init()\nSpi --> SubOnly : E_OK\n@enduml\n';

test('roadmap 0226-4 サブフォルダの図を 2 回直して保存 → この図の履歴に 2 版、前の版に戻せる。直下の同じ名前の図の版と混ざらない', async ({ page }, testInfo) => {
  test.setTimeout(150 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  page.on('dialog', (d) => d.accept());
  const dir = path.join(S.absDirFor(__filename), 't1');
  const rel = S.dirFor(__filename) + '/t1';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'design'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'spi.puml'), ROOT_SPI);
  fs.writeFileSync(path.join(dir, 'other.puml'), '@startuml\nA -> B : other\n@enduml\n');
  fs.writeFileSync(path.join(dir, 'design', 'spi.puml'), SUB_SPI);
  fs.writeFileSync(path.join(dir, 'design', 'note.puml'), '@startuml\nN -> M : note\n@enduml\n');
  let before = snapshot(dir);

  await H.bootWithSaveDir(page, rel);
  await openDir(page, 'design');

  // (a) サブフォルダの spi を開き、2 回直してそのたびに Ctrl+S。
  await mouseClick(page, subFile(page, 'design', 'spi'));
  await expect.poll(() => H.getEditorText(page), { timeout: 10000 }).toBe(SUB_SPI);
  await typeLineBeforeEnd(page, 'Spi -> Spi : first');
  const edited1 = await H.getEditorText(page);
  await ctrlS(page);
  await expect.poll(() => readN(path.join(dir, 'design', 'spi.puml')), { timeout: 10000 }).toBe(norm(edited1));
  await page.waitForTimeout(1100);   // 版の刻印は秒単位
  await typeLineBeforeEnd(page, 'Spi -> Spi : second');
  const edited2 = await H.getEditorText(page);
  await ctrlS(page);
  await expect.poll(() => readN(path.join(dir, 'design', 'spi.puml')), { timeout: 10000 }).toBe(norm(edited2));
  await page.waitForTimeout(1000);
  let after = snapshot(dir);
  expectOthersSame(before, after, ['design/spi.puml']);
  before = after;

  // 直下の spi も 1 回直して保存する (直下の図の版を 1 つ作る)。
  await mouseClick(page, rootFile(page, 'spi'));
  await expect.poll(() => H.getEditorText(page), { timeout: 10000 }).toBe(ROOT_SPI);
  await typeLineBeforeEnd(page, 'RootOnly -> Spi : root2');
  const rootEdited = await H.getEditorText(page);
  await ctrlS(page);
  await expect.poll(() => readN(path.join(dir, 'spi.puml')), { timeout: 10000 }).toBe(norm(rootEdited));
  await page.waitForTimeout(1000);
  after = snapshot(dir);
  expectOthersSame(before, after, ['spi.puml']);
  before = after;

  // (b) 直下の図の履歴: 直下の図の版だけ (サブフォルダの図の版が出ない)。
  const rootStamps = await openHistory(page, rootFile(page, 'spi'));
  expect(rootStamps.length).toBeGreaterThanOrEqual(1);
  for (const s of rootStamps) {
    const t = await versionText(page, rel, 'spi', s);
    expect(t, s).not.toBeNull();
    expect(t).toContain('RootOnly');
    expect(t).not.toContain('SubOnly');
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#vt-modal')).toBeHidden();

  // (a)(b) サブフォルダの図の右クリック「この図の履歴」: 開いたときの版と 1 回目の版の 2 つ。直下の図の版は出ない。
  const subStamps = await openHistory(page, subFile(page, 'design', 'spi'));
  await expect(page.locator('#vt-summary')).toContainText('design/spi');
  await page.screenshot({ path: testInfo.outputPath('sub-history.png') });
  const texts = [];
  for (const s of subStamps) {
    const t = await versionText(page, rel + '/design', 'spi', s);
    expect(t, s).not.toBeNull();
    expect(t).toContain('SubOnly');
    expect(t).not.toContain('RootOnly');
    texts.push(norm(t));
  }
  expect(subStamps.length).toBe(2);
  expect(texts).toContain(norm(SUB_SPI));
  expect(texts).toContain(norm(edited1));
  // 前の版 (開いたときの版) に戻す → 本文とファイルがその版のバイト列になる。
  const firstStamp = subStamps[texts.indexOf(norm(SUB_SPI))];
  await mouseClick(page, page.locator('#vt-modal .folder-version-restore[data-version-restore="' + firstStamp + '"]'));
  await expect.poll(() => H.getEditorText(page), { timeout: 10000 }).toBe(SUB_SPI);
  await expect.poll(() => fs.readFileSync(path.join(dir, 'design', 'spi.puml')).toString('base64'), { timeout: 15000 })
    .toBe(Buffer.from(SUB_SPI).toString('base64'));
  await page.waitForTimeout(1200);
  after = snapshot(dir);
  expectOthersSame(before, after, ['design/spi.puml']);
  expect(errors, errors.join('\n')).toEqual([]);
});

const BIG = '@startuml\nparticipant Drv\nparticipant Hw\nDrv -> Hw : reg1\nDrv -> Hw : reg2\nDrv -> Hw : reg3\nDrv -> Hw : reg4\nDrv -> Hw : reg5\nHw --> Drv : ok\n@enduml\n';
const TPL = '@startuml\nAlice -> Bob : hello\n@enduml\n';

test('roadmap 0226-4 サブフォルダの図で入れ替わりの形の保存をすると、直下の図と同じ知らせが出る', async ({ page }, testInfo) => {
  test.setTimeout(120 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  page.on('dialog', (d) => d.accept());
  const dir = path.join(S.absDirFor(__filename), 't2');
  const rel = S.dirFor(__filename) + '/t2';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'design'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'template.puml'), TPL);
  fs.writeFileSync(path.join(dir, 'root_drv.puml'), BIG.replace('Drv -> Hw : reg1', 'Drv -> Hw : root'));
  fs.writeFileSync(path.join(dir, 'design', 'drv.puml'), BIG);
  let before = snapshot(dir);
  const warn = page.locator('#save-swap-overlay');

  await H.bootWithSaveDir(page, rel);

  // 直下の図: 一度保存してから雛形と同じ中身にして保存 → 知らせ。
  await mouseClick(page, rootFile(page, 'root_drv'));
  await expect.poll(() => H.getEditorText(page), { timeout: 10000 }).toContain('reg2');
  await ctrlS(page);
  await page.locator('#editor').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText(TPL);
  await ctrlS(page);
  await expect(warn).toBeVisible({ timeout: 10000 });
  await expect(warn).toHaveAttribute('data-warn', '1');
  const rootSummary = await page.locator('#ssw-summary').textContent();
  expect(rootSummary).toContain('root_drv');
  await expect(page.locator('#ssw-list')).toContainText('template');
  await expect(page.locator('#ssw-list')).toContainText('行に減りました');
  await page.waitForTimeout(1000);
  let after = snapshot(dir);
  expectOthersSame(before, after, ['root_drv.puml']);
  before = after;
  await mouseClick(page, page.locator('#btn-ssw-close'));

  // サブフォルダの図: 同じ形の保存 → 同じ知らせ (名指しは道付き)。
  await openDir(page, 'design');
  await mouseClick(page, subFile(page, 'design', 'drv'));
  await expect.poll(() => H.getEditorText(page), { timeout: 10000 }).toBe(BIG);
  await ctrlS(page);
  await expect(warn).toBeHidden();   // 入れ替わっていない保存では出ない
  await page.locator('#editor').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText(TPL);
  await ctrlS(page);
  await expect(warn).toBeVisible({ timeout: 10000 });
  await expect(warn).toHaveAttribute('data-warn', '1');
  const subSummary = await page.locator('#ssw-summary').textContent();
  expect(subSummary).toContain('design/drv');
  // 知らせの形は直下の図と同じ (名前だけが違う)
  expect(String(subSummary).replace('design/drv', 'X')).toBe(String(rootSummary).replace('root_drv', 'X'));
  await expect(page.locator('#ssw-list')).toContainText('template');
  await expect(page.locator('#ssw-list')).toContainText('10 行から 3 行に減りました');
  await page.screenshot({ path: testInfo.outputPath('sub-swap.png') });
  // 保存の記録にもファイル名 (道付き) で残る。
  await mouseClick(page, page.locator('#btn-ssw-log'));
  await expect(page.locator('#ssw-log li').first()).toContainText('design/drv');
  await page.waitForTimeout(1000);
  after = snapshot(dir);
  expectOthersSame(before, after, ['design/drv.puml']);
  expect(readN(path.join(dir, 'design', 'drv.puml'))).toBe(TPL);
  expect(errors, errors.join('\n')).toEqual([]);
});
