// @ts-check
// TICKET-owner-20261115-2140-prune: ツール ▾「探す」の図をまたぐ調べ物 (▤ 影響を見る・症状検索・◉ 混入点・
// 呼び出しグラフ・依存グラフ / 参照関係・この図の継承元) と部品の名前帳を外した後も、
// (1) 外した道具の控え (localStorage の継承元・保存先の `_tickets/`) が残った保存先と設定で、
//     エラー無しで開けて描け、控えのファイルは消さない・書かない。
// (2) ツール ▾ に「探す」の分類が無く、残った道具をどれ押してもページエラー 0。
// (3) Ctrl+K で外した道具の名前を打っても行が出ない。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const GONE = ['影響を見る', '症状', '混入点', '呼び出しグラフ', '名前帳', '継承元', '依存グラフ', '参照関係'];

const SEQ = [
  '@startuml',
  'participant SpiDrv',
  'participant Reg',
  'SpiDrv -> Reg : write(CR1)',
  '@enduml',
  '',
].join('\n');

test('owner 2140 外した調べ物の控えが残った保存先でも、開いて描け、控えは書き換えない', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, '_tickets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'spi_seq.puml'), SEQ, 'utf8');
  const ticket = path.join(dir, '_tickets', 'T-1.json');
  const ticketText = JSON.stringify({ id: 'T-1', title: 'SpiDrv の改名', docs: ['spi_seq'] });
  fs.writeFileSync(ticket, ticketText, 'utf8');

  // 外した「この図の継承元」が localStorage に残した控え。
  await page.addInitScript(() => {
    try {
      localStorage.setItem('plantuml-lineage', JSON.stringify({ spi_seq: { parent: 'old_seq', dir: './x' } }));
    } catch (e) { /* 控えが書けない環境でも開けることは別に確かめる */ }
  });
  await H.bootWithSaveDir(page, S.dirFor(__filename));
  await S.openFolder(page);
  await page.locator('#folder-panel .folder-item[data-file-name="spi_seq"]').first().dblclick();
  await expect(page.locator('#editor')).toHaveValue(SEQ, { timeout: 20000 });
  await H.waitDrawn(page, ['SpiDrv', 'Reg']);
  await S.closeFolderList(page);
  await H.expectRendered(page);

  // 控えのファイルは残り、中身も変わらない。
  expect(fs.readFileSync(ticket, 'utf8')).toBe(ticketText);
  H.annotate(testInfo, 'diffLines', H.diffLines(SEQ, await H.getEditorText(page)));
  expect(errors, errors.join('\n')).toEqual([]);
});

test('owner 2140 ツール ▾ に「探す」は無く、残った道具をどれ押してもページエラー 0', async ({ page }, testInfo) => {
  test.setTimeout(120 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  await H.bootWith(page, SEQ);
  await H.waitDrawn(page, ['SpiDrv', 'Reg']);

  await H.openToolMenu(page);
  // TICKET-roadmap-20261115-2114-2: パネルは 1 段の一覧 (分類の列は無い)。一覧の文字で「探す」が無いことを見る。
  await expect(page.locator('#tool-menu .tool-menu-list .tool-menu-item').first()).toBeVisible();
  const menuText = await page.locator('#tool-menu').allTextContents();
  expect(menuText.join(' ')).not.toContain('探す');
  await page.screenshot({ path: testInfo.outputPath('tool-menu.png') });
  const targets = await page.evaluate(() => Array.prototype.slice
    .call(document.querySelectorAll('.tool-menu-item[data-target]'))
    .map((el) => el.getAttribute('data-target')));
  // 分類の中身は開いた分類だけ DOM にあることがあるので、MA.toolMenu の全項目でも数える。
  const all = await page.evaluate(() => {
    const TM = window.MA && window.MA.toolMenu;
    if (!TM || !TM.panelGroups) return [];
    const out = [];
    TM.panelGroups().forEach((g) => (g.items || []).forEach((it) => out.push(it.id)));
    return out;
  });
  const ids = Array.from(new Set(targets.concat(all))).filter(Boolean);
  // 「図をつくる」(⧉ 新しい図を起こす) は TICKET-owner-20261116-0321-prune で外した。残りは 書き換える の 3 つ。
  expect(ids.length).toBeGreaterThan(2);
  await page.keyboard.press('Escape');

  for (const id of ids) {
    await page.evaluate((t) => { const el = document.getElementById(t); if (el) el.click(); }, id);
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  // 押した道具は図の本文を変えない。
  expect(await H.getEditorText(page)).toBe(SEQ);
  expect(errors, ids.join(',') + '\n' + errors.join('\n')).toEqual([]);
});

test('owner 2140 Ctrl+K で外した道具の名前を打っても行が出ない', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  await H.bootWith(page, SEQ);
  await H.waitDrawn(page, ['SpiDrv', 'Reg']);
  await page.locator('#editor').click();
  await page.keyboard.press('Control+k');
  await page.waitForSelector('#cp-input');
  for (const q of GONE) {
    await page.locator('#cp-input').fill(q);
    await page.waitForTimeout(200);
    const rows = await page.locator('.cp-item').allTextContents();
    for (const r of rows) expect(r, q + ' で出た行: ' + r).not.toContain(q);
  }
  await page.keyboard.press('Escape');
  expect(errors, errors.join('\n')).toEqual([]);
});
