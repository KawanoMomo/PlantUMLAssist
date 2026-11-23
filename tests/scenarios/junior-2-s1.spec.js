// @ts-check
// junior 台本 場面 1「状態遷移図を開き、SVG に書き出して設計書に置く」手順 2:
//   同じ状態遷移図を Import ▾ →「.puml を開く」で開き直し、Export ▾ →「SVGとして保存」で out.svg を受ける。
//   書き出しの入口は上部バーの Export ▾ (ツール ▾ には書き出しを置かない)。
// 期待 (principles.md「押した対象だけが変わる」「描ける」):
//   - 開いた本文は fixture と同じ (開く操作で本文を書き換えない)。開き直しても同じ
//   - 書き出しで本文は 1 行も動かない
//   - 受けた .svg は空でなく <svg を含み、3 状態 (待機・初期化中・完了) の文字を持つ
//   - 手数は Import ▾ → .puml を開く の 2 クリックと Export ▾ → SVGとして保存 の 2 クリック
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

const NAME = 'junior-s1-state.puml';
const WORDS = ['待機', '初期化中', '完了'];

function norm(s) { return String(s).replace(/\r\n/g, '\n').replace(/\n+$/, ''); }

async function openByImport(page) {
  let clicks = 0;
  await page.locator('#btn-import').click(); clicks++;
  await expect(page.locator('#imp-file')).toBeVisible();
  const chooserP = page.waitForEvent('filechooser');
  await page.locator('#imp-file').click(); clicks++;
  const chooser = await chooserP;
  await chooser.setFiles(path.join(H.FIXTURES, NAME));
  await expect.poll(() => H.getEditorText(page)).toContain('state "初期化中" as S2');
  await H.waitDrawn(page, WORDS);
  return clicks;
}

test('junior 手順2 (場面1) 状態遷移図を Import ▾ で開き直し、Export ▾ から SVG で書き出して受ける', async ({ page }, testInfo) => {
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  await H.bootWith(page, null);
  const src = H.fixture(NAME);

  // 開く (手順 1 の続き) → 同じ図を開き直す。どちらも本文は fixture のまま。
  let clicks = await openByImport(page);
  expect(norm(await H.getEditorText(page))).toBe(norm(src));
  const t0 = Date.now();
  clicks += await openByImport(page);
  H.annotate(testInfo, 'renderMs', Date.now() - t0);
  const before = await H.getEditorText(page);
  expect(norm(before)).toBe(norm(src));
  await H.expectRendered(page);

  // Export ▾ → SVGとして保存。
  const dlP = page.waitForEvent('download');
  await page.locator('#btn-export').click(); clicks++;
  await expect(page.locator('#exp-svg')).toBeVisible();
  await page.locator('#exp-svg').click(); clicks++;
  const dl = await dlP;

  expect(dl.suggestedFilename()).toMatch(/\.svg$/i);
  const out = testInfo.outputPath('out.svg');
  await dl.saveAs(out);
  const body = fs.readFileSync(out, 'utf8');
  // 描ける: 空でない SVG で、3 状態の名前が文字として入っている。
  expect(body.length).toBeGreaterThan(200);
  expect(body).toContain('<svg');
  expect(body).toContain('</svg>');
  for (const w of WORDS) expect(body, 'svg text ' + w).toContain(w);

  // 押した対象だけが変わる: 書き出しは本文を変えない。
  const after = await H.getEditorText(page);
  const d = H.diffLines(before, after);
  H.annotate(testInfo, 'diffLines', d);
  expect(d).toBe(0);
  expect(after).toBe(before);
  expect(dialogs).toEqual([]);
  // 開く 2 回 (各 2 クリック) + 書き出し 2 クリック。
  expect(clicks).toBeLessThanOrEqual(6);
  await H.expectRendered(page);
});
