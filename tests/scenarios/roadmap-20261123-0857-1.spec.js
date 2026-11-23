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

// 要素 3 つと関係 2 本を足す図種 (末尾に追加の欄の作りが同じ)。
const KINDS = [
  { kind: 'component', type: 'plantuml-component', p: 'co', elem: 'component', decl: 'component', names: ['Ca', 'Cb', 'Cc'] },
  { kind: 'usecase', type: 'plantuml-usecase', p: 'uc', elem: 'actor', decl: 'actor', names: ['Ua', 'Ub', 'Uc'] },
  { kind: 'class', type: 'plantuml-class', p: 'cl', elem: 'class', decl: 'class', names: ['Ka', 'Kb', 'Kc'] },
];

for (const K of KINDS)
for (const slow of [false, true]) {
  for (const pause of [400, 0]) {
    const mode = pause ? '(ア) 欄を選んで 400ms 置く' : '(イ) 間を置かない';
    test('roadmap 0857-1 ' + K.kind + ': 要素 3 つと関係 2 本を続けて足す ' + mode + (slow ? ' 描き直し 1.5 秒遅れ' : ''), async ({ page }) => {
      test.setTimeout(120000);
      if (slow) await slowRender(page, 1500);
      await H.bootWith(page, null);
      const blank = await newDiagram(page, K.type);
      const [na, nb, nc] = K.names;
      const snaps = [blank];
      async function step(act) {
        await act();
        await expect.poll(() => H.getEditorText(page)).not.toBe(snaps[snaps.length - 1]);
        snaps.push(await H.getEditorText(page));
      }
      const P = '#' + K.p + '-tail-';
      await page.locator(P + 'kind-chip-' + K.elem).click();
      for (const name of K.names) {
        await step(async () => {
          await page.locator(P + 'alias').fill(name);
          if (pause) await page.waitForTimeout(pause);
          await page.locator(P + 'add').click();
        });
      }
      await page.locator(P + 'kind-chip-relation').click();
      for (const [fr, to] of [[na, nb], [nb, nc]]) {
        await step(async () => {
          await page.locator(P + 'from').selectOption(fr);
          await page.locator(P + 'to').selectOption(to);
          if (pause) await page.waitForTimeout(pause);
          await page.locator(P + 'add').click();
        });
      }
      const text = snaps[snaps.length - 1];
      const lines = text.split('\n');
      for (const name of K.names) {
        expect(lines.filter((l) => new RegExp('^\\s*' + K.decl + '\\s+' + name + '\\s*$').test(l))).toHaveLength(1);
      }
      expect(lines.filter((l) => new RegExp('^\\s*' + na + '\\s*\\S+\\s*' + nb + '\\s*$').test(l))).toHaveLength(1);
      expect(lines.filter((l) => new RegExp('^\\s*' + nb + '\\s*\\S+\\s*' + nc + '\\s*$').test(l))).toHaveLength(1);
      expect(H.diffLines(blank, text)).toBe(5);
      await H.waitDrawn(page, K.names);
      await page.locator('#editor').focus();
      for (let i = snaps.length - 2; i >= 0; i--) {
        await page.keyboard.press('Control+z');
        await expect.poll(() => H.getEditorText(page)).toBe(snaps[i]);
      }
    });
  }
}
