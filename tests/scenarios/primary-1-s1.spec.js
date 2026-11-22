// @ts-check
// primary 台本 場面 1「設計変更の反映」手順 1:
//   保存先の seq-1・state-1・class-1・comp-1・act-1・uc-1 (6 図種を 1 枚ずつ) を使う。
// 期待 (principles.md「描ける」「手書きや他の道具で作った .puml は壊さず開ける」「操作コストは計る」):
//   - 保存先の一覧から 6 枚を 1 枚ずつ開くと、どれも図種が本文どおりに選ばれ、エラー無しで描ける
//   - 開いただけでは本文は 1 字も変わらず (字下げ・コメントもそのまま)、保存先のファイルも書き換わらない
//   - FILES の保存先では 6 枚が部品フォルダに割れず直下に並び、「未作成」の札が出ない
//   - 1 枚を開く手数は 4 (一覧を開く 2 + 図を選ぶ 1 + 一覧を閉じる 1)。開いてから描けるまでは上限 (3 秒) 以内
// 図: tests/scenarios/fixtures/ の 6 枚 (手で整えた小さい図。コメントと字下げを持つ)。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const DOCS = [
  { name: 'seq-1', type: 'plantuml-sequence', words: ['SpiDrvMon', 'Spi_Init()'] },
  { name: 'state-1', type: 'plantuml-state', words: ['RunningSlow', 'Spi_Throttle'] },
  { name: 'class-1', type: 'plantuml-class', words: ['Spi_DriverMon', 'Spi_Config'] },
  { name: 'comp-1', type: 'plantuml-component', words: ['SpiDrvMon', 'ISpi'] },
  { name: 'act-1', type: 'plantuml-activity', words: ['Spi_Init', 'Spi_Report'] },
  { name: 'uc-1', type: 'plantuml-usecase', words: ['Send data', 'Watch state'] },
];
const OPS_PER_DOC = 4;
const RENDER_MS_MAX = 3000;

test('primary 手順1 保存先の 6 図種の図を 1 枚ずつ開くと、本文を変えずにどれも描ける', async ({ page }, testInfo) => {
  test.setTimeout(120 * 1000);
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const originals = {};
  for (const d of DOCS) {
    originals[d.name] = H.fixture(d.name + '.puml').replace(/\r\n/g, '\n');
    fs.writeFileSync(path.join(dir, d.name + '.puml'), originals[d.name], 'utf8');
  }

  await H.bootWithSaveDir(page, S.dirFor(__filename));
  let ops = 0;

  // TICKET-owner-20261115-1827-2: FILES の保存先は seq-1 などの先頭の図種の語を部品名に読まない。
  // 6 枚は部品フォルダ (SEQ 1 / 6・STATE 1 / 6 …) に割れず直下に 6 行で並び、「未作成」の札も出ない。
  const tree = page.locator('#files-parts');
  for (const d of DOCS) {
    await expect(tree.locator('.files-loose-file[data-file-name="' + d.name + '"]'), d.name + ' は保存先の直下').toHaveCount(1, { timeout: 10000 });
  }
  await expect(tree.locator('.files-loose-file')).toHaveCount(DOCS.length);
  await expect(tree.locator('.files-part-head')).toHaveCount(0);
  await expect(tree.locator('.files-part-missing')).toHaveCount(0);
  await expect(tree).not.toContainText('未作成');

  for (const d of DOCS) {
    const text = originals[d.name];
    await S.openFolder(page);
    ops += 2;
    const item = page.locator('#folder-panel .folder-item[data-file-name="' + d.name + '"]').first();
    const t0 = Date.now();
    await item.dblclick();
    ops += 1;
    await expect(page.locator('#editor')).toHaveValue(text, { timeout: 20000 });
    await H.waitDrawn(page, d.words);
    const renderMs = Date.now() - t0;
    H.annotate(testInfo, 'renderMs', renderMs);
    await S.closeFolderList(page);
    ops += 1;

    // 図種は本文どおりに選ばれ、エラー無しで描ける。
    await expect(page.locator('#diagram-type'), d.name + ' の図種').toHaveValue(d.type);
    await H.expectRendered(page);
    // 開いただけでは本文は 1 字も変わらない (字下げ・コメントもそのまま)。
    const now = await H.getEditorText(page);
    expect(now, d.name + ' の本文').toBe(text);
    H.annotate(testInfo, 'diffLines', H.diffLines(text, now));
    expect(now).toContain("' 手で整えた");
    expect(renderMs, d.name + ' を開いてから描けるまで').toBeLessThanOrEqual(RENDER_MS_MAX);
  }

  // 6 枚を開いても、保存先のファイルは 1 バイトも書き換わらない (開くことは書くことではない)。
  await page.waitForTimeout(800);
  for (const d of DOCS) {
    expect(fs.readFileSync(path.join(dir, d.name + '.puml'), 'utf8'), d.name + '.puml').toBe(originals[d.name]);
  }
  expect(ops).toBe(OPS_PER_DOC * DOCS.length);
  H.annotate(testInfo, 'ops', ops);
});
