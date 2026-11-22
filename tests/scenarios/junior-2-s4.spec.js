// @ts-check
// junior 台本 場面 4「初期化の図を SVG に書き出して設計書に貼る」手順 2:
//   状態遷移図を開き、書き出しの経路で SVG を選んで受ける。受けたファイルが空でないことを確かめる。
//   書き出しの入口は上部バーの Export ▾ (ツール ▾ には書き出しを置かない。tool-menu.js の GROUPS)。
// 期待 (principles.md「押した対象だけが変わる」「描ける」):
//   - 書き出しで本文は 1 行も動かない
//   - 受けた .svg は空でなく <svg を含み、状態名と遷移のラベルの文字を持つ
//   - 手数は Export ▾ → SVGとして保存 の 2 クリック (台本の操作数の 2 倍まで)
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

const WORDS = ['Idle', 'Running', 'RunningSlow', 'Spi_Start', 'Spi_Stop'];

test('junior 手順2 状態遷移図を Export ▾ から SVG で書き出し、空でないファイルを受ける', async ({ page }, testInfo) => {
  const src = H.fixture('state-1.puml');
  await H.bootWith(page, src);
  await H.waitDrawn(page, WORDS);
  await H.expectRendered(page);
  const before = await H.getEditorText(page);

  let clicks = 0;
  const t0 = Date.now();
  const dlP = page.waitForEvent('download');
  await page.locator('#btn-export').click(); clicks++;
  await expect(page.locator('#exp-svg')).toBeVisible();
  await page.locator('#exp-svg').click(); clicks++;
  const dl = await dlP;
  H.annotate(testInfo, 'renderMs', Date.now() - t0);

  expect(dl.suggestedFilename()).toMatch(/\.svg$/i);
  const out = testInfo.outputPath(dl.suggestedFilename());
  await dl.saveAs(out);
  const body = fs.readFileSync(out, 'utf8');
  // 受けたファイルが空でない。描かれた図の SVG である。
  expect(body.length).toBeGreaterThan(200);
  expect(body).toContain('<svg');
  expect(body).toContain('</svg>');
  // 描ける: 状態名と遷移のラベルが SVG の文字として入っている (画像に化けていない)。
  for (const w of WORDS) expect(body, 'svg text ' + w).toContain(w);

  // 押した対象だけが変わる: 書き出しは本文を変えない。
  const after = await H.getEditorText(page);
  const d = H.diffLines(before, after);
  H.annotate(testInfo, 'diffLines', d);
  expect(d).toBe(0);
  expect(after).toBe(before);
  expect(clicks).toBeLessThanOrEqual(2);
  await H.expectRendered(page);
  // 保存先の無い図では Export ▾ に「書き出し先:」の行が出ない (今までどおりダウンロード)。
  await page.locator('#btn-export').click();
  await expect(page.locator('#export-menu')).toBeVisible();
  await expect(page.locator('#export-dest')).toBeHidden();
  await page.keyboard.press('Escape');
});

// TICKET-junior-20261122-1520-wish (roadmap v7.0 必須 4): 保存先から開いた図を SVG に書き出した後で本文を直して保存すると、
// Export ▾ の「書き出し先:」の行に、置き場の SVG が今の本文より古い旨が出る。書き出し直すと消える。
// 判定はディスクの .puml と画像だけ。保存先に増えるのは書き出しの 1 枚だけで、ほかのファイルは保存した 1 枚以外バイト一致。
test('junior 手順2 保存先の図を SVG に書き出してから直して保存すると、Export ▾ の行に SVG が古いと出て、書き出し直すと消える', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  const path = require('path');
  const S = require('../e2e/scenarios/_scenario');
  const dir = S.absDirFor(__filename) + '-stale';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const NAME = 'spi_state';
  fs.writeFileSync(path.join(dir, NAME + '.puml'), H.fixture('state-1.puml'));
  fs.writeFileSync(path.join(dir, 'other_seq.puml'), '@startuml\nA -> B : x\n@enduml\n');
  const snapshot = () => {
    const out = {};
    for (const f of fs.readdirSync(dir)) out[f] = fs.readFileSync(path.join(dir, f)).toString('base64');
    return out;
  };

  await H.bootWithSaveDir(page, S.dirFor(__filename) + '-stale');
  await S.openFolder(page);
  await page.locator('#folder-panel .folder-item[data-file-name="' + NAME + '"]').first().dblclick();
  await H.waitDrawn(page, WORDS);
  await S.closeFolderList(page);
  const before = snapshot();

  // SVG に書き出す (Export ▾ → SVGとして保存)。直後は古い旨が出ない。
  const first = await S.exportToFolder(page, 'exp-svg');
  const svgPath = path.join(dir, NAME + '.svg');
  expect(path.resolve(first.path)).toBe(path.resolve(svgPath));
  await page.locator('#btn-export').click();
  await expect(page.locator('#export-dest')).toBeVisible();
  await expect(page.locator('#export-dest-place')).toHaveText('図と同じフォルダ');
  await page.waitForTimeout(500);
  await expect(page.locator('#export-dest-stale')).toHaveText('');
  await page.keyboard.press('Escape');

  // 要素を 1 つ足して Ctrl+S (実キー入力)。
  // カーソルを @enduml の行の頭に置き (ファイルは末尾に改行を持つので Ctrl+End では @enduml の後ろになる)、1 行打つ。
  await page.locator('#editor').click();
  await page.locator('#editor').evaluate((ed) => {
    const i = ed.value.lastIndexOf('@enduml');
    ed.setSelectionRange(i, i);
  });
  await page.keyboard.type('RunningSlow --> Running : Spi_Resume\n');
  await H.waitDrawn(page, WORDS.concat(['Spi_Resume']));
  await page.keyboard.press('Control+s');
  await expect(page.locator('#status-save-result')).toContainText('に保存しました', { timeout: 10000 });
  await expect.poll(() => fs.readFileSync(path.join(dir, NAME + '.puml'), 'utf8'), { timeout: 10000 }).toContain('Spi_Resume');
  await page.waitForTimeout(800);   // 自動保存の書き込みが残っていれば、ここまでに済む

  // Export ▾ の「書き出し先:」の行に SVG が古い旨が出る (PNG は書き出していないので言わない)。
  await page.locator('#btn-export').click();
  const stale = page.locator('#export-dest-stale');
  await expect(stale).toHaveText('SVG は保存後に直した本文より古い', { timeout: 5000 });
  await page.screenshot({ path: testInfo.outputPath('export-stale.png') });

  // SVG で書き出し直すと消える。
  const seq = Number((await page.locator('#status-save-result').getAttribute('data-export-seq')) || 0);
  await page.locator('#exp-svg').click();
  await page.waitForFunction((n) => Number(document.getElementById('status-save-result').getAttribute('data-export-seq') || 0) > n, seq);
  expect(fs.readFileSync(svgPath, 'utf8')).toContain('Spi_Resume');
  if (!(await page.locator('#export-menu').isVisible())) await page.locator('#btn-export').click();
  await page.waitForTimeout(500);
  await expect(stale).toHaveText('');
  await page.keyboard.press('Escape');

  // 保存先に増えたのは書き出しの 1 枚だけ。ほかは保存した 1 枚 (.puml) 以外バイト一致。
  const after = snapshot();
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).concat([NAME + '.svg']).sort());
  for (const f of Object.keys(before)) {
    if (f === NAME + '.puml') continue;
    expect(after[f], f + ' は 1 バイトも変わらない').toBe(before[f]);
  }
});
