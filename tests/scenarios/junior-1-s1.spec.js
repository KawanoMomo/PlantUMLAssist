// @ts-check
// junior 台本 場面 1「初めて開いて最初の 1 枚を作る」手順 1:
//   製品を開き、sequence の新しい図に participant を 4 つ、追加フォームから足す。本文と描画を見る。
// 期待 (principles.md「押した対象だけが変わる」「描ける」):
//   - 1 回の「+ 追加」で本文は宣言 1 行だけ増え、ほかの行は動かない
//   - 4 つの宣言は足した順に並び、描いた図に 4 者の名前が出る
//   - 白紙のうちはプレビューに PlantUML の案内画面を出さず、「末尾に追加」から足せることを 1 行で言う。1 つ足せば図が出る
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

const PARTS = [
  { ptype: 'participant', name: 'Sensor' },
  { ptype: 'participant', name: 'Driver' },
  { ptype: 'participant', name: 'App' },
  { ptype: 'participant', name: 'Log' },
];

test('junior 手順1 新しいシーケンス図に、追加フォームから参加者を 4 つ足す', async ({ page }, testInfo) => {
  await H.bootWith(page, null);

  // 新しい図 (＋) をシーケンスにする。
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(300);
  await page.locator('#diagram-type').selectOption('plantuml-sequence');
  await page.waitForTimeout(500);
  const fresh = await H.getEditorText(page);
  expect(fresh).toContain('@startuml');
  expect(fresh).toContain('@enduml');
  // TICKET-owner-20261115-1827-3: 白紙のプレビューは PlantUML の案内画面 (Welcome to PlantUML!) を描かず、
  // 空のキャンバスと「末尾に追加」から足せることの 1 行を出す。本文は白紙のまま。
  await expect(page.locator('#preview-svg svg[data-blank-canvas="1"]')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('#preview-svg .preview-blank-hint')).toContainText('末尾に追加');
  await expect(page.locator('#preview-svg')).not.toContainText('Welcome to PlantUML');
  await expect(page.locator('#preview-svg')).not.toContainText('plantuml.com');
  expect(await H.getEditorText(page)).toBe(fresh);

  // 末尾に追加の「参加者」から 1 つずつ足す。
  for (const p of PARTS) {
    const r = await H.measure(page, testInfo, async () => {
      await page.locator('#seq-tail-kind-chip-participant').click();
      await page.locator('#seq-tail-ptype').selectOption(p.ptype);
      await page.locator('#seq-tail-alias').fill(p.name);
      await page.locator('#seq-tail-add').click();
    }, [p.name]);
    // 押した対象だけが変わる: 宣言 1 行が増えるだけ。
    expect(r.diffLines, 'diff lines for ' + p.name).toBe(1);
    expect(H.removedLines(r.before, r.after)).toEqual([]);
    // 1 つ足せば白紙の案内は消え、今までどおり描く。
    await expect(page.locator('#preview-svg .preview-blank-hint')).toHaveCount(0);
  }

  const dsl = await H.getEditorText(page);
  const lines = dsl.split('\n');
  const idx = PARTS.map((p) => lines.findIndex((l) => new RegExp('^\\s*' + p.ptype + '\\s+' + p.name + '\\b').test(l)));
  for (const i of idx) expect(i).toBeGreaterThan(0);
  // 足した順に並ぶ
  expect(idx.slice().sort((a, b) => a - b)).toEqual(idx);
  expect(lines[0]).toContain('@startuml');
  expect(lines.filter((l) => l.trim()).pop()).toContain('@enduml');

  // 描ける: 図にエラーが無く、4 者の名前が出る。
  await H.expectRendered(page);
  const txt = await H.svgText(page);
  for (const p of PARTS) expect(txt).toContain(p.name);
});
