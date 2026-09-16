// @ts-check
// BLK-human-20260916-0901 — 人間の台本「alt/loop で範囲を囲む」。
//
// 「⌗ alt/loop で囲む…」は選んだ 1 本しか囲めず、複数本の範囲を GUI で選ぶ入口が無かった。
// 到達条件: (1) 2 本目を押して Shift+クリックで 3 本目 → alt で囲む → alt を選んで終点を 4 本目に伸ばす
// → SVG の alt 枠が 3 本を覆う。(2) ⌗ を押してから図で終点を押しても範囲で囲める。
// クリックは page.mouse の実クリック (合成 dispatchEvent は当たり判定を素通りする)。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

// 1 @startuml / 2 m1 / 3 m2 / 4 m3 / 5 m4 / 6 @enduml
const FOUR = [
  '@startuml',
  'A -> B : m1',
  'B -> C : m2',
  'C --> B : m3',
  'B --> A : m4',
  '@enduml',
].join('\n');

async function setDsl(page, dsl) {
  await page.evaluate((text) => {
    var ed = document.getElementById('editor');
    ed.value = text;
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  }, dsl);
  await page.waitForTimeout(900);
}

async function rectBox(page, selector) {
  const loc = page.locator(selector).first();
  await expect(loc).toHaveCount(1);
  const b = await loc.boundingBox();
  if (!b) throw new Error('no box: ' + selector);
  return b;
}

async function clickMessage(page, line, modifiers) {
  const b = await rectBox(page, '#overlay-layer rect[data-type="message"][data-line="' + line + '"]');
  if (modifiers) await page.keyboard.down('Shift');
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  if (modifiers) await page.keyboard.up('Shift');
  await page.waitForTimeout(300);
}

// 描かれた矢印 (g.message の line) の y を DSL 行ごとに読む。
async function arrowYs(page) {
  return page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#overlay-layer rect[data-type="message"]').forEach((r) => {
      const b = r.getBoundingClientRect();
      out.push({ line: Number(r.getAttribute('data-line')), top: b.y, bottom: b.y + b.height });
    });
    return out.sort((a, b) => a.line - b.line);
  });
}

test.describe('人間 — alt/loop で「どこからどこまで」を囲み、囲んだ後に伸ばす', () => {
  test('2 本目〜3 本目を Shift+クリックで選んで alt で囲み、alt を選んで終点を 4 本目に伸ばす', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, FOUR);

    await clickMessage(page, 3);
    await clickMessage(page, 4, 'shift');
    await expect(page.locator('#seq-multi-range')).toContainText('2 本のメッセージ (B→C … C→B)');

    await page.locator('.seq-bulk-wrap[data-kind="alt"]').click();
    await expect(page.locator('#seq-wrap-range')).toContainText('2 本のメッセージ (B→C … C→B)');
    await page.locator('#seq-wrap-label').fill('在庫あり');
    await page.locator('#seq-wrap-confirm').click();
    await page.waitForTimeout(1000);

    expect((await getEditorText(page)).split('\n')).toEqual([
      '@startuml', 'A -> B : m1', 'alt 在庫あり', 'B -> C : m2', 'C --> B : m3', 'end', 'B --> A : m4', '@enduml',
    ]);

    // 選択を外し、alt の枠の見出しを実クリックで選ぶ。
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const g = await rectBox(page, '#overlay-layer rect[data-type="group"]');
    await page.mouse.move(g.x + 12, g.y + 6);
    await page.mouse.click(g.x + 12, g.y + 6);
    await page.waitForTimeout(300);
    await expect(page.locator('#seq-group-range')).toContainText('2 本');
    await expect(page.locator('#seq-group-range-end')).toContainText('C→B');

    await page.locator('#seq-group-end-down').click();
    await page.waitForTimeout(1200);
    expect((await getEditorText(page)).split('\n')).toEqual([
      '@startuml', 'A -> B : m1', 'alt 在庫あり', 'B -> C : m2', 'C --> B : m3', 'B --> A : m4', 'end', '@enduml',
    ]);
    // 伸ばした後も alt が選ばれたまま、範囲の表示が 3 本に変わる。
    await expect(page.locator('#seq-group-range')).toContainText('3 本');
    await expect(page.locator('#seq-group-range-end')).toContainText('B→A');

    // SVG の alt 枠が 2〜4 本目の矢印を覆い、1 本目は覆わない。
    const box = await rectBox(page, '#overlay-layer rect[data-type="group"]');
    const ys = await arrowYs(page);
    const inside = ys.filter((m) => m.line >= 4 && m.line <= 6);
    expect(inside.length).toBe(3);
    inside.forEach((m) => {
      expect(m.top).toBeGreaterThanOrEqual(box.y - 1);
      expect(m.bottom).toBeLessThanOrEqual(box.y + box.height + 1);
    });
    const first = ys.find((m) => m.line === 2);
    expect(first && first.bottom).toBeLessThanOrEqual(box.y + 2);
  });

  test('⌗ を押してから図で終点のメッセージを押すと、その範囲で囲むフォームが開く', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, FOUR);

    await clickMessage(page, 2);
    await page.locator('.seq-wrap-block').first().click();
    await expect(page.locator('#seq-wrap-pick-banner')).toBeVisible();
    // 押すまでの間、選べるメッセージがハイライトされる。
    await expect(page.locator('#overlay-layer rect.seq-wrap-pickable')).toHaveCount(3);

    await clickMessage(page, 4);
    await expect(page.locator('#seq-wrap-pick-banner')).toHaveCount(0);
    await expect(page.locator('#seq-wrap-range')).toContainText('3 本のメッセージ (A→B … C→B)');
    await page.locator('#seq-wrap-kind').selectOption('loop');
    await page.locator('#seq-wrap-confirm').click();
    await page.waitForTimeout(900);
    expect((await getEditorText(page)).split('\n')).toEqual([
      '@startuml', 'loop', 'A -> B : m1', 'B -> C : m2', 'C --> B : m3', 'end', 'B --> A : m4', '@enduml',
    ]);
  });
});
