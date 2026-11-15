// @ts-check
// primary 台本 場面 1「設計変更の反映」手順 3:
//   state-1 に状態を 1 つ足して遷移を 2 本つなぐ。押した要素以外の行が動かないか見る。
// 期待 (principles.md「押した対象だけが変わる」「描ける」「操作コストは計る」):
//   - 状態 1 つ・遷移 1 本の追加は、どれも本文 1 行の追加だけ。消える・書き換わる行は無い
//   - 名前が前方一致する別の状態 (Running と RunningSlow)・コメント・字下げは動かない
//   - 遷移の終点は図の状態を実マウスで押して選ぶ。押した状態 (Warmup / Running) だけが終点になる
//   - 直した図が描け、新しい状態と 2 本の遷移のきっかけが図に出る
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

const NEW_STATE = 'Warmup';
const TX = [
  { from: 'Idle', to: NEW_STATE, trig: 'Spi_Warm' },
  { from: NEW_STATE, to: 'Running', trig: 'Spi_Ready' },
];

// 図の要素を実マウスで押す (合成イベントは当たり判定を素通りするので使わない)。
async function clickState(page, id) {
  const hit = page.locator('#overlay-layer [data-type="state"][data-id="' + id + '"]').first();
  await expect(hit).toBeAttached({ timeout: 15000 });
  await hit.scrollIntoViewIfNeeded();
  const box = await hit.boundingBox();
  if (!box) throw new Error('overlay box not found: state ' + id);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

function txLine(t) {
  return new RegExp('^\\s*' + t.from + '\\s*-+>\\s*' + t.to + '\\s*:\\s*' + t.trig + '\\s*$');
}

test('primary 手順3 state-1 に状態を 1 つ足して遷移を 2 本つないでも他の行が変わらない', async ({ page }, testInfo) => {
  const original = H.fixture('state-1.puml').replace(/\r\n/g, '\n').replace(/\n$/, '');
  await H.bootWith(page, original);
  await H.waitDrawn(page, ['RunningSlow', 'Spi_Throttle']);
  let ops = 0;

  // 状態を 1 つ、末尾に追加の「状態」から足す (追加する位置は既定の「図の末尾」)。
  const rs = await H.measure(page, testInfo, async () => {
    await page.locator('#st-tail-kind-chip-state').click();
    await page.locator('#st-tail-id').fill(NEW_STATE);
    await page.locator('#st-tail-add').click();
  }, [NEW_STATE]);
  ops += 3;
  expect(rs.diffLines, 'diff lines for state ' + NEW_STATE).toBe(1);
  expect(H.removedLines(rs.before, rs.after)).toEqual([]);
  const decl = rs.after.split('\n').filter((l) => new RegExp('\\b' + NEW_STATE + '\\b').test(l));
  expect(decl).toEqual(['state ' + NEW_STATE]);

  // 遷移 2 本。1 本目は種類「遷移」→ From を選ぶ → 図で To の状態を押す → きっかけ → 追加。
  // 2 本目は From が直前の To (Warmup) を引き継ぐので、図で To を押してきっかけを打つだけ。
  for (let i = 0; i < TX.length; i++) {
    const t = TX[i];
    const r = await H.measure(page, testInfo, async () => {
      if (i === 0) {
        await page.locator('#st-tail-kind-chip-transition').click();
        await page.locator('#st-tail-from').selectOption(t.from);
        ops += 2;
      } else {
        await expect(page.locator('#st-tail-from')).toHaveValue(t.from);
      }
      await clickState(page, t.to);
      await expect(page.locator('#st-tail-to')).toHaveValue(t.to);
      await page.locator('#st-tail-trig').fill(t.trig);
      await page.locator('#st-tail-add').click();
      ops += 3;
    }, [t.trig]);
    expect(r.diffLines, 'diff lines for ' + t.trig).toBe(1);
    expect(H.removedLines(r.before, r.after)).toEqual([]);
    const added = r.after.split('\n').filter((l) => l.indexOf(t.trig) >= 0);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatch(txLine(t));
  }
  H.annotate(testInfo, 'ops', ops);

  // 元の図からの差分は足した 3 行だけ。元の行 (コメント・字下げ・前方一致の RunningSlow) は 1 字も動かない。
  const final = await H.getEditorText(page);
  expect(H.diffLines(original, final)).toBe(3);
  expect(H.removedLines(original, final)).toEqual([]);
  expect(final).toContain("' 手で整えた状態機械。字下げとコメントは道具に崩させない");
  expect(final).toContain('  Running --> RunningSlow : Spi_Throttle');
  expect(final.split('\n').pop()).toBe('@enduml');

  // 描ける
  await H.expectRendered(page);
  await H.waitDrawn(page, [NEW_STATE, 'Spi_Warm', 'Spi_Ready', 'RunningSlow', 'Spi_Throttle']);
});
