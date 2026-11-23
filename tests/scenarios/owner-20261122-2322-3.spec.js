// @ts-check
// TICKET-owner-20261122-2322-3: 保存先の直下の seq-1.puml と spi/seq-1.puml を FILES から 1 枚ずつ開くと、
// タブ列も FILES の「開いている図」も「seq-1.puml」が 2 つで、どちらに打っているかが画面に出なかった。
// 期待 (principles「選択は見失わない」「画面の語は指す場所を偽らない」「押した対象だけが変わる」):
//   - 既定の画面・実マウス。同じ名前の図が 2 枚開いている間だけ、2 つのタブと「開いている図」の 2 行の見える文字が
//     互いに違い、どちらにもフォルダの道 (spi/・(直下)) が読める
//   - 名前が重ならない図のタブには何も添えない
//   - 直下のタブを押して 1 行足して Ctrl+S すると、直下の seq-1.puml だけが 1 行変わり、spi/seq-1.puml はバイト一致
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const hands = { clicks: 0, keys: 0 };

async function mouseAt(page, locator, dbl) {
  hands.clicks += dbl ? 2 : 1;
  await expect(locator).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  if (dbl) await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const TOP = '@startuml\nApp -> TopDrv : top\n@enduml\n';
const SUB = '@startuml\nApp -> SpiDrv : sub\n@enduml\n';
const OTHER = '@startuml\nA -> B : other\n@enduml\n';

test('owner 2322-3 直下と spi/ の同じ名前の図を開くと、タブと「開いている図」の行にフォルダの道が出て、押したタブの図だけが変わる', async ({ page }, testInfo) => {
  test.setTimeout(120 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const sub = 'proj-' + process.pid + '-' + Date.now();
  const dir = path.join(S.absDirFor(__filename), sub);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'spi'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'seq-1.puml'), TOP);
  fs.writeFileSync(path.join(dir, 'spi', 'seq-1.puml'), SUB);
  fs.writeFileSync(path.join(dir, 'other.puml'), OTHER);
  const subBytes = fs.readFileSync(path.join(dir, 'spi', 'seq-1.puml'));

  await H.bootWithSaveDir(page, S.dirFor(__filename) + '/' + sub);

  // 名前の重ならない図を開く: 何も添えない。
  await mouseAt(page, page.locator('#files-parts .files-part-file[data-file-name="other"]'), true);
  await H.waitDrawn(page, ['other']);
  await expect(page.locator('#tab-bar .tab[data-doc-name="other"] .tab-dir')).toHaveCount(0);

  // 直下の seq-1 と spi/seq-1 を FILES から開く (ダブルクリックでタブに固定)。
  await mouseAt(page, page.locator('#files-parts .files-part-file[data-file-name="seq-1"]'), true);
  await H.waitDrawn(page, ['TopDrv']);
  await expect(page.locator('#tab-bar .tab[data-doc-name="seq-1"] .tab-dir')).toHaveCount(0);
  const spi = page.locator('#files-subtree .files-sub-dir[data-sub-rel="spi"]');
  await expect(spi).toHaveCount(1, { timeout: 10000 });
  if ((await spi.getAttribute('aria-expanded')) !== 'true') await mouseAt(page, spi);
  await mouseAt(page, page.locator('#files-subtree .files-sub-file[data-sub-rel="spi"][data-file-name="seq-1"]'), true);
  await H.waitDrawn(page, ['SpiDrv']);

  // 2 つのタブの見える文字が違い、どちらにもフォルダの道が読める。
  const tabs = page.locator('#tab-bar .tab[data-doc-name="seq-1"]');
  await expect(tabs).toHaveCount(2);
  const topTab = page.locator('#tab-bar .tab[data-doc-name="seq-1"]:not([data-sub-rel])');
  const subTab = page.locator('#tab-bar .tab[data-doc-name="seq-1"][data-sub-rel="spi"]');
  await expect(topTab.locator('.tab-dir')).toHaveText('(直下)');
  await expect(subTab.locator('.tab-dir')).toHaveText('spi/');
  const tabTexts = [await topTab.innerText(), await subTab.innerText()];
  expect(tabTexts[0], 'タブの見える文字は互いに違う').not.toBe(tabTexts[1]);
  await expect(page.locator('#tab-bar .tab[data-doc-name="other"] .tab-dir'), '名前の重ならないタブは今のまま').toHaveCount(0);

  // 「開いている図」の 2 行も同じ語で見分けられる。
  const rows = page.locator('#files-panel .files-row[data-file-name="seq-1"]');
  await expect(rows).toHaveCount(2);
  const rowTexts = (await rows.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  expect(rowTexts.some((t) => t.indexOf('spi/') >= 0), rowTexts.join(' | ')).toBe(true);
  expect(rowTexts.some((t) => t.indexOf('(直下)') >= 0), rowTexts.join(' | ')).toBe(true);
  expect(rowTexts[0]).not.toBe(rowTexts[1]);
  await expect(page.locator('#files-panel .files-row[data-file-name="other"] .files-row-path')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('same-name-tabs.png') });

  // 直下のタブを押して、@enduml の前に 1 行足して Ctrl+S。
  await mouseAt(page, topTab.locator('.tab-label'));
  await expect(page.locator('#editor')).toHaveValue(TOP, { timeout: 10000 });
  await mouseAt(page, page.locator('#editor'));
  await page.keyboard.press('Control+End'); hands.keys++;
  await page.keyboard.press('ArrowUp'); hands.keys++;
  await page.keyboard.press('Home'); hands.keys++;
  const line = 'App -> TopDrv : extra\n';
  await page.keyboard.type(line); hands.keys += line.length;
  await page.keyboard.press('Control+s'); hands.keys++;
  const want = '@startuml\nApp -> TopDrv : top\nApp -> TopDrv : extra\n@enduml\n';
  await expect.poll(() => fs.readFileSync(path.join(dir, 'seq-1.puml'), 'utf8'), { timeout: 10000 }).toBe(want);
  await H.waitDrawn(page, ['extra']);
  await page.waitForTimeout(800);
  expect(Buffer.compare(fs.readFileSync(path.join(dir, 'spi', 'seq-1.puml')), subBytes), 'spi/seq-1.puml はバイト一致').toBe(0);
  expect(fs.readFileSync(path.join(dir, 'other.puml'), 'utf8')).toBe(OTHER);
  H.annotate(testInfo, 'diffLines', H.diffLines(TOP, want));
  testInfo.annotations.push({ type: 'hands', description: JSON.stringify(hands) });
  fs.writeFileSync(testInfo.outputPath('hands.json'), JSON.stringify(hands));
  expect(errors, errors.join('\n')).toEqual([]);
  fs.rmSync(dir, { recursive: true, force: true });
});
