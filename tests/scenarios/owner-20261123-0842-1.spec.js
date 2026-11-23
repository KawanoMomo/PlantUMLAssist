// @ts-check
// TICKET-owner-20261123-0842-1 (data-loss): 「まとめて」で日本語名の状態を足した直後 (描き直しが届く前) に
//   もう一度「+ 追加」か「まとめて」で足すと、別名が前に足した状態と重なり (S1・S2 を 2 度書く)、
//   押していない状態が図から消えていた。利用者と同じく間を空けずに続けて足す。
// 期待 (principles.md「押した対象だけが変わる」「描ける」):
//   - 本文の別名は全部違い、足した状態の名前は全部ラベルに残る
//   - 図に足した状態が全部描かれ、下端の件数と図の状態の数が一致する
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

async function openBlankState(page) {
  await H.bootWith(page, null);
  await page.locator('#btn-tab-new').click();
  await page.locator('#rail-st').click();
  await expect.poll(() => page.locator('#diagram-type').inputValue()).toBe('plantuml-state');
  // 白紙の図が描け、右パネルが状態遷移図の「末尾に追加」に替わってから足す (利用者も図が出てから押す)。
  // 描き直しを待たないのは、この後の「足した直後にもう一度足す」の間だけ。
  await H.expectRendered(page);
  await expect(page.locator('#st-tail-kind-chip-bulk')).toBeVisible();
}

async function single(page, name) {
  await page.locator('#st-tail-kind-chip-state').click();
  await page.locator('#st-tail-id').click();
  await page.locator('#st-tail-id').fill(name);
  await page.locator('#st-tail-add').click();
}

async function bulk(page, lines) {
  await page.locator('#st-tail-kind-chip-bulk').click();
  await page.locator('#st-tail-bulk').click();
  await page.locator('#st-tail-bulk').fill(lines.join('\n'));
  await page.locator('#st-tail-add').click();
}

async function expectAllDistinctAndDrawn(page, testInfo, names, shot) {
  await expect.poll(async () => (await H.getEditorText(page)).split('\n').filter((l) => /^\s*state\s/.test(l)).length)
    .toBe(names.length);
  const text = await H.getEditorText(page);
  const decl = text.split('\n').filter((l) => /^\s*state\s/.test(l));
  const aliases = decl.map((l) => (l.match(/\bas\s+(\S+)\s*$/) || [])[1]);
  expect(new Set(aliases).size, '別名が全部違う: ' + decl.join(' / ')).toBe(names.length);
  for (const n of names) expect(text, n + ' のラベル').toContain('"' + n + '"');
  // 描ける: 足した状態が全部描かれ、下端の件数と図の状態の数が一致する。
  await H.waitDrawn(page, names);
  await page.waitForFunction((n) => {
    const ids = new Set();
    document.querySelectorAll('#overlay-layer [data-type="state"]').forEach((e) => ids.add(e.getAttribute('data-id')));
    return ids.size === n;
  }, names.length, { timeout: 20000 });
  await expect(page.locator('#status-info')).toContainText(names.length + ' states');
  await H.expectRendered(page);
  await page.screenshot({ path: testInfo.outputPath(shot) });
}

test('owner 0842-1 A: 状態を「+ 追加」した直後に「まとめて」で 2 つ足しても、前の状態が消えない', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  await openBlankState(page);
  await single(page, '待機');
  await bulk(page, ['初期化中', '完了']);
  await expectAllDistinctAndDrawn(page, testInfo, ['待機', '初期化中', '完了'], 'owner-0842-1-A.png');
});

test('owner 0842-1 B: 「まとめて」を間を空けずに 2 回続けても、前に足した状態が消えない', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  await openBlankState(page);
  await bulk(page, ['待機', '初期化中']);
  await bulk(page, ['完了', '異常']);
  await expectAllDistinctAndDrawn(page, testInfo, ['待機', '初期化中', '完了', '異常'], 'owner-0842-1-B.png');
});
