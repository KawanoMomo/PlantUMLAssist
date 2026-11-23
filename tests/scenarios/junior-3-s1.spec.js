// @ts-check
// junior 台本 場面 1「状態遷移図を開き、SVG に書き出して設計書に置く」手順 3:
//   開いた回数、操作の数、待ちの秒数を測り、書き出した SVG の本文は <svg を含むかだけ確かめる。
//   手順 1〜2 (Import ▾ →「.puml を開く」→ Export ▾ →「SVGとして保存」) を 1 回ずつ通して数える。
// 期待 (principles.md「押した対象だけが変わる」「描ける」と操作コストの上限):
//   - 開いた回数は 1 回で描ける (開き直さなくてよい)。開いた本文は fixture と同じ
//   - 操作の数は台本の 4 クリック (Import ▾・.puml を開く・Export ▾・SVGとして保存) の 2 倍まで
//   - 開いてから 3 状態が描けるまでの待ちは 3 秒以内 (全体実行の負荷の下の上限)
//   - SVG の本文は <svg を含む。開く・書き出すで本文は 1 行も動かない
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

const NAME = 'junior-s1-state.puml';
const WORDS = ['待機', '初期化中', '完了'];
const SCRIPT_CLICKS = 4;

function norm(s) { return String(s).replace(/\r\n/g, '\n').replace(/\n+$/, ''); }

test('junior 手順3 (場面1) 開いた回数・操作の数・待ちの秒数を測り、SVG が <svg を含むことを確かめる', async ({ page }, testInfo) => {
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  await H.bootWith(page, null);
  const src = H.fixture(NAME);
  let clicks = 0;
  let opens = 0;

  // 開く: Import ▾ →「.puml を開く」。1 回で 3 状態が描けるまでの待ちを測る。
  const t0 = Date.now();
  await page.locator('#btn-import').click(); clicks++;
  await expect(page.locator('#imp-file')).toBeVisible();
  const chooserP = page.waitForEvent('filechooser');
  await page.locator('#imp-file').click(); clicks++;
  const chooser = await chooserP;
  await chooser.setFiles(path.join(H.FIXTURES, NAME)); opens++;
  await H.waitDrawn(page, WORDS);
  const waitMs = Date.now() - t0;
  H.annotate(testInfo, 'renderMs', waitMs);
  await H.expectRendered(page);
  const before = await H.getEditorText(page);
  expect(norm(before)).toBe(norm(src));

  // 書き出す: Export ▾ →「SVGとして保存」。
  const dlP = page.waitForEvent('download');
  await page.locator('#btn-export').click(); clicks++;
  await expect(page.locator('#exp-svg')).toBeVisible();
  await page.locator('#exp-svg').click(); clicks++;
  const dl = await dlP;
  const out = testInfo.outputPath('out.svg');
  await dl.saveAs(out);
  const body = fs.readFileSync(out, 'utf8');

  // SVG の本文は <svg を含むかだけ確かめる。
  expect(body).toContain('<svg');

  // 測った値: 開いた回数・操作の数・待ちの秒数。
  H.annotate(testInfo, 'opens', opens);
  H.annotate(testInfo, 'clicks', clicks);
  expect(opens).toBe(1);
  expect(clicks).toBeLessThanOrEqual(SCRIPT_CLICKS * 2);
  expect(waitMs).toBeLessThanOrEqual(3000);

  // 押した対象だけが変わる: 開く・書き出すで本文は動かない。
  const after = await H.getEditorText(page);
  const d = H.diffLines(before, after);
  H.annotate(testInfo, 'diffLines', d);
  expect(d).toBe(0);
  expect(dialogs).toEqual([]);
  await H.expectRendered(page);
});
