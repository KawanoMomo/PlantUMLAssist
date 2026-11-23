// @ts-check
// TICKET-roadmap-20261123-2358-3 (roadmap/v9.0.md できれば): 保存先の下のサブフォルダの図も、開かずに印を付けてまとめて書き出す。
// 期待 (利用者の初回と同じ既定の画面・実マウス、PUA_DATA_ROOT の試験用フォルダだけ):
//   - 保存先に直下 2 枚 (a・b)・hw/ 1 枚 (hw/a は直下の a と同じ名前)・hw/spi/ 1 枚を置き、図を 1 枚も開かずに 4 枚へ印を付けて
//     PNG で書き出す → 4 枚がそれぞれの図のフォルダに図の名前で書かれ、同じ名前の 2 枚は互いを上書きしない。
//     画素数は 1 枚ずつの PNG の書き出しと同じ。結果の行は道付き (hw/a) で言う
//   - 描けない図は書かず、道付きの名前で知らせる (空の画像・別の図の絵を書かない)
//   - .puml は全部バイト一致、増えたファイルは押した書き出しだけ。手数は 4 枚でクリック 8 以内
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const DOCS = {
  'a': '@startuml\nparticipant TopA\nparticipant TopB\nTopA -> TopB : top_call\n@enduml\n',
  'b': '@startuml\nAlice -> Bob : hello_b\nBob --> Alice : ok_b\n@enduml\n',
  'hw/a': '@startuml\nparticipant SubA\nparticipant SubB\nparticipant SubC\nSubA -> SubB : sub_call\nSubB -> SubC : sub_next\n@enduml\n',
  'hw/spi/c': '@startuml\n[*] --> SpiIdle\nSpiIdle --> SpiBusy : start\nSpiBusy --> SpiIdle : done\n@enduml\n',
};
const BROKEN = '@startuml\nAlice -> Bob : hi\nzzz??? bad line !!!\n@enduml\n';
const CLICKS_MAX = 8;

function seed(dir, docs) {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [k, text] of Object.entries(docs)) {
    const p = path.join(dir, k + '.puml');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, Buffer.from(text, 'utf8'));
  }
}
// 保存先の下の全ファイル (道は / 区切り) → 中身。
function snapshot(dir) {
  const out = {};
  (function walk(d, rel) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else out[r] = fs.readFileSync(path.join(d, e.name));
    }
  })(dir, '');
  return out;
}
async function seqOf(page) {
  return Number((await page.locator('#folder-export-result').getAttribute('data-seq')) || 0);
}
async function waitBatch(page, before) {
  await page.waitForFunction((n) => {
    const el = document.getElementById('folder-export-result');
    return el && Number(el.getAttribute('data-seq') || 0) > n;
  }, before, { timeout: 60000 });
  return page.locator('#folder-export-result').evaluate((el) => ({
    text: el.textContent || '',
    done: Number(el.getAttribute('data-done') || 0),
    failed: el.getAttribute('data-failed') || '',
  }));
}

test('roadmap 2358-3 直下 2 枚とサブフォルダ 2 枚に印を付けて PNG でまとめて書き出すと、それぞれの図のフォルダに書かれる', async ({ page }, testInfo) => {
  test.setTimeout(150 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  let downloads = 0;
  page.on('download', () => { downloads++; });
  const dir = path.join(S.absDirFor(__filename), 't1');
  seed(dir, DOCS);
  const before = snapshot(dir);

  await H.bootWithSaveDir(page, S.dirFor(__filename) + '/t1');
  let clicks = 0;
  await S.openFolder(page);
  clicks += 2;
  // サブフォルダの図は「サブフォルダの図」の節に道付きの名前で並ぶ。一覧の頭は届く範囲を言う。
  await expect(page.locator('#folder-sub-head')).toHaveText('サブフォルダの図（2 枚）');
  await expect(page.locator('#folder-panel .folder-sub-item')).toHaveText(['hw/a', 'hw/spi/c']);
  await expect(page.locator('#folder-scope')).toContainText('印を付けてまとめて書き出せます');
  for (const n of ['a', 'b']) {
    await page.locator('#folder-panel .folder-pick[data-pick-name="' + n + '"]').click();
    clicks += 1;
  }
  for (const k of ['hw/a', 'hw/spi/c']) {
    await page.locator('#folder-panel .folder-sub-pick[data-pick-sub="' + k + '"]').click();
    clicks += 1;
  }
  const btn = page.locator('#folder-export-many');
  await expect(btn).toHaveText('選んだ 4 枚を書き出す');
  await page.locator('#folder-export-kind').selectOption('png');
  clicks += 1;
  await page.screenshot({ path: testInfo.outputPath('picked.png') });
  const b0 = await seqOf(page);
  await btn.click();
  clicks += 1;
  const r = await waitBatch(page, b0);
  expect(r.done).toBe(4);
  expect(r.failed).toBe('');
  expect(r.text).toBe('書き出しました: 4 枚 (PNG) → それぞれの図のフォルダの置き場: a・b・hw/a・hw/spi/c');
  await expect(page.locator('#status-save-result')).toContainText('書き出しました: 4 枚 (PNG)');
  await page.screenshot({ path: testInfo.outputPath('exported.png') });
  H.annotate(testInfo, 'clicks', clicks);
  expect(clicks, '4 枚でクリック 8 以内').toBeLessThanOrEqual(CLICKS_MAX);

  // 4 枚がそれぞれの図のフォルダに図の名前で書かれる。同じ名前の a と hw/a は別のファイルで、中身も別の図。
  const pngs = {};
  for (const k of Object.keys(DOCS)) {
    const buf = fs.readFileSync(path.join(dir, k + '.png'));
    const img = H.decodePng(buf);
    const st = H.inkStats(img);
    H.annotate(testInfo, 'png', k + ' ' + img.w + 'x' + img.h + ' ink=' + st.ink);
    expect(st.ink, k + '.png は線・文字がある').toBeGreaterThan(500);
    expect(st.edge, k + '.png は縁で切れない').toBe(0);
    expect(st.corner, k + '.png の隅は白の不透明').toEqual([255, 255, 255, 255]);
    pngs[k] = { buf, img };
  }
  expect(Buffer.compare(pngs['a'].buf, pngs['hw/a'].buf), 'a.png と hw/a.png は互いを上書きしない').not.toBe(0);
  expect(pngs['hw/a'].img.w, 'hw/a は参加者 3 の図 (a より広い)').toBeGreaterThan(pngs['a'].img.w);

  // 増えたのは押した書き出しの 4 枚だけ。.puml は 1 バイトも変わらない。ダウンロードは来ない。
  await page.waitForTimeout(1200);
  const after = snapshot(dir);
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).concat(Object.keys(DOCS).map((k) => k + '.png')).sort());
  for (const f of Object.keys(before)) expect(Buffer.compare(after[f], before[f]), f + ' は 1 バイトも変わらない').toBe(0);
  expect(downloads, 'ダウンロードは来ない').toBe(0);

  // 画素数は 1 枚ずつの PNG の書き出しと同じ: hw/spi/c を一覧から開いて Export ▾ →「PNG で書き出す」(同じ置き場・同じ名前)。
  await page.locator('#folder-panel .folder-sub-item[data-sub-name="hw/spi/c"]').click();
  await S.closeFolderList(page);
  await H.waitDrawn(page, ['SpiIdle', 'SpiBusy']);
  const one = await S.exportToFolder(page, 'exp-png');
  expect(path.resolve(one.path)).toBe(path.resolve(path.join(dir, 'hw', 'spi', 'c.png')));
  const img1 = H.decodePng(fs.readFileSync(one.path));
  expect([img1.w, img1.h], '1 枚ずつの書き出しと同じ画素数').toEqual([pngs['hw/spi/c'].img.w, pngs['hw/spi/c'].img.h]);
  await page.waitForTimeout(1200);
  const after2 = snapshot(dir);
  expect(Object.keys(after2).sort()).toEqual(Object.keys(after).sort());
  for (const f of Object.keys(before)) expect(Buffer.compare(after2[f], before[f]), f + ' は開いた後も 1 バイトも変わらない').toBe(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('roadmap 2358-3 描けないサブフォルダの図は書かず、道付きの名前で知らせ、残りは書く', async ({ page }) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const dir = path.join(S.absDirFor(__filename), 't2');
  seed(dir, Object.assign({}, DOCS, { 'hw/bad': BROKEN }));
  const before = snapshot(dir);

  await H.bootWithSaveDir(page, S.dirFor(__filename) + '/t2');
  await S.openFolder(page);
  await page.locator('#folder-panel .folder-pick[data-pick-name="a"]').click();
  for (const k of ['hw/a', 'hw/bad']) {
    await page.locator('#folder-panel .folder-sub-pick[data-pick-sub="' + k + '"]').click();
  }
  await page.locator('#folder-export-kind').selectOption('svg');
  const b0 = await seqOf(page);
  await page.locator('#folder-export-many').click();
  const r = await waitBatch(page, b0);
  expect(r.done).toBe(2);
  expect(r.failed).toBe('hw/bad');
  expect(r.text).toBe('書き出しました: 2 枚 (SVG) → それぞれの図のフォルダの置き場: a・hw/a ／ 書かなかった図: hw/bad（描けません）');
  expect(fs.existsSync(path.join(dir, 'hw', 'bad.svg')), '描けない図の画像は書かない').toBe(false);
  // 同じ名前の a と hw/a の SVG は、それぞれの図のもの。
  expect(fs.readFileSync(path.join(dir, 'a.svg'), 'utf8')).toContain('TopA');
  expect(fs.readFileSync(path.join(dir, 'hw', 'a.svg'), 'utf8')).toContain('SubA');
  expect(fs.readFileSync(path.join(dir, 'hw', 'a.svg'), 'utf8')).not.toContain('TopA');
  await page.waitForTimeout(1000);
  const after = snapshot(dir);
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).concat(['a.svg', 'hw/a.svg']).sort());
  for (const f of Object.keys(before)) expect(Buffer.compare(after[f], before[f]), f + ' は 1 バイトも変わらない').toBe(0);
  expect(errors, errors.join('\n')).toEqual([]);
});
