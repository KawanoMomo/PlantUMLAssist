// @ts-check
// junior 台本 場面 4「白紙から状態遷移図を 1 枚起こし、SVG に書き出して設計書に置く」手順 1:
//   ＋ で新しい図を作り、左端の ST で state の図にする。状態チップで「待機」「初期化中」「完了」を足し、
//   遷移チップで [*]→待機→初期化中→完了→[*] の 4 本を足す。● 保存で受けた図を out.puml にする。
//   (台本の書き換えで手順 1 が「Import で開いて SVG」から「白紙から起こす」に替わった。Import の経路は junior-1-s2 等が持つ)
// TICKET-junior-20261123-0742 (data-loss): 日本語の名前を描き直しを待たずに続けて足すと、3 つとも `as S1` になり
//   2 つ目以降が前の状態を上書きしていた。ここでは利用者と同じく間を空けずに 3 つ足す。
// 期待 (principles.md「押した対象だけが変わる」「描ける」):
//   - 状態 3 つは別々の別名 (S1・S2・S3) で 3 行。名前はラベルに残る。足しても前に足した状態の行は動かない
//   - 遷移の始点・終点の候補に 3 つの状態が全部出て、4 本が足せる。遷移 1 本の追加は本文 1 行の追加だけ
//   - 描いた図に 3 つの状態名が出る。● 保存で受けた .puml は画面の本文と同じ
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

const STATES = ['待機', '初期化中', '完了'];
const PAIRS = [['[*]', '待機'], ['待機', '初期化中'], ['初期化中', '完了'], ['完了', '[*]']];

test('junior 手順1 (場面4) 白紙の状態遷移図に状態 3 つと遷移 4 本を足し、● 保存で受ける', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  await H.bootWith(page, null);
  let clicks = 0;

  await page.locator('#btn-tab-new').click(); clicks++;
  await page.locator('#rail-st').click(); clicks++;
  await expect.poll(() => page.locator('#diagram-type').inputValue()).toBe('plantuml-state');
  const blank = await H.getEditorText(page);

  // 状態チップ → 名前 → + 追加 を 3 回、描き直しを待たずに続けて押す。
  await page.locator('#st-tail-kind-chip-state').click(); clicks++;
  for (const s of STATES) {
    await page.locator('#st-tail-id').fill(s);
    await page.locator('#st-tail-add').click(); clicks++;
  }
  await H.waitDrawn(page, STATES);
  const withStates = await H.getEditorText(page);
  const decl = withStates.split('\n').filter((l) => /^\s*state\s/.test(l));
  expect(decl).toEqual(['state "待機" as S1', 'state "初期化中" as S2', 'state "完了" as S3']);
  // 押した対象だけが変わる: 白紙からの差分は宣言の 3 行だけ。
  expect(H.diffLines(blank, withStates)).toBe(3);
  expect(H.removedLines(blank, withStates)).toEqual([]);

  // 遷移チップ。始点・終点の候補に 3 つの状態が全部出る。
  await page.locator('#st-tail-kind-chip-transition').click(); clicks++;
  for (const id of ['#st-tail-from', '#st-tail-to']) {
    const labels = await page.locator(id + ' option').allTextContents();
    for (const s of STATES) expect(labels, id + ' に ' + s).toContain(s);
  }
  const alias = { '[*]': '[*]', '待機': 'S1', '初期化中': 'S2', '完了': 'S3' };
  // 状態は名前 (候補の表示) で選ぶ。開始・終了は候補の「[*] (initial/final)」。
  const opt = (x) => (x === '[*]' ? '[*]' : { label: x });
  for (const [f, t] of PAIRS) {
    const r = await H.measure(page, testInfo, async () => {
      await page.locator('#st-tail-from').selectOption(opt(f)); clicks++;
      await page.locator('#st-tail-to').selectOption(opt(t)); clicks++;
      await page.locator('#st-tail-add').click(); clicks++;
    }, null);
    await expect.poll(() => H.getEditorText(page)).not.toBe(r.before);
    const after = await H.getEditorText(page);
    expect(H.diffLines(r.before, after), f + ' → ' + t).toBe(1);
    expect(H.removedLines(r.before, after)).toEqual([]);
    const esc = (x) => x.replace(/[[\]*]/g, '\\$&');
    expect(after).toMatch(new RegExp('^' + esc(alias[f]) + ' --> ' + esc(alias[t]) + '\\s*$', 'm'));
  }
  H.annotate(testInfo, 'clicks', clicks);

  // 描ける: 図にエラーが無く、3 つの状態名が出る。
  await H.waitDrawn(page, STATES);
  // 4 本の遷移が描き直しまで届いた (図の遷移を押せる枠が 4 本ぶんある。1 本に枠は複数)。
  await page.waitForFunction(() => {
    const ids = new Set();
    document.querySelectorAll('#overlay-layer [data-type="transition"]').forEach((e) => ids.add(e.getAttribute('data-id')));
    return ids.size === 4;
  }, null, { timeout: 20000 });
  await H.expectRendered(page);
  await page.screenshot({ path: testInfo.outputPath('junior-1-s4-drawn.png') });

  // ● 保存で受けた図は画面の本文と同じ。
  const text = await H.getEditorText(page);
  const dlP = page.waitForEvent('download', { timeout: 15000 });
  await page.locator('#top-save').click(); clicks++;
  const dl = await dlP;
  const out = testInfo.outputPath('out.puml');
  await dl.saveAs(out);
  expect(fs.readFileSync(out, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '')).toBe(text.replace(/\r\n/g, '\n').replace(/\n$/, ''));
  expect(await H.getEditorText(page)).toBe(text);
});
