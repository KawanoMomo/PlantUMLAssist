// @ts-check
// primary 台本 場面 2「手書きの既存の図を開いて直す」手順 4:
//   1 枚 (hand-seq) で、手書きのコメント行の直下に GUI で 1 行を足し、コメントと字下げが崩れないか。
//   保存先の一覧から hand-seq を開き、字下げしたコメント「    ' 字下げは手で揃えたもの」の直下にある
//   メッセージ ready を図で押して「↑ この前にメッセージ追加」→ 始点 Mon・終点 Drv・本文 status で確定する。
// 期待 (principles.md「押した対象だけが変わる」「描ける」「手書きや他の道具で作った .puml は壊さず開ける」):
//   - 本文の差分は足した 1 行だけ (消える・書き換わる行は 0)。足した行はコメント行の直下 (押した ready の直前) に入る
//   - コメント行 (行頭の字下げを含む)・字下げした ready の行・skinparam・!include・ほかの全行は 1 字も動かない
//   - 足した図がエラー無しで描け、新しい本文が図に出る。操作から描画までは上限 (3 秒) 以内
//   - 1 操作の差分行数と描画までの時間は H.measure が summary.json に残す
// 図: tests/scenarios/fixtures/ の hand-seq・common (自作の小さい図)。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const RENDER_MS_MAX = 3000;
const COMMENT = "    ' 字下げは手で揃えたもの";
const ANCHOR = '    Bus --> Drv : ready';

// 図の要素を実マウスで押す (合成イベントは当たり判定を素通りするので使わない)。
async function clickHit(page, locator, what) {
  await expect(locator).toBeAttached({ timeout: 15000 });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('overlay box not found: ' + what);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

function count(re, s) { return (String(s).match(re) || []).length; }

test('primary 手順4 (場面2) 手書きのコメント行の直下に GUI で 1 行を足しても、コメントと字下げが崩れない', async ({ page }, testInfo) => {
  test.setTimeout(120 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const orig = {};
  for (const n of ['common', 'hand-seq']) {
    orig[n] = fs.readFileSync(path.join(H.FIXTURES, n + '.puml'));
    fs.writeFileSync(path.join(dir, n + '.puml'), orig[n]);
  }
  await H.bootWithSaveDir(page, S.dirFor(__filename));

  // 保存先の一覧から hand-seq を開く。開いただけでは本文は変わらず、描ける。
  const text = orig['hand-seq'].toString('utf8').replace(/\r\n/g, '\n');
  await S.openFolder(page);
  await page.locator('#folder-panel .folder-item[data-file-name="hand-seq"]').first().dblclick();
  await expect(page.locator('#editor')).toHaveValue(text, { timeout: 20000 });
  await H.waitDrawn(page, ['Drv', 'Open()', 'ready', 'Poll()']);
  await S.closeFolderList(page);
  await expect(page.locator('#diagram-type')).toHaveValue('plantuml-sequence');
  await H.expectRendered(page);

  const lines = text.split('\n');
  const commentAt = lines.indexOf(COMMENT);
  expect(commentAt, 'hand-seq に字下げしたコメント行がある').toBeGreaterThan(0);
  expect(lines[commentAt + 1], 'コメント行の直下は ready のメッセージ').toBe(ANCHOR);
  const anchorLineNo = commentAt + 2; // 1 始まり

  let ops = 0;
  const r = await H.measure(page, testInfo, async () => {
    // 図の ready を押し、右パネルの「↑ この前にメッセージ追加」で挿入の窓を開く。
    const hit = page.locator('#overlay-layer rect[data-type="message"][data-line="' + anchorLineNo + '"]').first();
    await clickHit(page, hit, 'message ready (line ' + anchorLineNo + ')');
    await expect(page.locator('#props-content')).toContainText(anchorLineNo + ' 行目');
    await page.locator('#props-content .seq-insert-msg-before').first().click();
    const modal = page.locator('#seq-modal');
    await expect(modal).toBeVisible();
    await page.locator('#seq-mod-from').selectOption('Mon');
    await page.locator('#seq-mod-to').selectOption('Drv');
    await page.locator('#seq-modal .rle-textarea').first().fill('status');
    await page.locator('#seq-mod-confirm').click();
    await expect(modal).toBeHidden();
    ops += 6;
  }, ['status']);
  H.annotate(testInfo, 'ops', ops);

  // 押した対象だけが変わる: 差分は足した 1 行だけで、消える・書き換わる行は無い。
  expect(r.diffLines, '差分行数').toBe(1);
  expect(H.removedLines(r.before, r.after), '消えた行').toEqual([]);
  const added = H.removedLines(r.after, r.before);
  expect(added, '足した行').toHaveLength(1);
  expect(added[0], '足した行の中身').toMatch(/^\s*Mon\s*->\s*Drv\s*:\s*status\s*$/);

  // 足した行はコメント行の直下 (押した ready の直前)。コメントも ready も字下げごとそのまま。
  const afterLines = r.after.split('\n');
  expect(afterLines.length).toBe(lines.length + 1);
  expect(afterLines[commentAt], 'コメント行 (字下げを含む)').toBe(COMMENT);
  expect(afterLines[commentAt + 1], 'コメント行の直下に足した行').toBe(added[0]);
  expect(afterLines[commentAt + 2], '押した ready の行 (字下げを保つ)').toBe(ANCHOR);
  // ほかの行は 1 字も動かない (足した行の前は同じ位置、後ろは 1 行ずれた位置)。
  for (let i = 0; i < lines.length; i++) {
    const j = i <= commentAt ? i : i + 1;
    expect(afterLines[j], 'hand-seq の ' + (i + 1) + ' 行目').toBe(lines[i]);
  }
  // コメント・skinparam・!include の数も不変。
  expect(count(/^\s*'/gm, r.after)).toBe(count(/^\s*'/gm, r.before));
  expect(count(/skinparam/g, r.after)).toBe(count(/skinparam/g, r.before));
  expect(r.after).toMatch(/^!include common\.puml$/m);

  // 描ける
  await H.expectRendered(page);
  await H.waitDrawn(page, ['status', 'ready', 'Open()', 'Poll()']);
  expect(r.renderMs, '操作から描画まで').toBeLessThanOrEqual(RENDER_MS_MAX);
  await page.screenshot({ path: testInfo.outputPath('primary-4-s2.png') });

  // !include される common.puml は直していないので 1 バイトも変わらない。
  expect(Buffer.compare(fs.readFileSync(path.join(dir, 'common.puml')), orig.common), 'common.puml は変わらない').toBe(0);
  expect(errors, errors.join('\n')).toEqual([]);
});
