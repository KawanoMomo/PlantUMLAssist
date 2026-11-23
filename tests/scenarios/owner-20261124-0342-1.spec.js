// @ts-check
// TICKET-owner-20261124-0342-1 (owner の批評。primary 場面 4 手順 4「直してもう一度出す」の順):
//   保存先から開いた図のラベルを右パネルで直し、Export ▾ で SVG・PNG を書き出してから、何も直さずに Ctrl+S する。
//   Export ▾ の「書き出し先:」の行は古いと言わない (書き出しは今の本文から作ったもの)。
//   続けてもう 1 字直して Ctrl+S すると「SVG · PNG は保存後に直した本文より古い」と言う。
// 期待 (principles.md「押した対象だけが変わる」「描ける」「画面の語は指す場所を偽らない」):
//   - 直さずに保存しても .puml のバイトは書き出した時のまま (保存済みにはなる)
//   - 保存先に増えるのは押した書き出しの 2 枚だけ (印・控えのファイルを増やさない)
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const NAME = 'rev-seq';
const TEXT = '@startuml\nparticipant Drv\nparticipant Bus\nDrv -> Bus : ok\nBus --> Drv : done\n@enduml\n';
const LINE_NO = 4;   // Drv -> Bus : ok

async function clickHit(page, locator, what) {
  await expect(locator).toBeAttached({ timeout: 15000 });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('overlay box not found: ' + what);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

// 右パネルで line 行のメッセージの文言を text に書き換える (図のメッセージを押す → 文言の欄)。
async function editLabel(page, text) {
  const hit = page.locator('#overlay-layer rect[data-type="message"][data-line="' + LINE_NO + '"]').first();
  await clickHit(page, hit, 'message line ' + LINE_NO);
  const ta = page.locator('.rle-textarea:visible').first();
  await ta.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(text);
  await page.keyboard.press('Tab');
  await H.waitDrawn(page, [text]);
}

async function saveWithCtrlS(page, file, text) {
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  await expect(page.locator('#status-save-result')).toContainText('に保存しました', { timeout: 10000 });
  await expect.poll(() => fs.readFileSync(file, 'utf8'), { timeout: 10000 }).toContain(text);
  await page.waitForTimeout(800);   // 自動保存の書き込みが残っていれば、ここまでに済む
}

// Export ▾ を開き、「書き出し先:」の行の古さの問い合わせ (GET /export-file) の答えが届いてからの文言を返す。
async function staleLine(page) {
  const resP = page.waitForResponse((r) => r.url().includes('/export-file'), { timeout: 10000 });
  await page.locator('#btn-export').click();
  await expect(page.locator('#export-dest')).toBeVisible();
  await resP;
  await page.waitForTimeout(200);
  return page.locator('#export-dest-stale');
}

test('owner 0342-1 保存先の図を直して SVG・PNG を書き出し、直さずに Ctrl+S しても古いと言わない。もう 1 字直して保存すると古いと言う', async ({ page }, testInfo) => {
  test.setTimeout(120 * 1000);
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, NAME + '.puml');
  fs.writeFileSync(file, TEXT);

  await H.bootWithSaveDir(page, S.dirFor(__filename));
  await S.openFolder(page);
  await page.locator('#folder-panel .folder-item[data-file-name="' + NAME + '"]').first().dblclick();
  await expect(page.locator('#editor')).toHaveValue(TEXT, { timeout: 20000 });
  await H.waitDrawn(page, ['Drv', 'Bus', 'ok', 'done']);
  await S.closeFolderList(page);

  // 直す (右パネル) → 自動保存で書かれる。
  const before = await H.getEditorText(page);
  await editLabel(page, 'ok2');
  const edited = await H.getEditorText(page);
  expect(H.diffLines(before, edited), '直した 1 行だけ').toBe(2);
  await expect.poll(() => fs.readFileSync(file, 'utf8'), { timeout: 10000 }).toContain('Drv -> Bus : ok2');
  await page.waitForTimeout(800);

  // SVG・PNG を書き出す (今の本文から)。
  const svg = await S.exportToFolder(page, 'exp-svg');
  expect(path.resolve(svg.path)).toBe(path.resolve(path.join(dir, NAME + '.svg')));
  await page.keyboard.press('Escape');
  const png = await S.exportToFolder(page, 'exp-png');
  expect(path.resolve(png.path)).toBe(path.resolve(path.join(dir, NAME + '.png')));
  await page.keyboard.press('Escape');
  expect(fs.readFileSync(svg.path, 'utf8')).toContain('ok2');
  const exported = fs.readFileSync(file);

  // 何も直さずに Ctrl+S。保存済みになり、.puml のバイトは書き出した時のまま。Export ▾ は古いと言わない。
  await saveWithCtrlS(page, file, 'Drv -> Bus : ok2');
  expect(Buffer.compare(fs.readFileSync(file), exported), '直さない保存で .puml のバイトは変わらない').toBe(0);
  const stale = await staleLine(page);
  await expect(stale).toHaveText('');
  await page.screenshot({ path: testInfo.outputPath('export-after-unchanged-save.png') });
  await page.keyboard.press('Escape');

  // もう 1 字直して Ctrl+S すると、SVG · PNG は古いと言う。
  await editLabel(page, 'ok23');
  await saveWithCtrlS(page, file, 'Drv -> Bus : ok23');
  const stale2 = await staleLine(page);
  await expect(stale2).toHaveText('SVG · PNG は保存後に直した本文より古い', { timeout: 5000 });
  await page.screenshot({ path: testInfo.outputPath('export-after-edited-save.png') });
  await page.keyboard.press('Escape');

  // 保存先に増えたのは押した書き出しの 2 枚だけ。
  expect(fs.readdirSync(dir).filter((f) => !f.startsWith('.') && !f.startsWith('_')).sort())
    .toEqual([NAME + '.png', NAME + '.puml', NAME + '.svg']);
});
