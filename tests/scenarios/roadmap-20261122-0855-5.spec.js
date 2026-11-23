// @ts-check
// TICKET-roadmap-20261122-0855-5 (roadmap/v6.0.md できれば): 保存先の一覧で印を付けた図を、保存先へまとめて書き出す。
// 期待 (利用者の初回と同じ既定の画面・実マウス):
//   - 一覧で 3 枚に印を付け、形式を選んで「選んだ 3 枚を書き出す」→ 保存先に 3 枚の画像 (空でない・見える) が
//     1 枚ずつの書き出しと同じ名前 ({名前}.png) で増え、全 .puml はバイト一致。ほかのファイルは増えない
//   - 手数は 1 枚ずつ書き出す今の合計 (3 枚 30 手) の半分以下 (15 以内)
//   - 書いた枚数と置き場が一覧の中と下端に出る
//   - 描けない図を 1 枚混ぜると、その図の画像は書かれず、画面にその図の名前が出る。残りの図は書かれる
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const DOCS = ['hand-seq', 'hand-state', 'hand-class'];
const FILES = ['common'].concat(DOCS);
const BROKEN = '@startuml\nAlice -> Bob : hi\nzzz??? bad line !!!\n@enduml\n';
// 1 枚ずつ書き出す今の合計は 3 枚で 30 手 (票の「現状」)。その半分以下。
const OPS_MAX = 15;

function seed(dir, extra) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const orig = {};
  for (const n of FILES) {
    orig[n] = fs.readFileSync(path.join(H.FIXTURES, n + '.puml'));
    fs.writeFileSync(path.join(dir, n + '.puml'), orig[n]);
  }
  for (const [n, text] of Object.entries(extra || {})) {
    orig[n] = Buffer.from(text, 'utf8');
    fs.writeFileSync(path.join(dir, n + '.puml'), orig[n]);
  }
  return orig;
}

async function waitBatch(page, before) {
  await page.waitForFunction((n) => {
    const el = document.getElementById('folder-export-result');
    return el && Number(el.getAttribute('data-seq') || 0) > n;
  }, before, { timeout: 60000 });
  return page.locator('#folder-export-result').evaluate((el) => ({
    text: el.textContent || '',
    done: Number(el.getAttribute('data-done') || 0),
    failed: (el.getAttribute('data-failed') || '').split('/').filter(Boolean),
  }));
}
async function seqOf(page) {
  return Number((await page.locator('#folder-export-result').getAttribute('data-seq')) || 0);
}

test('roadmap 0855-5 一覧で 3 枚に印を付けてまとめて書き出すと、保存先に 3 枚の画像が増え .puml はバイト一致', async ({ page }, testInfo) => {
  test.setTimeout(120 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  let downloads = 0;
  page.on('download', () => { downloads++; });
  const dir = path.join(S.absDirFor(__filename), 't1');
  const orig = seed(dir);

  await H.bootWithSaveDir(page, S.dirFor(__filename) + '/t1');
  let ops = 0;
  await S.openFolder(page);
  ops += 2;
  for (const n of DOCS) {
    await page.locator('#folder-panel .folder-pick[data-pick-name="' + n + '"]').click();
    ops += 1;
  }
  const btn = page.locator('#folder-export-many');
  await expect(btn).toHaveText('選んだ 3 枚を書き出す');
  await page.locator('#folder-export-kind').selectOption('png');
  ops += 1;
  await page.screenshot({ path: testInfo.outputPath('picked.png') });
  const before = await seqOf(page);
  await btn.click();
  ops += 1;
  const r = await waitBatch(page, before);
  expect(r.done).toBe(3);
  expect(r.failed).toEqual([]);
  // 書いた枚数と置き場が一覧の中と下端に出る。
  expect(r.text).toBe('書き出しました: 3 枚 (PNG) → 図と同じフォルダ');
  await expect(page.locator('#status-save-result')).toContainText('書き出しました: 3 枚 (PNG)');
  await page.screenshot({ path: testInfo.outputPath('exported.png') });

  // 保存先に 3 枚の PNG (空でない・見える・白地) が 1 枚ずつの書き出しと同じ名前で増え、ほかは増えない。
  for (const n of DOCS) {
    const buf = fs.readFileSync(path.join(dir, n + '.png'));
    const img = H.decodePng(buf);
    const st = H.inkStats(img);
    H.annotate(testInfo, 'png', n + ' ' + img.w + 'x' + img.h + ' ink=' + st.ink);
    expect(st.ink, n + '.png は線・文字がある').toBeGreaterThan(500);
    expect(st.edge, n + '.png は縁で切れない').toBe(0);
    expect(st.corner, n + '.png の隅は白の不透明').toEqual([255, 255, 255, 255]);
  }
  expect(fs.readdirSync(dir).sort()).toEqual(FILES.map((n) => n + '.puml').concat(DOCS.map((n) => n + '.png')).sort());
  await page.waitForTimeout(1200);
  for (const n of FILES) {
    expect(Buffer.compare(fs.readFileSync(path.join(dir, n + '.puml')), orig[n]), n + '.puml は 1 バイトも変わらない').toBe(0);
  }
  expect(downloads, 'ダウンロードは来ない').toBe(0);
  H.annotate(testInfo, 'ops', ops);
  expect(ops).toBeLessThanOrEqual(OPS_MAX);

  // 同じ印のまま形式を SVG に替えると、同じ 3 枚の SVG が増える (図の名前で、SVG の text はその図のもの)。
  await page.locator('#folder-export-kind').selectOption('svg');
  const b2 = await seqOf(page);
  await btn.click();
  const r2 = await waitBatch(page, b2);
  expect(r2.done).toBe(3);
  for (const n of DOCS) {
    const svg = fs.readFileSync(path.join(dir, n + '.svg'), 'utf8');
    expect(svg, n + '.svg は SVG').toMatch(/<svg[\s>]/);
    expect(svg, n + '.svg はその図の SVG').toContain('data-diagram-type=');
  }
  expect(errors, errors.join('\n')).toEqual([]);
});

test('roadmap 0855-5 描けない図を混ぜると、その図の画像は書かれず、画面にその図の名前が出る', async ({ page }) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const dir = path.join(S.absDirFor(__filename), 't2');
  const orig = seed(dir, { broken: BROKEN });

  await H.bootWithSaveDir(page, S.dirFor(__filename) + '/t2');
  await S.openFolder(page);
  for (const n of ['hand-seq', 'broken', 'hand-state']) {
    await page.locator('#folder-panel .folder-pick[data-pick-name="' + n + '"]').click();
  }
  await page.locator('#folder-export-kind').selectOption('svg');
  const before = await seqOf(page);
  await page.locator('#folder-export-many').click();
  const r = await waitBatch(page, before);
  expect(r.done).toBe(2);
  expect(r.failed).toEqual(['broken']);
  await expect(page.locator('#folder-export-result')).toContainText('書かなかった図: broken');
  await expect(page.locator('#folder-export-result')).toContainText('書き出しました: 2 枚 (SVG)');
  expect(fs.existsSync(path.join(dir, 'broken.svg')), '描けない図の画像は書かない').toBe(false);
  expect(fs.statSync(path.join(dir, 'hand-seq.svg')).size).toBeGreaterThan(0);
  expect(fs.statSync(path.join(dir, 'hand-state.svg')).size).toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  for (const n of Object.keys(orig)) {
    expect(Buffer.compare(fs.readFileSync(path.join(dir, n + '.puml')), orig[n]), n + '.puml は 1 バイトも変わらない').toBe(0);
  }
  expect(fs.readdirSync(dir).sort()).toEqual(Object.keys(orig).map((n) => n + '.puml').concat(['hand-seq.svg', 'hand-state.svg']).sort());
  expect(errors, errors.join('\n')).toEqual([]);
});
