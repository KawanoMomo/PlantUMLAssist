// @ts-check
// TICKET-roadmap-20261123-2358-1 (roadmap v9.0 必須 2・クライテリア 2): 「クリップボードにコピー」も押した図の今の本文の図を写す。
// /render の応答を 1500ms 遅らせる (scenario の中だけ。renderMs は出さない)。headless ではクリップボードの画像を読めない
// 版があるので、書き込み (navigator.clipboard.write に渡った PNG) を見張って確かめる。操作は実マウス・実キーのまま。
// 期待:
//   (1) 保存先から開いた図に状態を 1 つ足した直後に Export ▾ →「クリップボードにコピー」: 届くまで下端に待つ旨が出て、
//       写した PNG は足した後の図 (幅・高さが足した後の SVG × 倍率、四隅が白)。下端が写したことと画素数を言う
//   (2) 図を開いた直後に Ctrl+Shift+C: 待ってから、その図の PNG を 1 回だけ写す
//   (3) 待つ間にタブを替えた: 写さずに理由を言う (別の図を写さない)
//   (4) 白紙に 1 つ足した直後 (まだ絵が無い): 待ってから足した後の図を写す
//   (5) 描けない本文: 写さずに知らせ、クリップボードは押す前の中身のまま (書き込みが増えない)
//   (6) 遅れの無い既定の速さでも、押せばすぐ写して画素数を言う
//   .puml は全部バイト一致、増えたファイル 0。押して何も起きず何も言わないが 0
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const WAIT = '描き直しが届いたらクリップボードに写します';
const DONE = 'クリップボードに写しました';

async function slowRender(page, ms) {
  await page.route('**/render', async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}
// クリップボードへの書き込みを見張る (中身は PNG の base64)。書き込みそのものはブラウザへ渡す。
async function watchClipboard(page, context) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await page.addInitScript(() => {
    // @ts-ignore
    window.__clipPng = [];
    const cb = navigator.clipboard;
    if (!cb || !cb.write) return;
    const orig = cb.write.bind(cb);
    cb.write = async function(items) {
      try {
        for (const it of items) {
          if (it.types.indexOf('image/png') >= 0) {
            const b = await it.getType('image/png');
            const buf = new Uint8Array(await b.arrayBuffer());
            let s = '';
            for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
            // @ts-ignore
            window.__clipPng.push(btoa(s));
          }
        }
      } catch (e) { /* 見張りの失敗で書き込みを止めない */ }
      return orig(items);
    };
  });
}
async function clipCount(page) { return page.evaluate(() => /** @type {any} */ (window).__clipPng.length); }
async function lastClip(page) {
  const b64 = await page.evaluate(() => { const a = /** @type {any} */ (window).__clipPng; return a[a.length - 1]; });
  return H.decodePng(Buffer.from(b64, 'base64'));
}
async function clipSeq(page) { return Number((await page.locator('#status-save-result').getAttribute('data-clip-seq')) || 0); }
async function waitClipSeq(page, n) {
  await page.waitForFunction((k) => Number(document.getElementById('status-save-result').getAttribute('data-clip-seq') || 0) > k, n, { timeout: 20000 });
}
async function svgSize(page) {
  return page.evaluate(() => {
    const svg = /** @type {SVGSVGElement} */ (document.querySelector('#preview-svg svg'));
    return { w: parseFloat(svg.getAttribute('width') || '0'), h: parseFloat(svg.getAttribute('height') || '0') };
  });
}
function corners(img) {
  const at = (x, y) => Array.from(img.px.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4));
  return [at(0, 0), at(img.w - 1, 0), at(0, img.h - 1), at(img.w - 1, img.h - 1)];
}
function expectScaled(img, size, what) {
  expect(Math.abs(img.w - size.w * H.PNG_SCALE), what + ' の幅は SVG × 倍率').toBeLessThanOrEqual(1);
  expect(Math.abs(img.h - size.h * H.PNG_SCALE), what + ' の高さは SVG × 倍率').toBeLessThanOrEqual(1);
  for (const c of corners(img)) expect(c, what + ' の四隅は白').toEqual([255, 255, 255, 255]);
}
async function addState(page, name) {
  const chip = page.locator('#st-tail-kind-chip-state');
  if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click();
  await page.locator('#st-tail-id').fill(name);
  await page.locator('#st-tail-add').click();
  await expect.poll(() => H.getEditorText(page)).toContain(name);
}
async function menuClipboard(page) {
  await page.locator('#btn-export').click();
  await page.locator('#exp-clipboard').click();
}
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

test('roadmap 2358-1 保存先の図: 足した直後・開いた直後に写すと待ってから今の本文の図を写し、タブを替えたら写さない (描き直し 1.5 秒遅れ)', async ({ page, context }, testInfo) => {
  test.setTimeout(150 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  const dir = path.join(S.absDirFor(__filename), 'proj');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'st.puml'), '@startuml\n[*] --> Idle\n@enduml\n');
  fs.writeFileSync(path.join(dir, 'other.puml'), '@startuml\n[*] --> OtherOnly\nOtherOnly --> Second\n@enduml\n');
  await watchClipboard(page, context);
  await slowRender(page, 1500);
  await H.bootWithSaveDir(page, S.dirFor(__filename) + '/proj');
  const before = snapshot(dir);
  const st = page.locator('#status-save-result');

  // (1) st を開き、描けてから状態 Busy を足し、描き直しを待たずに Export ▾ →「クリップボードにコピー」。
  await page.locator('#files-parts .files-part-file[data-file-name="st"]').click();
  await H.waitDrawn(page, ['Idle']);
  const size0 = await svgSize(page);
  await addState(page, 'Busy');
  let n = await clipSeq(page);
  await menuClipboard(page);
  await expect(st).toContainText(WAIT, { timeout: 1000 });
  await page.screenshot({ path: testInfo.outputPath('clip-wait.png') });
  await waitClipSeq(page, n);
  await expect(st).toHaveAttribute('data-clip-ok', '1');
  expect(await clipCount(page), '1 回だけ写す').toBe(1);
  expect(await H.svgText(page)).toContain('Busy');
  const size1 = await svgSize(page);
  const p1 = await lastClip(page);
  expectScaled(p1, size1, '足した後の図');
  expect(p1.w === Math.round(size0.w * H.PNG_SCALE) && p1.h === Math.round(size0.h * H.PNG_SCALE), '足す前の図を写さない').toBe(false);
  await expect(st).toHaveAttribute('data-full', new RegExp(DONE + ': ' + p1.w + '×' + p1.h + ' px'));
  await page.screenshot({ path: testInfo.outputPath('clip-done.png') });

  // (2) other を開いた直後に Ctrl+Shift+C。待ってから other の図を 1 回だけ写す。
  await page.locator('#files-parts .files-part-file[data-file-name="other"]').click();
  // 本文が other に替わった (タブが開いた) 直後、描き直しが届く前に押す。
  await expect.poll(() => H.getEditorText(page)).toContain('OtherOnly');
  expect(await H.svgText(page), 'まだ other の絵は届いていない').not.toContain('OtherOnly');
  const clips1 = await clipCount(page);
  n = await clipSeq(page);
  await page.keyboard.press('Control+Shift+C');
  await expect(st).toContainText(WAIT, { timeout: 1000 });
  await waitClipSeq(page, n);
  await expect(st).toHaveAttribute('data-clip-ok', '1');
  expect(await clipCount(page)).toBe(clips1 + 1);
  expect(await H.svgText(page)).toContain('OtherOnly');
  expectScaled(await lastClip(page), await svgSize(page), '開いた直後の other');

  // (3) other に状態を足して写すを押し、届く前に st のタブへ替える。写さずに理由を言う。
  await addState(page, 'Extra');
  n = await clipSeq(page);
  await menuClipboard(page);
  await expect(st).toContainText(WAIT, { timeout: 1000 });
  await page.locator('#files-parts .files-part-file[data-file-name="st"]').click();
  await waitClipSeq(page, n);
  await expect(st).toHaveAttribute('data-clip-ok', '0');
  await expect(st).toContainText('写しませんでした: 待っている間に別の図に替えました');
  await page.waitForTimeout(2000);
  expect(await clipCount(page), 'タブを替えたら写さない').toBe(clips1 + 1);

  // 保存先に増えたファイルは 0 (写しはファイルを作らない)。
  const after = snapshot(dir);
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  expect(dialogs).toEqual([]);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('roadmap 2358-1 白紙に 1 つ足した直後も待ってから写し、描けない本文は写さずに知らせ、遅れが無ければすぐ写す', async ({ page, context }, testInfo) => {
  test.setTimeout(120 * 1000);
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  let downloads = 0;
  page.on('download', () => { downloads++; });
  await watchClipboard(page, context);
  await slowRender(page, 1500);
  await H.bootWith(page, null);
  const st = page.locator('#status-save-result');

  // (4) 白紙の状態遷移図に 1 つ足した直後 (まだ絵が無い) に写す。
  await page.locator('#btn-tab-new').click();
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await expect(page.locator('#preview-svg svg[data-blank-canvas="1"]')).toHaveCount(1, { timeout: 20000 });
  await addState(page, 'Fresh');
  let n = await clipSeq(page);
  await menuClipboard(page);
  await expect(st).toContainText(WAIT, { timeout: 1000 });
  await waitClipSeq(page, n);
  await expect(st).toHaveAttribute('data-clip-ok', '1');
  expect(await clipCount(page)).toBe(1);
  expect(await H.svgText(page)).toContain('Fresh');
  expectScaled(await lastClip(page), await svgSize(page), '白紙に足した図');

  // (5) 描けない本文: 写さずに知らせ、書き込みは増えない。
  const good = await H.getEditorText(page);
  await H.setText(page, '@startuml\nstate Fresh\nFresh --> \n}}} ((( broken\n@enduml\n');
  n = await clipSeq(page);
  await menuClipboard(page);
  await waitClipSeq(page, n);
  await expect(st).toHaveAttribute('data-clip-ok', '0');
  await expect(st).toContainText('写しませんでした');
  await expect(st).toContainText('クリップボードは前のまま');
  await page.waitForTimeout(1500);
  expect(await clipCount(page), '描けない本文では写さない').toBe(1);
  await page.screenshot({ path: testInfo.outputPath('clip-error.png') });

  // (6) 遅れを外して直した本文に戻し、描けてから写す: 待たずにすぐ写して画素数を言う。
  await page.unroute('**/render');
  await H.setText(page, good);
  await H.waitDrawn(page, ['Fresh']);
  await H.expectRendered(page);
  await page.waitForTimeout(400);
  n = await clipSeq(page);
  await menuClipboard(page);
  await waitClipSeq(page, n);
  await expect(st).toHaveAttribute('data-clip-ok', '1');
  expect(await clipCount(page)).toBe(2);
  const p = await lastClip(page);
  expectScaled(p, await svgSize(page), '遅れの無い写し');
  await expect(st).toHaveAttribute('data-full', new RegExp(DONE + ': ' + p.w + '×' + p.h + ' px'));
  expect(downloads).toBe(0);
  expect(dialogs).toEqual([]);
});
