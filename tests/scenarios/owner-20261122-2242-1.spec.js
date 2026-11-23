// @ts-check
// TICKET-owner-20261122-2242-1: サブフォルダの図の書き出し先の窓・Export ▾ の「書き出し先:」の行と保存フォルダの一覧が、
// サブフォルダの図をどう扱うかを画面どおりに言う。置き場は図のフォルダごとに覚える (保存先の直下の図で替えた置き場は
// サブフォルダの図に効かない)。
// 期待:
//   (1) 既定の画面・実マウス。保存先の直下の seq で置き場を out に替えて SVG を書き出すと proj/out/seq.svg。
//       2 階層下の docs/api/st を開くと、Export ▾ の行は「図と同じフォルダ（docs/api）」と言い、SVG は proj/docs/api/st.svg。
//       画面の行・窓の文字とディスクに増えたファイルの場所が一致する
//   (2) st の窓の「保存先:」は保存先のフォルダ (proj) を指し、図のフォルダは「この図のフォルダ: docs/api」と言う。
//       区切りは /。「図と同じフォルダ (保存先の直下)」とは言わない。置き場は図のフォルダごとに覚えると書く
//   (3) 直下にも同じ名前の st がある。両方を書き出しても SVG は 2 枚 (黙った上書き 0)
//   (4) 保存フォルダの一覧に「保存先の直下の図だけ」の 1 行がある
//   .puml は 1 バイトも変わらない。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

function snapshot(dir) {
  const out = {};
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p).split(path.sep).join('/')] = fs.readFileSync(p).toString('base64');
    }
  })(dir);
  return out;
}

// 手数 (クリック・打鍵) と、開いてから描けるまでの最長 ms。
const hands = { clicks: 0, keys: 0, drawMs: 0 };
async function drawn(page, words) {
  hands.drawMs = Math.max(hands.drawMs, await H.waitDrawn(page, words));
}

async function mouseClick(page, locator, opts) {
  hands.clicks++;
  await expect(locator).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, opts);
}

const SEQ = '@startuml\nA -> B : seq\n@enduml\n';
const ST_SUB = '@startuml\n[*] --> SubIdle\n@enduml\n';
const ST_TOP = '@startuml\n[*] --> TopIdle\n@enduml\n';

async function exportSvg(page) {
  const st = page.locator('#status-save-result');
  const before = Number((await st.getAttribute('data-export-seq')) || 0);
  if (!(await page.locator('#export-menu').isVisible())) await mouseClick(page, page.locator('#btn-export'));
  await mouseClick(page, page.locator('#exp-svg'));
  await page.waitForFunction((n) => Number(document.getElementById('status-save-result').getAttribute('data-export-seq') || 0) > n, before);
  return st.getAttribute('data-export-path');
}

test('owner 2242-1 サブフォルダの図の書き出し先は図のフォルダを道で言い、保存先を保存先と呼ぶ。画面とディスクが一致し、同じ名前の 2 枚は別々に書かれる', async ({ page }, testInfo) => {
  test.setTimeout(120 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const dir = path.join(S.absDirFor(__filename), 'proj');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'docs', 'api'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'seq.puml'), SEQ);
  fs.writeFileSync(path.join(dir, 'st.puml'), ST_TOP);
  fs.writeFileSync(path.join(dir, 'docs', 'api', 'st.puml'), ST_SUB);
  const before = snapshot(dir);

  await H.bootWithSaveDir(page, S.dirFor(__filename) + '/proj');

  // (1) 直下の seq: 置き場を out に替えて SVG を書き出す。
  await mouseClick(page, page.locator('#files-parts .files-part-file[data-file-name="seq"]'));
  await drawn(page, ['seq']);
  await mouseClick(page, page.locator('#btn-export'));
  await expect(page.locator('#export-dest-place')).toHaveText('図と同じフォルダ');
  await mouseClick(page, page.locator('#export-dest-change'));
  const pick = page.locator('#export-dest-pick');
  await expect(pick).toBeVisible();
  await expect(pick.locator('.edp-choice').first()).toHaveText('図と同じフォルダ (保存先の直下)');
  await expect(page.locator('#export-dest-note')).toHaveCount(0);
  await page.keyboard.type('out'); hands.keys += 3;
  await mouseClick(page, page.locator('#export-dest-new-ok'));
  await expect(pick).toHaveCount(0);
  await mouseClick(page, page.locator('#btn-export'));
  await expect(page.locator('#export-dest-place')).toHaveText('保存先の「out」フォルダ');
  const seqSvg = await exportSvg(page);
  expect(path.resolve(String(seqSvg))).toBe(path.resolve(path.join(dir, 'out', 'seq.svg')));

  // 直下の st も書き出す (置き場 out)。
  await page.keyboard.press('Escape'); hands.keys++;
  await mouseClick(page, page.locator('#files-parts .files-part-file[data-file-name="st"]'));
  await drawn(page, ['TopIdle']);
  const topSt = await exportSvg(page);
  expect(path.resolve(String(topSt))).toBe(path.resolve(path.join(dir, 'out', 'st.svg')));
  await page.keyboard.press('Escape'); hands.keys++;

  // (1)(2) 2 階層下の docs/api/st を開く。
  const docs = page.locator('#files-subtree .files-sub-dir[data-sub-rel="docs"]');
  await expect(docs).toHaveCount(1, { timeout: 10000 });
  if ((await docs.getAttribute('aria-expanded')) !== 'true') await mouseClick(page, docs);
  const api = page.locator('#files-subtree .files-sub-dir[data-sub-rel="docs/api"]');
  if ((await api.getAttribute('aria-expanded')) !== 'true') await mouseClick(page, api);
  await mouseClick(page, page.locator('#files-subtree .files-sub-file[data-sub-rel="docs/api"][data-file-name="st"]'));
  await drawn(page, ['SubIdle']);

  await mouseClick(page, page.locator('#btn-export'));
  await expect(page.locator('#export-dest-place')).toHaveText('図と同じフォルダ（docs/api）');
  await mouseClick(page, page.locator('#export-dest-change'));
  await expect(pick).toBeVisible();
  const cur = page.locator('#export-dest-pick .edp-cur').first();
  const rootSlash = dir.split(path.sep).join('/');
  await expect(cur).toContainText('保存先: ' + rootSlash + ' ／ この図のフォルダ: docs/api ／ 今の書き出し先: 図と同じフォルダ（docs/api）');
  await expect(cur).not.toContainText('\\');
  await expect(page.locator('#export-dest-note')).toContainText('図のフォルダごとに覚えます');
  await expect(pick.locator('.edp-choice').first()).toHaveText('図と同じフォルダ (docs/api)');
  await expect(pick).not.toContainText('保存先の直下)');
  await page.screenshot({ path: testInfo.outputPath('sub-dest-pick.png') });
  await page.keyboard.press('Escape'); hands.keys++;
  await expect(pick).toHaveCount(0);

  const subSt = await exportSvg(page);
  expect(path.resolve(String(subSt))).toBe(path.resolve(path.join(dir, 'docs', 'api', 'st.svg')));
  await expect(page.locator('#status-save-result')).toContainText('st.svg → 図と同じフォルダ（docs/api）');
  await page.keyboard.press('Escape'); hands.keys++;

  // (3) 同じ名前の st は 2 枚 (out/st.svg と docs/api/st.svg) で、中身はそれぞれの図。黙った上書き 0。
  expect(fs.readFileSync(path.join(dir, 'out', 'st.svg'), 'utf8')).toContain('TopIdle');
  expect(fs.readFileSync(path.join(dir, 'docs', 'api', 'st.svg'), 'utf8')).toContain('SubIdle');

  // ディスクに増えたのは書き出した 3 枚だけ。.puml は 1 バイトも変わらない。
  await page.waitForTimeout(1200);
  const after = snapshot(dir);
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).concat(['out/seq.svg', 'out/st.svg', 'docs/api/st.svg']).sort());
  for (const f of Object.keys(before)) expect(after[f], f + ' は 1 バイトも変わらない').toBe(before[f]);

  // (4) 保存フォルダの一覧は届く範囲をそのまま書く。TICKET-roadmap-20261123-2358-3 で、まとめて書き出すは
  // サブフォルダの図にも届いた (サブフォルダの図は「サブフォルダの図」の節に道付きで並ぶ)。
  await S.openFolder(page);
  await expect(page.locator('#folder-scope')).toHaveText('件数・図種・タブで開くは保存先の直下の図です。サブフォルダの図は下の「サブフォルダの図」に道付きで並び、印を付けてまとめて書き出せます');
  await expect(page.locator('#folder-panel .folder-sub-item[data-sub-name="docs/api/st"]')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('folder-list.png') });
  H.annotate(testInfo, 'hands', 'clicks=' + hands.clicks + ' keys=' + hands.keys + ' drawMs=' + hands.drawMs);
  // 開いてから描けるまでは 3 秒以内。
  expect(hands.drawMs).toBeLessThanOrEqual(3000);
  expect(errors, errors.join('\n')).toEqual([]);
});
