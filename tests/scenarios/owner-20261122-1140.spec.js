// @ts-check
// TICKET-owner-20261122-1140-prune (roadmap v7.0 必須 1・クライテリア 1 のうち役の印の分):
//   保存フォルダの一覧の「実データ / テンプレ」の分類 (行の役の印・汚染の赤・保存先へ書く役の宣言) を外した。
//   保存先 (直下 2 枚・2 階層下 1 枚) で、利用者の初回と同じ既定の画面から保存フォルダの一覧を開け閉めし、
//   行の印を付け、図を開いても、保存先以下のファイルは 1 つも増えず・変わらない。
//   前の版が置いた役の宣言 (_roles.json) があっても一覧が出て図が開け、その宣言は mtime も中身も変わらない。
// 期待 (principles.md「押した対象だけが変わる」「描ける」、製品仕様書「保存先に書くのは .puml と押した書き出しだけ」):
//   - 一覧の行に役の印 (− / 実 / テ) も「今の内容で更新」も内訳・汚染の行も出ない
//   - 一覧の開け閉め・行の印・図を開くの後、保存先以下に増えたファイル 0・変わったファイル 0
//   - 前から置いた _roles.json は mtime と中身が不変 (読まず・書かず・消さない)
//   - 開いた図は本文のまま描ける
// TICKET-owner-20261122-2322-2 (置換の組を保存先に書かない) は同じ scenario に自分の期待を足す:
//   - 保存先 (直下 2 枚・2 階層下 1 枚) で Ctrl+H の置換を 1 回 (実マウス) した後、保存先以下に増えたファイル 0、
//     変わったのは置換した .puml だけ (`_renames/pairs.json` を保存先に書かない)。開き直した Ctrl+H に今の組が出る
//   - 前の版が保存先に置いた `_renames/pairs.json` は組として出て、置換しても mtime と中身が不変。FILES に `_renames` の行が 0
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const REL = S.dirFor(__filename);
const ABS = S.absDirFor(__filename);

// 保存先 (直下 2 枚・2 階層下 1 枚)。
const DOCS = [
  { rel: 'a.puml', fixture: 'seq-1.puml', words: ['SpiDrvMon', 'Spi_Init()'] },
  { rel: 'b.puml', fixture: 'class-1.puml' },
  { rel: path.join('sub', 'deep', 'c.puml'), fixture: 'state-1.puml' },
];

function place(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const d of DOCS) {
    const p = path.join(dir, d.rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, Buffer.from(H.fixture(d.fixture).replace(/\r\n/g, '\n'), 'utf8'));
  }
}

// 保存先以下の全ファイル: 道 → { 大きさ・mtime・中身の sha1 }。
function snapshot(dir) {
  const out = {};
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      const st = fs.statSync(p);
      out[path.relative(dir, p).replace(/\\/g, '/')] = {
        size: st.size, mtimeMs: st.mtimeMs,
        sha1: crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex'),
      };
    }
  })(dir);
  return out;
}

// 一覧を開き、役の印・内訳が無く、直下の 2 枚が並ぶのを見る。
async function openListAndCheck(page) {
  await S.openFolder(page);
  const panel = page.locator('#folder-panel');
  await expect(panel.locator('.folder-item[data-file-name="a"]').first()).toBeVisible({ timeout: 20000 });
  await expect(panel.locator('.folder-item[data-file-name="b"]').first()).toBeVisible();
  await expect(panel.locator('button.folder-role'), '行の役の印は出ない').toHaveCount(0);
  await expect(panel.locator('button.folder-role-accept'), '「今の内容で更新」は出ない').toHaveCount(0);
  await expect(panel.locator('#folder-role-summary, #folder-role-dirty, #folder-role-note'), '内訳・汚染の行は出ない').toHaveCount(0);
  await expect(panel).not.toContainText('テンプレ');
  await expect(panel).not.toContainText('汚染');
}

async function openA(page) {
  const want = H.fixture('seq-1.puml').replace(/\r\n/g, '\n');
  await page.locator('#folder-panel .folder-item[data-file-name="a"]').first().dblclick();
  await expect(page.locator('#editor')).toHaveValue(want, { timeout: 20000 });
  await H.waitDrawn(page, DOCS[0].words);
  await H.expectRendered(page);
}

test('保存フォルダの一覧の開け閉め・行の印・図を開くで、保存先にファイルが増えず変わらない (役の宣言を書かない)', async ({ page }) => {
  test.setTimeout(120 * 1000);
  const dir = path.join(ABS, 'plain');
  place(dir);
  const before = snapshot(dir);
  await H.bootWithSaveDir(page, REL + '/plain');

  await openListAndCheck(page);
  // 行の印 (まとめて開くための印) を付けて外す。印は画面の中だけ。
  const pick = page.locator('#folder-panel .folder-pick[data-pick-name="a"]').first();
  await pick.click();
  await expect(pick).toBeChecked();
  await pick.click();
  await expect(pick).not.toBeChecked();
  await openA(page);
  await S.closeFolderList(page);
  // もう一度開け閉めする。
  await openListAndCheck(page);
  await S.closeFolderList(page);

  await page.waitForTimeout(1500);   // 自動保存の待ち (200ms) を越えて、書かれていないことを見る
  const after = snapshot(dir);
  expect(Object.keys(after).sort(), '保存先以下に増えた・消えたファイルは無い').toEqual(Object.keys(before).sort());
  for (const k of Object.keys(before)) expect(after[k], k + ' は変わらない').toEqual(before[k]);
  expect(fs.existsSync(path.join(dir, '_roles.json')), '役の宣言は書かない').toBe(false);
});

test('前の版が置いた役の宣言 (_roles.json) がある保存先でも一覧が出て図が開け、宣言は mtime も中身も変わらない', async ({ page }, testInfo) => {
  test.setTimeout(120 * 1000);
  const dir = path.join(ABS, 'roles');
  place(dir);
  // a を「テンプレ」、もう無い図 gone を「実データ」と宣言した前の版の控え。前の版はこれを開くたびに書き直していた。
  const rolesFile = path.join(dir, '_roles.json');
  fs.writeFileSync(rolesFile, JSON.stringify({ version: 1, roles: {
    a: { role: 'template', baseline: '0000000000000000000000000000000000000000', at: '2026-01-01T00:00:00.000Z' },
    gone: { role: 'data', baseline: null, at: '2026-01-01T00:00:00.000Z' },
  } }, null, 1), 'utf8');
  const old = new Date('2026-01-02T03:04:05Z');
  fs.utimesSync(rolesFile, old, old);
  const before = snapshot(dir);
  await H.bootWithSaveDir(page, REL + '/roles');

  await S.openFolder(page);
  await expect(page.locator('#folder-panel .folder-item[data-file-name="a"]').first()).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: testInfo.outputPath('folder-list.png') });
  await openListAndCheck(page);
  await openA(page);
  await S.closeFolderList(page);
  await openListAndCheck(page);
  await S.closeFolderList(page);

  await page.waitForTimeout(1500);
  const after = snapshot(dir);
  expect(Object.keys(after).sort(), '保存先以下に増えた・消えたファイルは無い').toEqual(Object.keys(before).sort());
  for (const k of Object.keys(before)) expect(after[k], k + ' は変わらない').toEqual(before[k]);
  expect(after['_roles.json'].mtimeMs, '_roles.json の mtime は不変').toBe(before['_roles.json'].mtimeMs);
});

// ---- TICKET-owner-20261122-2322-2: 置換の組は保存先に書かない ----

async function mouseClick(page, locator) {
  await expect(locator).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const SEQ1 = () => H.fixture('seq-1.puml').replace(/\r\n/g, '\n');
// 名前を語として持つ行だけが替わる (SpiDrvMon は別の名前なので替わらない)。
const SEQ1_RENAMED = () => SEQ1().replace(/\bSpiDrv\b/g, 'SpiCore');

// FILES の直下の a を実マウスで開き、2 階層下のフォルダが FILES に出るのを待つ。
async function openAFromFiles(page) {
  await mouseClick(page, page.locator('#files-parts .files-part-file[data-file-name="a"]'));
  await expect(page.locator('#editor')).toHaveValue(SEQ1(), { timeout: 20000 });
  await H.waitDrawn(page, DOCS[0].words);
  await expect(page.locator('#files-subtree .files-sub-dir[data-sub-rel="sub"]')).toHaveCount(1, { timeout: 10000 });
}

async function openRename(page) {
  await mouseClick(page, page.locator('#editor'));
  await page.keyboard.press('Control+h');
  await expect(page.locator('#rename-panel')).toHaveClass(/open/);
}

// Ctrl+H で SpiDrv → SpiCore を 1 回当てる (欄は実マウスで押してから打つ)。
async function renameOnce(page) {
  await openRename(page);
  await mouseClick(page, page.locator('#rename-from'));
  await page.keyboard.press('Control+a');
  await page.keyboard.type('SpiDrv');
  await mouseClick(page, page.locator('#rename-to'));
  await page.keyboard.press('Control+a');
  await page.keyboard.type('SpiCore');
  await expect(page.locator('#btn-rename-apply')).toBeEnabled();
  await mouseClick(page, page.locator('#btn-rename-apply'));
  await expect.poll(() => H.getEditorText(page)).toBe(SEQ1_RENAMED());
  await H.waitDrawn(page, ['SpiCore']);
  await H.expectRendered(page);
  await mouseClick(page, page.locator('#btn-rename-cancel'));
  await expect(page.locator('#rename-panel')).not.toHaveClass(/open/);
}

function expectOnlyAChanged(before, after, dir) {
  expect(Object.keys(after).sort(), '保存先以下に増えた・消えたファイルは無い').toEqual(Object.keys(before).sort());
  for (const k of Object.keys(before)) {
    if (k === 'a.puml') continue;
    expect(after[k], k + ' は変わらない').toEqual(before[k]);
  }
  expect(after['a.puml'].sha1, '置換した a.puml は替わる').not.toBe(before['a.puml'].sha1);
  expect(fs.readFileSync(path.join(dir, 'a.puml'), 'utf8').replace(/\r\n/g, '\n')).toBe(SEQ1_RENAMED());
}

test('2322-2 Ctrl+H で置換しても保存先に置換の組のファイルは増えず、変わるのは置換した .puml だけ。開き直すと組が出る', async ({ page }, testInfo) => {
  test.setTimeout(120 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const sub = 'renames-' + process.pid + '-' + Date.now();
  const dir = path.join(ABS, sub);
  place(dir);
  const before = snapshot(dir);
  await H.bootWithSaveDir(page, REL + '/' + sub);

  await openAFromFiles(page);
  await renameOnce(page);
  await page.waitForTimeout(1500);   // 自動保存の待ち (200ms) と組の記録の往復を越えて見る
  const after = snapshot(dir);
  expectOnlyAChanged(before, after, dir);
  expect(fs.existsSync(path.join(dir, '_renames')), '保存先に _renames を作らない').toBe(false);
  await expect(page.locator('#files-subtree .files-sub-dir[data-sub-rel="_renames"]')).toHaveCount(0);

  // アプリを開き直して Ctrl+H。さっきの組が過去の置換の組に出る。
  await S.reopenApp(page);
  await openRename(page);
  await expect(page.locator('#rename-redo button.rr-row[data-from="SpiDrv"][data-to="SpiCore"]')).toHaveCount(1, { timeout: 10000 });
  await page.screenshot({ path: testInfo.outputPath('rename-redo-after-reopen.png') });
  expect(Object.keys(snapshot(dir)).sort(), '開き直しても保存先のファイルは増えない').toEqual(Object.keys(before).sort());
  expect(errors, errors.join('\n')).toEqual([]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('2322-2 前の版が保存先に置いた _renames/pairs.json は組として出て、置換しても mtime と中身が変わらない。FILES に _renames が出ない', async ({ page }, testInfo) => {
  test.setTimeout(120 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  // 設定の置き場は試験の間残るので、毎回まっさらな保存先 (前の版の控えだけを持つ) にする。
  const sub = 'legacy-renames-' + process.pid + '-' + Date.now();
  const dir = path.join(ABS, sub);
  place(dir);
  const legacy = path.join(dir, '_renames', 'pairs.json');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(legacy, JSON.stringify({ pairs: [
    { from: 'CanDrv', to: 'Can_Driver', at: '2026-11-01T09:00:00Z', hits: 2, applied_at: '2026-11-01T09:00:00Z' },
  ] }, null, 1), 'utf8');
  const old = new Date('2026-01-02T03:04:05Z');
  fs.utimesSync(legacy, old, old);
  const before = snapshot(dir);
  await H.bootWithSaveDir(page, REL + '/' + sub);

  await openAFromFiles(page);
  await expect(page.locator('#files-subtree .files-sub-dir[data-sub-rel="_renames"]'), 'FILES に _renames の行は出ない').toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('files-no-renames.png') });
  await openRename(page);
  await expect(page.locator('#rename-redo button.rr-row[data-from="CanDrv"][data-to="Can_Driver"]'), '前の組が出る').toHaveCount(1, { timeout: 10000 });
  await mouseClick(page, page.locator('#btn-rename-cancel'));
  await renameOnce(page);
  await page.waitForTimeout(1500);
  const after = snapshot(dir);
  expectOnlyAChanged(before, after, dir);
  expect(after['_renames/pairs.json'].mtimeMs, 'pairs.json の mtime は不変').toBe(before['_renames/pairs.json'].mtimeMs);

  // 開き直すと、前の組と今の組の両方が出る (前の組を引き継いで、設定の置き場に持つ)。
  await S.reopenApp(page);
  await openRename(page);
  await expect(page.locator('#rename-redo button.rr-row[data-from="SpiDrv"][data-to="SpiCore"]')).toHaveCount(1, { timeout: 10000 });
  await expect(page.locator('#rename-redo button.rr-row[data-from="CanDrv"][data-to="Can_Driver"]')).toHaveCount(1);
  const after2 = snapshot(dir);
  expect(after2['_renames/pairs.json'], '開き直しても pairs.json は不変').toEqual(before['_renames/pairs.json']);
  expect(errors, errors.join('\n')).toEqual([]);
  fs.rmSync(dir, { recursive: true, force: true });
});
