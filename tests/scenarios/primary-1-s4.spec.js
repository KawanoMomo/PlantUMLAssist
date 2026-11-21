// @ts-check
// primary 台本 場面 4「書き出し」手順 1:
//   書き出しに使う 3 枚 (シーケンス・クラス・状態遷移の自作の図) の写しを書き出し用の保存先に作る
//   (作業は写しに作り、元は汚さない)。製品をその保存先に向けて起こし、保存先の一覧に 3 枚が並ぶかを見る。
//   台本では persona-data の export-s4 に rev-seq・rev-class・hand-state を置くが、scenario は persona-data を
//   読まず fixture の hand-seq・hand-class・hand-state (と、それらが `!include` する common.puml) を使う。
// 期待 (principles.md「押した対象だけが変わる」「描ける」「手書きや他の道具で作った .puml は壊さず開ける」):
//   - 3 枚はシーケンス・クラス・状態遷移の 3 図種 (書き出しを図種ごとに 1 枚ずつ確かめられる)
//   - 写しは元とバイト一致し、製品を起こして保存先の一覧を開いて閉じても 1 バイトも変わらない
//   - 保存先の一覧に 3 枚が並ぶ (書き出す図を開く入口がある)
//   - 書き出す前の保存先には .puml しか無い (起こしただけ・一覧を見ただけで画像も他のファイルも増えない)
//   - 起こした直後の画面はエラー無しで描けている
//   - 手数は保存先の一覧を開いて閉じる 3 (開く 2 + 閉じる 1)
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

// 書き出す 3 枚と、その図種を見分ける行。
const DOCS = [
  ['hand-seq', /^participant /m],
  ['hand-class', /^class /m],
  ['hand-state', /^\[\*\] --> /m],
];
const FILES = ['common'].concat(DOCS.map((d) => d[0]));

test('primary 手順1 (場面4) 書き出す 3 図種の写しを保存先に作り、一覧に並び、起こしても見ても変わらない', async ({ page }, testInfo) => {
  test.setTimeout(60 * 1000);
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const orig = {};
  for (const n of FILES) {
    orig[n] = fs.readFileSync(path.join(H.FIXTURES, n + '.puml'));
    fs.copyFileSync(path.join(H.FIXTURES, n + '.puml'), path.join(dir, n + '.puml'));
  }
  // 写しは元とバイト一致 (元は汚さない)。3 枚は図種が別々で、手書きの印 (!include・skinparam) が残る。
  for (const n of FILES) expect(Buffer.compare(fs.readFileSync(path.join(dir, n + '.puml')), orig[n]), n).toBe(0);
  for (const [n, kind] of DOCS) {
    const s = orig[n].toString('utf8');
    expect(s, n + ' の図種').toMatch(kind);
    expect(s, n + ' の !include').toMatch(/^!include common\.puml$/m);
    expect(s, n + ' の skinparam').toMatch(/^skinparam /m);
  }

  await S.bootWithSaveDir(page, S.dirFor(__filename));
  await H.expectRendered(page);

  let ops = 0;
  await S.openFolder(page);
  ops += 2;
  for (const [n] of DOCS) {
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
  const names = fs.readdirSync(dir).sort();
  expect(names, '保存先にほかのファイルが増えない').toEqual(FILES.map((n) => n + '.puml').sort());
  expect(names.filter((f) => /\.(svg|png)$/i.test(f)), '書き出す前の保存先に画像は無い').toEqual([]);
  H.annotate(testInfo, 'diffLines', 0);
  await H.expectRendered(page);
});
