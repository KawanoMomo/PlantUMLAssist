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

// ── 手順 4c〜4f: 同じ要素を、図を押し直さずに続けて直す (roadmap v8.0 必須 1) ──
// 期待: 「変更を反映」の後も右パネルは直した要素 (同じ行) のまま。2 回目以降の反映も同じ行だけを書き換える。

// 図の要素を、種類と本文の行で探して実マウスで押す。
async function clickAtLine(page, type, line) {
  const hit = page.locator('#overlay-layer [data-type="' + type + '"][data-line="' + line + '"]').first();
  await expect(hit).toBeAttached({ timeout: 15000 });
  await hit.scrollIntoViewIfNeeded();
  const box = await hit.boundingBox();
  if (!box) throw new Error('overlay box not found: ' + type + ' L' + line);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

// /render の応答を ms 遅らせる (遅い PC の再現。scenario の中だけで、製品には何も足さない)。
async function slowRender(page, ms) {
  await page.route('**/render', async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}

// 反映の後、本文が変わり右パネルが組み直されるまで待つ (描き直しの到着は待たない)。
async function waitApplied(page, before) {
  await expect.poll(() => H.getEditorText(page), { timeout: 5000 }).not.toBe(before);
  await page.waitForTimeout(400);
}

// 動いた行 (同じ行数の本文どうしで、中身の違う行の番号。1 始まり)。
function changedLineNos(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  expect(b.length).toBe(a.length);
  const out = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) out.push(i + 1);
  return out;
}

async function relationLabelFiveTimes(page, testInfo, slow) {
  const original = H.fixture('comp-1.puml').replace(/\r\n/g, '\n').replace(/\n$/, '');
  if (slow) await slowRender(page, 1500);
  await H.bootWith(page, original);
  await H.waitDrawn(page, ['SpiDrvMon', 'ISpi']);
  let ops = 0;
  // 押すのは最初の 1 回だけ: 10 行目の SpiDrvMon ..> SpiDrv。
  await clickAtLine(page, 'relation', 10);
  ops += 1;
  const panel = page.locator('#props-content');
  await expect(panel).toContainText('Relation · 10 行目');
  const snaps = [original];
  for (const lab of ['r1', 'r2', 'r3', 'r4', 'r5']) {
    const before = await H.getEditorText(page);
    const r = await H.measure(page, testInfo, async () => {
      await page.locator('#co-rel-label').fill(lab);
      await page.locator('#co-rel-apply').click();
      ops += 2;
      await waitApplied(page, before);
    }, slow ? null : [lab]);
    expect(r.diffLines).toBe(2);
    expect(changedLineNos(r.before, r.after)).toEqual([10]);
    expect(r.after.split('\n')[9]).toBe('SpiDrvMon ..> SpiDrv : ' + lab);
    // 図を押し直していないのに、右パネルは同じ 10 行目の関係のまま。
    await expect(panel).toContainText('Relation · 10 行目');
    await expect(page.locator('#co-rel-label')).toHaveValue(lab);
    snaps.push(r.after);
  }
  if (slow) await H.waitDrawn(page, ['r5']);
  // 5 回目の反映の後の画面 (右パネルは 10 行目の関係のまま)。
  if (!slow) await page.screenshot({ path: testInfo.outputPath('after-5-applies.png') });
  // Ctrl+Z 5 回で 1 直しずつ戻り、開いたときのバイト列に戻る。Ctrl+Y で 1 直し進む。
  for (let i = 4; i >= 0; i--) {
    await pressInEditor(page, 'Control+z');
    await expectText(page, snaps[i]);
  }
  await pressInEditor(page, 'Control+y');
  await expectText(page, snaps[1]);
  ops += 6;
  H.annotate(testInfo, 'ops', ops);
  await H.expectRendered(page);
}

test('primary 手順4c comp-1 の関係 1 本のラベルを、図を押し直さず 5 回続けて直せる', async ({ page }, testInfo) => {
  await relationLabelFiveTimes(page, testInfo, false);
});

test('primary 手順4d 描き直しが 1.5 秒遅れても、関係 1 本のラベルを押し直さず 5 回続けて直せる', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  await relationLabelFiveTimes(page, testInfo, true);
});

// 6 図種: 右パネルで直せる要素を 1 つ押し、1 回目の反映の後に押し直さず 2 回目の反映が同じ行だけを変える。
// 名前 (識別子) を直す反映も同じ: 名前が変わっても、右パネルは同じ行の要素のまま。
const KINDS = [
  { kind: 'sequence', fixture: 'seq-1.puml', words: ['SpiDrvMon'], type: 'message', line: 10,
    async edit(page, v) {
      await page.locator('#seq-edit-stereotype').fill(v);
      await page.locator('#seq-edit-stereotype').press('Tab');
    },
    expectLine: (v) => '  SpiDrv -> Hw : <color:#32CD32><<' + v + '>></color>\\nWriteReg(CTRL)' },
  { kind: 'usecase', fixture: 'uc-1.puml', words: ['Send data'], type: 'relation', line: 7,
    async edit(page, v) {
      await page.locator('#uc-rel-label').fill(v);
      await page.locator('#uc-rel-apply').click();
    },
    expectLine: (v) => '  App --> UC1 : ' + v },
  { kind: 'component', fixture: 'comp-1.puml', words: ['SpiDrvMon'], type: 'relation', line: 9,
    async edit(page, v) {
      await page.locator('#co-rel-label').fill(v);
      await page.locator('#co-rel-apply').click();
    },
    expectLine: (v) => '  App ..> ISpi : ' + v },
  { kind: 'class', fixture: 'class-1.puml', words: ['Spi_DriverMon'], type: 'class', line: 4,
    async edit(page, v) {
      // 1 回目は行の「編集」で開く。反映の後は同じ行が開いたまま残る。
      const ed = page.locator('.cl-member-row[data-member-idx="0"] .cl-mem-edit');
      if (await ed.count()) await ed.click();
      await page.locator('#cl-mem-type-0').fill(v);
      await page.locator('#cl-mem-update-0').click();
    },
    changed: 5,
    selLine: 5,   // メンバーを開いた間は、そのメンバーの行が選ばれている
    expectLine: (v) => '  - baud : ' + v },
  { kind: 'activity', fixture: 'act-1.puml', words: ['Spi_Init'], type: 'action', line: 5,
    async edit(page, v) {
      await page.locator('#ac-action-text').fill(v);
      await page.locator('#ac-action-update').click();
    },
    expectLine: (v) => ':' + v + ';' },
  { kind: 'state', fixture: 'state-1.puml', words: ['RunningSlow'], type: 'transition', line: 9,
    async edit(page, v) {
      await page.locator('#st-tr-trig').fill(v);
      await page.locator('#st-tr-update').click();
    },
    expectLine: (v) => '  Running --> Idle : ' + v },
  { kind: 'component の部品の名前', fixture: 'comp-1.puml', words: ['SpiDrvMon'], type: 'component', line: 4,
    async edit(page, v) {
      await page.locator('#co-edit-id').fill('App' + v);
      await page.locator('#co-edit-apply').click();
    },
    // 改名は名前を識別子として持つ行 (9 行目の関係) も同じ反映で付け替える (TICKET-owner-20261124-0422-1)。
    refLines: { 9: (v) => '  App' + v + ' ..> ISpi' },
    // 表示名を書いていない宣言は名前の字だけが替わり、図も新しい名前 (Appv2) で描く (TICKET-owner-20261124-0822-3。
    // 以前は前の名前を表示名に据えた `component "App" as Appv1` を期待していた)。
    expectLine: (v) => 'component App' + v },
  { kind: 'usecase の名前', fixture: 'uc-1.puml', words: ['Send data'], type: 'usecase', line: 5,
    async edit(page, v) {
      await page.locator('#uc-edit-label').fill('Send ' + v);
      await page.locator('#uc-edit-apply').click();
    },
    expectLine: (v) => 'usecase "Send ' + v + '" as UC1' },
  { kind: 'class の名前', fixture: 'class-1.puml', words: ['Spi_DriverMon'], type: 'class', line: 4,
    async edit(page, v) {
      await page.locator('#cl-edit-id').fill('Drv' + v);
      await page.locator('#cl-edit-apply').click();
    },
    // 改名は名前を識別子として持つ行 (13 行目の関係) も同じ反映で付け替える。Spi_DriverMon は変わらない。
    refLines: { 13:(v) => 'Drv' + v + ' ..> Spi_Config : uses' },
    expectLine: (v) => 'class Drv' + v + ' {' },
];

for (const slow of [false, true]) {
  for (const K of KINDS) {
    test('primary 手順4' + (slow ? 'f' : 'e') + ' ' + K.kind + ': 1 回目の反映の後も同じ要素の右パネルが残り、2 回目も同じ行だけを直す' + (slow ? ' (描き直し 1.5 秒遅れ)' : ''), async ({ page }, testInfo) => {
      test.setTimeout(90000);
      const original = H.fixture(K.fixture).replace(/\r\n/g, '\n').replace(/\n$/, '');
      if (slow) await slowRender(page, 1500);
      await H.bootWith(page, original);
      await H.waitDrawn(page, K.words);
      await clickAtLine(page, K.type, K.line);
      const target = K.changed || K.line;
      const panelHead = page.locator('#props-content');
      await expect(panelHead).toContainText(K.line + ' 行目');
      let prev = original;
      for (const v of ['v1', 'v2']) {
        // 反映の前の右パネルに印を付け、反映の後に組み直された (古いフォームが残っていない) ことを見る。
        await page.evaluate(() => {
          const el = document.querySelector('#props-content > *');
          if (el) el.setAttribute('data-probe-old', '1');
        });
        await K.edit(page, v);
        await waitApplied(page, prev);
        const now = await H.getEditorText(page);
        const refs = K.refLines || {};
        expect(changedLineNos(prev, now)).toEqual([target].concat(Object.keys(refs).map(Number)).sort((a, b) => a - b));
        expect(now.split('\n')[target - 1]).toBe(K.expectLine(v));
        for (const n of Object.keys(refs)) expect(now.split('\n')[Number(n) - 1]).toBe(refs[n](v));
        // 押し直していないのに、右パネルは同じ行の要素のまま (組み直した新しいフォーム)。
        await expect(page.locator('#props-content [data-probe-old]')).toHaveCount(0);
        await expect(panelHead).toContainText(K.line + ' 行目');
        prev = now;
      }
      if (K.drawnAfter) {
        // 図に出る語が変わらない反映は、最後の本文で描き直しが終わる (枠が今の本文から作られる) のを待つ。
        await expect(page.locator('#render-status')).not.toHaveText(/Rendering/, { timeout: 20000 });
        await page.waitForTimeout(slow ? 2500 : 800);
      } else {
        await H.waitDrawn(page, ['v2']);
      }
      await H.expectRendered(page);
      // 描き直した図でも、選んだままの枠は同じ行の要素に付いている。
      await expect(page.locator('#overlay-layer .selected[data-line="' + (K.selLine || K.line) + '"]').first()).toBeAttached();
    });
  }
}
