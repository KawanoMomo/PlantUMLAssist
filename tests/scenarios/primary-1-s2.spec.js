// @ts-check
// primary 台本 場面 2「手書きの既存の図を開いて直す」手順 1:
//   手書きの hand-seq・hand-state・hand-class と、それらが `!include` する common.puml の写しを保存先に置く
//   (作業は写しに作り、元は汚さない)。製品を保存先に向けて起こす。
// 期待 (principles.md「押した対象だけが変わる」「描ける」「手書きや他の道具で作った .puml は壊さず開ける」):
//   - 置いた 4 枚は、製品を起こして保存先の一覧を開いて閉じても 1 バイトも変わらず、保存先にほかのファイルが増えない
//     (起こしただけ・一覧を見ただけでは書かない。コメント・字下げ・skinparam・!include の行もそのまま)
//   - 保存先の一覧に hand-seq・hand-state・hand-class が並ぶ (開く入口がある)
//   - 起こした直後の画面はエラー無しで描けている
//   - 手数は保存先の一覧を開いて閉じる 3 (開く 2 + 閉じる 1)
// 図: tests/scenarios/fixtures/ の hand-seq・hand-state・hand-class・common (自作の小さい図)。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const DOCS = ['hand-seq', 'hand-state', 'hand-class'];
const FILES = ['common'].concat(DOCS);

test('primary 手順1 (場面2) 手書きの 3 図と common.puml の写しを保存先に置き、起こしても一覧を見ても変わらない', async ({ page }, testInfo) => {
  test.setTimeout(60 * 1000);
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const orig = {};
  for (const n of FILES) {
    orig[n] = fs.readFileSync(path.join(H.FIXTURES, n + '.puml'));
    fs.copyFileSync(path.join(H.FIXTURES, n + '.puml'), path.join(dir, n + '.puml'));
  }
  // 写しは元とバイト一致 (元は汚さない)。手書きの印が写しにも残る。
  for (const n of FILES) expect(Buffer.compare(fs.readFileSync(path.join(dir, n + '.puml')), orig[n]), n).toBe(0);
  for (const n of DOCS) {
    const s = orig[n].toString('utf8');
    expect(s, n + ' の !include').toMatch(/^!include common\.puml$/m);
    expect(s, n + ' の skinparam').toMatch(/^skinparam /m);
    expect(s, n + ' のコメント').toMatch(/^\s*' /m);
  }

  await S.bootWithSaveDir(page, S.dirFor(__filename));
  await H.expectRendered(page);

  let ops = 0;
  await S.openFolder(page);
  ops += 2;
  for (const n of DOCS) {
    await expect(page.locator('#folder-panel .folder-item[data-file-name="' + n + '"]'), n + ' が保存先の一覧に並ぶ').toHaveCount(1, { timeout: 10000 });
  }
  await S.closeFolderList(page);
  ops += 1;
  H.annotate(testInfo, 'ops', ops);
  expect(ops).toBeLessThanOrEqual(3);

  // 起こしただけ・一覧を見ただけでは保存先に書かない (自動保存の間隔より長く待って確かめる)。
  await page.waitForTimeout(1500);
  for (const n of FILES) {
    const now = fs.readFileSync(path.join(dir, n + '.puml'));
    expect(Buffer.compare(now, orig[n]), n + '.puml は 1 バイトも変わらない').toBe(0);
  }
  expect(fs.readdirSync(dir).sort(), '保存先にほかのファイルが増えない').toEqual(FILES.map((n) => n + '.puml').sort());
  H.annotate(testInfo, 'diffLines', 0);
  await H.expectRendered(page);
});
