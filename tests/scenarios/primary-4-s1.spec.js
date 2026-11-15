// @ts-check
// primary 台本 場面 1「設計変更の反映」手順 4:
//   class-1 のメンバーを 1 つ直し、comp-1 に部品と関係を 1 つずつ足す。Undo で 1 操作ずつ戻れるか見る。
// 期待 (principles.md「押した対象だけが変わる」「描ける」「Undo は 1 操作単位」):
//   - メンバーの直しは、名指ししたクラス (Spi_Driver) のその 1 行だけを書き換える。同じ名前の
//     メンバーを持つ別のクラス (Spi_DriverMon の baud)・コメント・字下げは動かない
//   - 部品 1 つ・関係 1 本の追加は、どれも本文 1 行の追加だけ。消える・書き換わる行は無い
//   - Ctrl+Z 1 回で直前の 1 操作だけが戻り (本文がその操作の直前に一致)、Ctrl+Y で戻した操作がやり直せる
//   - 直した図が描ける
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

// 図の要素を実マウスで押す (合成イベントは当たり判定を素通りするので使わない)。
async function clickElement(page, type, id) {
  const hit = page.locator('#overlay-layer [data-type="' + type + '"][data-id="' + id + '"]').first();
  await expect(hit).toBeAttached({ timeout: 15000 });
  await hit.scrollIntoViewIfNeeded();
  const box = await hit.boundingBox();
  if (!box) throw new Error('overlay box not found: ' + type + ' ' + id);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

// 本文の欄に手を置いてから押す (右パネルの入力欄の中の Ctrl+Z は欄のネイティブ undo に任せる約束)。
async function pressInEditor(page, key) {
  await page.locator('#editor').focus();
  await page.keyboard.press(key);
}

async function expectText(page, text) {
  await expect.poll(() => H.getEditorText(page), { timeout: 5000 }).toBe(text);
}

test('primary 手順4a class-1 のメンバーを 1 つ直しても他の行が変わらず、Undo 1 回で戻る', async ({ page }, testInfo) => {
  const original = H.fixture('class-1.puml').replace(/\r\n/g, '\n').replace(/\n$/, '');
  await H.bootWith(page, original);
  await H.waitDrawn(page, ['Spi_DriverMon', 'Spi_Config']);
  let ops = 0;

  // 図で Spi_Driver を押し、属性 baud の「編集」→ 型を uint32 → 更新。
  const r = await H.measure(page, testInfo, async () => {
    await clickElement(page, 'class', 'Spi_Driver');
    await page.locator('.cl-member-row[data-member-idx="0"] .cl-mem-edit').click();
    await expect(page.locator('#cl-mem-name-0')).toHaveValue('baud');
    await page.locator('#cl-mem-type-0').fill('uint32');
    await page.locator('#cl-mem-update-0').click();
    ops += 4;
  }, ['uint32']);

  // 書き換わったのは Spi_Driver の baud の 1 行だけ。Spi_DriverMon の baud は uint16 のまま。
  expect(H.removedLines(r.before, r.after)).toEqual(['  - baud : uint16']);
  const lines = original.split('\n');
  const expected = lines.slice();
  expected[4] = '  - baud : uint32';
  expect(r.after).toBe(expected.join('\n'));
  expect(r.diffLines).toBe(2);

  // Undo 1 回で直す前の本文に戻り、Redo でやり直せる。
  await pressInEditor(page, 'Control+z');
  ops += 1;
  await expectText(page, original);
  await pressInEditor(page, 'Control+y');
  ops += 1;
  await expectText(page, r.after);
  H.annotate(testInfo, 'ops', ops);

  // 描ける
  await H.expectRendered(page);
  await H.waitDrawn(page, ['uint32', 'Spi_DriverMon', 'Spi_Config']);
});

test('primary 手順4b comp-1 に部品と関係を 1 つずつ足しても他の行が変わらず、Undo で 1 操作ずつ戻る', async ({ page }, testInfo) => {
  const original = H.fixture('comp-1.puml').replace(/\r\n/g, '\n').replace(/\n$/, '');
  await H.bootWith(page, original);
  await H.waitDrawn(page, ['SpiDrvMon', 'ISpi']);
  let ops = 0;

  // 部品を 1 つ、末尾に追加の「コンポーネント」から足す。
  const rc = await H.measure(page, testInfo, async () => {
    await page.locator('#co-tail-kind-chip-component').click();
    await page.locator('#co-tail-alias').fill('SpiHw');
    await page.locator('#co-tail-add').click();
    ops += 3;
  }, ['SpiHw']);
  expect(rc.diffLines).toBe(1);
  expect(H.removedLines(rc.before, rc.after)).toEqual([]);
  expect(rc.after.split('\n').filter((l) => /\bSpiHw\b/.test(l))).toEqual(['component SpiHw']);

  // 関係を 1 本、末尾に追加の「関係」から足す (依存 SpiDrv ..> SpiHw)。
  const rr = await H.measure(page, testInfo, async () => {
    await page.locator('#co-tail-kind-chip-relation').click();
    await page.locator('.co-tail-rkind-card[data-value="dependency"]').click();
    await page.locator('#co-tail-from').selectOption('SpiDrv');
    await page.locator('#co-tail-to').selectOption('SpiHw');
    await page.locator('#co-tail-add').click();
    ops += 5;
  }, ['SpiHw']);
  expect(rr.diffLines).toBe(1);
  expect(H.removedLines(rr.before, rr.after)).toEqual([]);
  const rel = rr.after.split('\n').filter((l) => /\bSpiDrv\b.*\bSpiHw\b/.test(l));
  expect(rel).toHaveLength(1);
  expect(rel[0]).toMatch(/^\s*SpiDrv\s*\.\.>\s*SpiHw\s*$/);

  // 元の図からの差分は足した 2 行だけ。元の行 (コメント・字下げ・前方一致の SpiDrvMon) は動かない。
  expect(H.diffLines(original, rr.after)).toBe(2);
  expect(H.removedLines(original, rr.after)).toEqual([]);

  // Undo 1 回ごとに 1 操作だけ戻る: 関係 → 部品 の順。Redo 2 回で元に戻せる。
  await pressInEditor(page, 'Control+z');
  await expectText(page, rc.after);
  await pressInEditor(page, 'Control+z');
  await expectText(page, original);
  await pressInEditor(page, 'Control+y');
  await expectText(page, rc.after);
  await pressInEditor(page, 'Control+y');
  await expectText(page, rr.after);
  ops += 4;
  H.annotate(testInfo, 'ops', ops);

  // 描ける
  await H.expectRendered(page);
  await H.waitDrawn(page, ['SpiHw', 'SpiDrvMon', 'ISpi']);
});
