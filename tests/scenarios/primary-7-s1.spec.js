// @ts-check
// primary 台本 場面 1「設計変更の反映」手順 7:
//   手順 2〜4 の手数 (クリック数 + 打鍵数) と操作から描画までの時間を数える。
// 手順 2〜4 と同じ直しを、利用者の手 (実マウスのクリック・1 字ずつの打鍵) だけで行い、手を数える。
//   クリック … ボタン・チップ・欄・図の要素を押す 1 回。プルダウン (select) は開く + 選ぶで 2
//   打鍵     … 打った字 1 字、Ctrl+A・Tab・Ctrl+Z・Ctrl+Y の 1 押し
// summary.json の tests[] に clicks / keys / hands (= clicks + keys) / renderMs (その手順の操作のうち最大) が出る。
// 期待 (principles.md「操作コストは計る」「押した対象だけが変わる」「描ける」):
//   - 手数は BASE (この scenario を作った時点の値) を超えない (前より悪くしない)
//   - 1 操作から描画までは 3 秒以内 (全体実行の負荷の下の上限)
//   - 1 操作の本文の差分は、追加・型の変更が 1 行 (書き換えは消した 1 + 足した 1)、改名は名前を語として持つ行の数だけ
//   - 直した図が描ける
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');
const { clickOverlayByLine } = require('../e2e/helpers');

const RENDER_MS_MAX = 3000;
// この scenario を作った時点の手数。製品の変更で手が増えたら赤にして知らせる (減ったらここを下げる)。
const BASE = {
  step2: { clicks: 17, keys: 30 },
  step3: { clicks: 12, keys: 23 },
  step4: { clicks: 16, keys: 18 },
};

// 利用者の手を数える道具。どの手も Playwright の実マウス・実キーボードで行う。
function hands(page) {
  const n = { clicks: 0, keys: 0 };
  return {
    n,
    async click(loc) { await loc.click(); n.clicks++; },
    async clickAt(type, id) {
      const hit = page.locator('#overlay-layer [data-type="' + type + '"][data-id="' + id + '"]').first();
      await expect(hit).toBeAttached({ timeout: 15000 });
      await hit.scrollIntoViewIfNeeded();
      const box = await hit.boundingBox();
      if (!box) throw new Error('overlay box not found: ' + type + ' ' + id);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      n.clicks++;
    },
    async clickLine(line) { await clickOverlayByLine(page, line); n.clicks++; },
    async select(loc, value) { await loc.selectOption(value); n.clicks += 2; },
    // 欄を押して打つ。replace のときは Ctrl+A で入っている字を選んでから打つ。
    async type(loc, text, replace) {
      await loc.click();
      n.clicks++;
      if (replace) { await page.keyboard.press('Control+a'); n.keys++; }
      await page.keyboard.type(text);
      n.keys += text.length;
    },
    async press(key) { await page.keyboard.press(key); n.keys++; },
  };
}

function report(testInfo, step, n) {
  H.annotate(testInfo, 'clicks', n.clicks);
  H.annotate(testInfo, 'keys', n.keys);
  H.annotate(testInfo, 'hands', n.clicks + n.keys);
  console.log('primary 手順7 ' + step + ': clicks ' + n.clicks + ', keys ' + n.keys + ', hands ' + (n.clicks + n.keys));
}

function expectFast(r, what) {
  expect(r.renderMs, 'renderMs for ' + what).not.toBeNull();
  expect(r.renderMs, 'renderMs for ' + what).toBeLessThanOrEqual(RENDER_MS_MAX);
}

async function expectText(page, text) {
  await expect.poll(() => H.getEditorText(page), { timeout: 5000 }).toBe(text);
}

test('primary 手順7 手順2 (seq-1 にメッセージ 2 本・参加者の改名) の手数と描画までの時間', async ({ page }, testInfo) => {
  const original = H.fixture('seq-1.puml').replace(/\r\n/g, '\n').replace(/\n$/, '');
  await H.bootWith(page, original);
  await H.waitDrawn(page, ['SpiDrvMon', 'Spi_Init()']);
  const h = hands(page);

  const messages = [
    { from: 'SpiDrv', to: 'Hw', label: 'WriteReg(BAUD)' },
    { from: 'Hw', to: 'SpiDrv', label: 'ack2' },
  ];
  for (const m of messages) {
    const r = await H.measure(page, testInfo, async () => {
      await h.click(page.locator('#seq-tail-kind-chip-message'));
      await h.select(page.locator('#seq-tail-from'), m.from);
      await h.select(page.locator('#seq-tail-to'), m.to);
      await h.type(page.locator('#seq-tail-label-rle .rle-textarea'), m.label, false);
      await h.click(page.locator('#seq-tail-add'));
    }, [m.label]);
    expectFast(r, m.label);
    expect(r.diffLines, 'diff lines for ' + m.label).toBe(1);
    expect(H.removedLines(r.before, r.after)).toEqual([]);
  }

  // 改名: 追加フォームの種類を「参加者」へ切り替えて離れ、図の SpiDrv を押して Alias を打ち直す。
  const declLine = (await H.getEditorText(page)).split('\n').findIndex((l) => /^participant SpiDrv$/.test(l)) + 1;
  expect(declLine).toBeGreaterThan(0);
  const r = await H.measure(page, testInfo, async () => {
    await h.click(page.locator('#seq-tail-kind-chip-participant'));
    await h.clickLine(declLine);
    await expect(page.locator('#seq-edit-alias')).toHaveValue('SpiDrv');
    await h.type(page.locator('#seq-edit-alias'), 'Spi_Driver', true);
    await h.press('Tab');
  }, ['Spi_Driver']);
  expectFast(r, 'rename');
  const named = r.before.split('\n').filter((l) => /\bSpiDrv\b/.test(l)).length;
  expect(r.diffLines).toBe(2 * named);
  expect(r.after).toContain('participant SpiDrvMon');

  report(testInfo, '手順2', h.n);
  await H.expectRendered(page);
  await H.waitDrawn(page, ['Spi_Driver', 'WriteReg(BAUD)', 'ack2', 'SpiDrvMon']);
  expect(h.n.clicks).toBeLessThanOrEqual(BASE.step2.clicks);
  expect(h.n.keys).toBeLessThanOrEqual(BASE.step2.keys);
});

test('primary 手順7 手順3 (state-1 に状態 1 つ・遷移 2 本) の手数と描画までの時間', async ({ page }, testInfo) => {
  const original = H.fixture('state-1.puml').replace(/\r\n/g, '\n').replace(/\n$/, '');
  await H.bootWith(page, original);
  await H.waitDrawn(page, ['RunningSlow', 'Spi_Throttle']);
  const h = hands(page);

  const rs = await H.measure(page, testInfo, async () => {
    await h.click(page.locator('#st-tail-kind-chip-state'));
    await h.type(page.locator('#st-tail-id'), 'Warmup', false);
    await h.click(page.locator('#st-tail-add'));
  }, ['Warmup']);
  expectFast(rs, 'state Warmup');
  expect(rs.diffLines).toBe(1);
  expect(H.removedLines(rs.before, rs.after)).toEqual([]);

  // 1 本目は種類「遷移」→ From を選ぶ → 図で To を押す → きっかけ → 追加。2 本目は From を引き継ぐ。
  const tx = [
    { from: 'Idle', to: 'Warmup', trig: 'Spi_Warm' },
    { from: 'Warmup', to: 'Running', trig: 'Spi_Ready' },
  ];
  for (let i = 0; i < tx.length; i++) {
    const t = tx[i];
    const r = await H.measure(page, testInfo, async () => {
      if (i === 0) {
        await h.click(page.locator('#st-tail-kind-chip-transition'));
        await h.select(page.locator('#st-tail-from'), t.from);
      } else {
        await expect(page.locator('#st-tail-from')).toHaveValue(t.from);
      }
      await h.clickAt('state', t.to);
      await expect(page.locator('#st-tail-to')).toHaveValue(t.to);
      await h.type(page.locator('#st-tail-trig'), t.trig, false);
      await h.click(page.locator('#st-tail-add'));
    }, [t.trig]);
    expectFast(r, t.trig);
    expect(r.diffLines, 'diff lines for ' + t.trig).toBe(1);
    expect(H.removedLines(r.before, r.after)).toEqual([]);
  }

  const final = await H.getEditorText(page);
  expect(H.diffLines(original, final)).toBe(3);
  expect(H.removedLines(original, final)).toEqual([]);

  report(testInfo, '手順3', h.n);
  await H.expectRendered(page);
  await H.waitDrawn(page, ['Warmup', 'Spi_Warm', 'Spi_Ready', 'RunningSlow']);
  expect(h.n.clicks).toBeLessThanOrEqual(BASE.step3.clicks);
  expect(h.n.keys).toBeLessThanOrEqual(BASE.step3.keys);
});

test('primary 手順7 手順4 (class-1 のメンバーの直し・comp-1 に部品と関係・Undo) の手数と描画までの時間', async ({ page }, testInfo) => {
  const h = hands(page);

  // class-1: 図で Spi_Driver を押し、属性 baud の「編集」→ 型を uint32 に打ち直す → 更新。Undo / Redo を 1 回ずつ。
  const cls = H.fixture('class-1.puml').replace(/\r\n/g, '\n').replace(/\n$/, '');
  await H.bootWith(page, cls);
  await H.waitDrawn(page, ['Spi_DriverMon', 'Spi_Config']);
  const rm = await H.measure(page, testInfo, async () => {
    await h.clickAt('class', 'Spi_Driver');
    await h.click(page.locator('.cl-member-row[data-member-idx="0"] .cl-mem-edit'));
    await expect(page.locator('#cl-mem-name-0')).toHaveValue('baud');
    await h.type(page.locator('#cl-mem-type-0'), 'uint32', true);
    await h.click(page.locator('#cl-mem-update-0'));
  }, ['uint32']);
  expectFast(rm, 'member type');
  expect(H.removedLines(rm.before, rm.after)).toEqual(['  - baud : uint16']);
  expect(rm.diffLines).toBe(2);
  // Undo は本文の欄に手を置いて押す (欄の中の Ctrl+Z は欄の字を戻す約束)。
  await h.click(page.locator('#editor'));
  await h.press('Control+z');
  await expectText(page, cls);
  await h.press('Control+y');
  await expectText(page, rm.after);
  await H.expectRendered(page);
  await H.waitDrawn(page, ['uint32', 'Spi_DriverMon']);

  // comp-1: 開き直して (図を開く手は手順 4 の手数に数えない。class-1 と同じ)、
  // 部品 1 つと関係 1 本を末尾に追加から足し、Undo 2 回・Redo 2 回。
  const comp = H.fixture('comp-1.puml').replace(/\r\n/g, '\n').replace(/\n$/, '');
  await H.bootWith(page, comp);
  await H.waitDrawn(page, ['SpiDrvMon', 'ISpi']);
  const rc = await H.measure(page, testInfo, async () => {
    await h.click(page.locator('#co-tail-kind-chip-component'));
    await h.type(page.locator('#co-tail-alias'), 'SpiHw', false);
    await h.click(page.locator('#co-tail-add'));
  }, ['SpiHw']);
  expectFast(rc, 'component SpiHw');
  expect(rc.diffLines).toBe(1);
  const rr = await H.measure(page, testInfo, async () => {
    await h.click(page.locator('#co-tail-kind-chip-relation'));
    await h.click(page.locator('.co-tail-rkind-card[data-value="dependency"]'));
    await h.select(page.locator('#co-tail-from'), 'SpiDrv');
    await h.select(page.locator('#co-tail-to'), 'SpiHw');
    await h.click(page.locator('#co-tail-add'));
  }, ['SpiHw']);
  expectFast(rr, 'relation SpiDrv ..> SpiHw');
  expect(rr.diffLines).toBe(1);
  expect(H.removedLines(comp, rr.after)).toEqual([]);
  await h.click(page.locator('#editor'));
  await h.press('Control+z');
  await expectText(page, rc.after);
  await h.press('Control+z');
  await expectText(page, comp);
  await h.press('Control+y');
  await h.press('Control+y');
  await expectText(page, rr.after);

  report(testInfo, '手順4', h.n);
  await H.expectRendered(page);
  await H.waitDrawn(page, ['SpiHw', 'SpiDrvMon', 'ISpi']);
  expect(h.n.clicks).toBeLessThanOrEqual(BASE.step4.clicks);
  expect(h.n.keys).toBeLessThanOrEqual(BASE.step4.keys);
});
