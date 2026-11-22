// @ts-check
// primary 台本 場面 3「レビュー指摘の反映」手順 1:
//   同名ラベルが混ざるレビュー用の rev-seq・rev-class と common.puml の写しを試験用の保存先に置く
//   (作業は写しに作り、元は汚さない)。製品を保存先に向けて起こす。
// 期待 (principles.md「押した対象だけが変わる」「描ける」「手書きや他の道具で作った .puml は壊さず開ける」):
//   - 写しは元とバイト一致 (rev-class は CRLF のまま)。どちらの図にも同名のラベルが 2 か所以上ある
//     (seq はメッセージの文言 `Open()`・`Read`、class は属性 `- speed : int`)
//   - 置いた 3 枚は、製品を起こして保存先の一覧を開いて閉じても 1 バイトも変わらず、保存先にほかのファイルが増えない
//   - 保存先の一覧に rev-seq・rev-class が並ぶ (開く入口がある)
//   - 起こした直後の画面はエラー無しで描けている
//   - 手数は保存先の一覧を開いて閉じる 3 (開く 2 + 閉じる 1)
// 図: tests/scenarios/fixtures/ の rev-seq・rev-class-crlf (primary の自作の小さい図)・common。
//   rev-class-crlf は CRLF のまま入れてある (.gitattributes で -text)。保存先には rev-class.puml の名で置く。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

// 保存先の名前 → fixtures の名前
const SRC = { 'rev-seq': 'rev-seq', 'rev-class': 'rev-class-crlf', common: 'common' };
const DOCS = ['rev-seq', 'rev-class'];
const FILES = Object.keys(SRC);

function count(re, s) { return (String(s).match(re) || []).length; }

test('primary 手順1 (場面3) 同名ラベルの混ざる 2 図と common.puml の写しを保存先に置き、起こしても一覧を見ても変わらない', async ({ page }, testInfo) => {
  test.setTimeout(60 * 1000);
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const orig = {};
  for (const n of FILES) {
    const from = path.join(H.FIXTURES, SRC[n] + '.puml');
    orig[n] = fs.readFileSync(from);
    fs.copyFileSync(from, path.join(dir, n + '.puml'));
  }
  // 写しは元とバイト一致 (元は汚さない)。
  for (const n of FILES) expect(Buffer.compare(fs.readFileSync(path.join(dir, n + '.puml')), orig[n]), n).toBe(0);
  // rev-class は CRLF の図 (取り出し方で LF に化けていない)。
  const cls = orig['rev-class'].toString('utf8');
  expect(/(^|[^\r])\n/.test(cls), 'rev-class は全行 CRLF').toBe(false);
  // 同名ラベルが混ざる (指摘はこの中の 1 か所だけを直す)。
  const seq = orig['rev-seq'].toString('utf8');
  expect(count(/: Open\(\)$/gm, seq), 'rev-seq の Open()').toBeGreaterThanOrEqual(2);
  expect(count(/: Read\(/gm, seq), 'rev-seq の Read').toBeGreaterThanOrEqual(2);
  expect(count(/^\s*- speed : int\r?$/gm, cls), 'rev-class の speed : int').toBeGreaterThanOrEqual(2);
  expect(seq, 'rev-seq のコメント').toMatch(/^\s*' /m);

  await H.bootWithSaveDir(page, S.dirFor(__filename));
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
