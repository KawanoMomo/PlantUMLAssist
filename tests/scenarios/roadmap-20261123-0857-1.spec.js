// @ts-check
// TICKET-roadmap-20261123-0857-1 (roadmap v8.0 必須 2): 「+ 追加」を間を空けずに続けても、どの手も打った時点の本文に
// 対して働き、確定の直後に選んだ欄が後から来るフォームの組み直しで消えない。
//   (ア) 前の確定の直後に次の欄を選び 400ms 置いて確定する / (イ) 間を置かない。/render 1.5 秒遅れでも同じ。
// 期待: 打った N 手が N 行として選んだとおりの始点・終点・別名で入る (空振り 0・重なり 0・取り違え 0)、
//       Ctrl+Z N 回で白紙のバイト列に戻る。
// 未完: いまは component だけ。残りの 5 図種と「まとめて」は同じ形で足す (票の本文の「実装」)。
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

async function slowRender(page, ms) {
  await page.route('**/render', async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}

async function newDiagram(page, type) {
  await page.locator('#btn-tab-new').click();
  await page.locator('#diagram-type').selectOption(type);
  await expect.poll(() => H.getEditorText(page)).toContain('@enduml');
  await expect(page.locator('#preview-svg svg[data-blank-canvas="1"]')).toHaveCount(1, { timeout: 20000 });
  return H.getEditorText(page);
}

for (const slow of [false, true]) {
  for (const pause of [400, 0]) {
    const mode = pause ? '(ア) 欄を選んで 400ms 置く' : '(イ) 間を置かない';
    test('roadmap 0857-1 component: 部品 3 つと関係 2 本を続けて足す ' + mode + (slow ? ' 描き直し 1.5 秒遅れ' : ''), async ({ page }) => {
      test.setTimeout(120000);
      if (slow) await slowRender(page, 1500);
      await H.bootWith(page, null);
      const blank = await newDiagram(page, 'plantuml-component');
      const snaps = [blank];
      async function step(act) {
        await act();
        await expect.poll(() => H.getEditorText(page)).not.toBe(snaps[snaps.length - 1]);
        snaps.push(await H.getEditorText(page));
      }
      await page.locator('#co-tail-kind-chip-component').click();
      for (const name of ['Ca', 'Cb', 'Cc']) {
        await step(async () => {
          await page.locator('#co-tail-alias').fill(name);
          if (pause) await page.waitForTimeout(pause);
          await page.locator('#co-tail-add').click();
        });
      }
      await page.locator('#co-tail-kind-chip-relation').click();
      for (const [fr, to] of [['Ca', 'Cb'], ['Cb', 'Cc']]) {
        await step(async () => {
          await page.locator('#co-tail-from').selectOption(fr);
          await page.locator('#co-tail-to').selectOption(to);
          if (pause) await page.waitForTimeout(pause);
          await page.locator('#co-tail-add').click();
        });
      }
      const text = snaps[snaps.length - 1];
      const lines = text.split('\n');
      for (const name of ['Ca', 'Cb', 'Cc']) {
        expect(lines.filter((l) => new RegExp('^\\s*component\\s+' + name + '\\s*$').test(l))).toHaveLength(1);
      }
      expect(lines.filter((l) => /^\s*Ca\s*\S+\s*Cb\s*$/.test(l))).toHaveLength(1);
      expect(lines.filter((l) => /^\s*Cb\s*\S+\s*Cc\s*$/.test(l))).toHaveLength(1);
      expect(H.diffLines(blank, text)).toBe(5);
      await H.waitDrawn(page, ['Ca', 'Cb', 'Cc']);
      await page.locator('#editor').focus();
      for (let i = snaps.length - 2; i >= 0; i--) {
        await page.keyboard.press('Control+z');
        await expect.poll(() => H.getEditorText(page)).toBe(snaps[i]);
      }
    });
  }
}
