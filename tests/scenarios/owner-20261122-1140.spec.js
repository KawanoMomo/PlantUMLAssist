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
// TICKET-owner-20261122-2322-2 (置換の組を保存先に書かない) は同じ scenario に自分の期待を足す。
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
