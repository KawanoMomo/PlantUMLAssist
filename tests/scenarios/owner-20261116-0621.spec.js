// @ts-check
// TICKET-owner-20261116-0621-prune: ⇄ 一括置換に残った付け足し (改名の時系列と「控える」・戻り値 / 引数を全図へ当てる欄・
// Alias 欄の正式な綴りのチップ・保存先欄の「渡された文面を貼る」受け口) を外した後も、
// (1) Ctrl+H のパネルは 置換前 / 置換後 / 当てる図 / 過去の置換の組 だけで、当てた組は開き直しても過去の組に残り、
//     行を押すと両欄が埋まる。置換結果のバイトは今と同じ (名前だけが替わる)。
// (2) 外した道具の控え (localStorage の改名の記録・保存フォルダの親の名前のファイル) が残った設定と保存先でも、
//     エラー無しで開けて描け、控えのファイルは消さない・書かない。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');
const { gotoApp } = require('../e2e/helpers');

const GONE_WORDS = ['改名履歴', '控える', '正式表記', '登録簿', 'xref.md'];

const SEQ = [
  '@startuml',
  'participant SpiDrv',
  'participant Reg',
  'SpiDrv -> Reg : write(CR1)',
  'Reg --> SpiDrv : ok',
  '@enduml',
  '',
].join('\n');

const OLD_HISTORY = JSON.stringify({ './autosave': [
  { from: 'CanDrv', to: 'Can_Driver', at: '2026-11-01T09:00:00.000Z', docs: [{ name: 'can_seq', count: 2 }], total: 2 },
] });

async function openRename(page) {
  await page.locator('#editor').click();
  await page.keyboard.press('Control+h');
  await expect(page.locator('#rename-panel')).toHaveClass(/open/);
}

test('owner 0621 Ctrl+H のパネルは 置換前 / 置換後 / 当てる図 / 過去の置換の組 だけで、当てた組を押すと両欄が埋まる', async ({ page }, testInfo) => {
  test.setTimeout(120 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  // 開き直しても記憶が残るよう、逃がし鍵が立っている間は消さない。外した改名の記録が残った設定で開く。
  await page.addInitScript((old) => {
    try {
      if (window.localStorage.getItem('pua.e2e.keep')) return;
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-rename-history', old);
    } catch (e) {}
  }, OLD_HISTORY);
  await gotoApp(page);
  await H.setText(page, SEQ);
  await H.waitDrawn(page, ['SpiDrv', 'Reg']);

  await openRename(page);
  await page.screenshot({ path: testInfo.outputPath('rename-panel-open.png') });
  const panelText = await page.locator('#rename-panel').innerText();
  for (const w of GONE_WORDS) expect(panelText, w).not.toContain(w);
  await expect(page.locator('#rename-history')).toHaveCount(0);
  await expect(page.locator('#rename-signature')).toHaveCount(0);
  await expect(page.locator('#btn-rename-history-copy')).toHaveCount(0);

  // 置換する。結果は名前だけが替わった本文 (前と同じバイト)。
  await page.locator('#rename-from').fill('SpiDrv');
  await page.locator('#rename-to').fill('Spi_Driver');
  await expect(page.locator('#btn-rename-apply')).toBeEnabled();
  await page.locator('#btn-rename-apply').click();
  const want = SEQ.replace(/\bSpiDrv\b/g, 'Spi_Driver');
  await expect.poll(() => H.getEditorText(page)).toBe(want);
  H.annotate(testInfo, 'diffLines', H.diffLines(SEQ, want));
  await H.waitDrawn(page, ['Spi_Driver', 'Reg']);
  await H.expectRendered(page);
  await page.locator('#btn-rename-cancel').click();
  await expect(page.locator('#rename-panel')).not.toHaveClass(/open/);

  // アプリを開き直してもう一度 Ctrl+H。当てた組は過去の置換の組に出る。
  await S.reopenApp(page);
  await H.setText(page, SEQ);
  await H.waitDrawn(page, ['SpiDrv', 'Reg']);
  await openRename(page);
  const row = page.locator('#rename-redo button.rr-row[data-from="SpiDrv"][data-to="Spi_Driver"]');
  await expect(row).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('rename-panel-redo.png') });
  // 欄を空けてから行を押すと、両欄が埋まる。
  await page.locator('#rename-from').fill('');
  await page.locator('#rename-to').fill('');
  await row.click();
  await expect(page.locator('#rename-from')).toHaveValue('SpiDrv');
  await expect(page.locator('#rename-to')).toHaveValue('Spi_Driver');
  const panelText2 = await page.locator('#rename-panel').innerText();
  for (const w of GONE_WORDS) expect(panelText2, w).not.toContain(w);
  // 押しただけでは本文は変わらない。
  expect(await H.getEditorText(page)).toBe(SEQ);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('owner 0621 外した道具の控えが残った保存先でも、開いて描け、控えのファイルは書き換えない', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'spi_seq.puml'), SEQ, 'utf8');
  // 保存フォルダの親に残った名前のファイル (外した Alias 欄のチップが読んでいたもの)。
  const names = path.join(path.dirname(dir), '_names.json');
  const namesText = JSON.stringify({ entries: [{ canonical: 'SpiDrv', variants: ['Spi_Drv'] }] });
  fs.writeFileSync(names, namesText, 'utf8');
  await page.addInitScript((old) => {
    try { window.localStorage.setItem('plantuml-rename-history', old); } catch (e) {}
  }, OLD_HISTORY);
  await S.bootWithSaveDir(page, S.dirFor(__filename));
  // bootWithSaveDir は localStorage を消してから設定を書くので、控えはその後に足す。
  await page.evaluate((old) => { localStorage.setItem('plantuml-rename-history', old); }, OLD_HISTORY);
  await S.openFolder(page);
  await page.locator('#folder-panel .folder-item[data-file-name="spi_seq"]').first().dblclick();
  await expect(page.locator('#editor')).toHaveValue(SEQ, { timeout: 20000 });
  await H.waitDrawn(page, ['SpiDrv', 'Reg']);
  await S.closeFolderList(page);
  await H.expectRendered(page);

  // ⇄ パネルにも画面のどこにも、外した道具の語は出ない。
  await openRename(page);
  const panelText = await page.locator('#rename-panel').innerText();
  for (const w of GONE_WORDS) expect(panelText, w).not.toContain(w);
  await page.locator('#btn-rename-cancel').click();
  const bodyText = await page.locator('body').innerText();
  for (const w of ['正式表記', '登録簿']) expect(bodyText, w).not.toContain(w);

  expect(fs.readFileSync(names, 'utf8')).toBe(namesText);
  expect(fs.readFileSync(path.join(dir, 'spi_seq.puml'), 'utf8')).toBe(SEQ);
  H.annotate(testInfo, 'diffLines', H.diffLines(SEQ, await H.getEditorText(page)));
  expect(errors, errors.join('\n')).toEqual([]);
});
