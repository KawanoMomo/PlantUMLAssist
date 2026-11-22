// @ts-check
// primary 台本 場面 4「書き出し」手順 6:
//   場面 4 の全体の手数 (クリック数 + 打鍵数) と、書き出し 1 回・直しから再描画の時間を数える。
//   手順 2 (保存先の一覧から 3 枚を 1 枚ずつ開き、Export ▾ の SVG・PNG・PNG（透過背景）を出す) と
//   手順 4 (hand-seq を開き直し、`Open()` の 1 本を GUI で直して SVG を書き出し直す) を、利用者の手
//   (実マウスのクリック・1 字ずつの打鍵) だけで通して数える。
//   台本では persona-data の export-s4 の rev-seq・rev-class・hand-state を使うが、scenario は persona-data を
//   読まず fixture の hand-seq・hand-class・hand-state (と `!include` する common.puml) を使う。
//   クリック … ボタン・メニューの項目・図の要素・欄を押す 1 回 (一覧の図を開くダブルクリックは 1 手順 2・3 と同じく 1)
//   打鍵     … 打った字 1 字、Ctrl+A・Tab の 1 押し
// summary.json の tests[] に clicks / keys / hands (= clicks + keys) / renderMs (直しから再描画) /
// exportMs (Export ▾ の項目を押してからファイルを受け取るまでの、書き出し 1 回の最大) が出る。
// 期待 (principles.md「操作コストは計る」「押した対象だけが変わる」「描ける」):
//   - 手数は BASE (この scenario を作った時点の値) を超えない (前より悪くしない)。台本の操作数の 2 倍以内
//   - 書き出し 1 回・直しから再描画はどちらも 3 秒以内 (全体実行の負荷の下の上限)
//   - 直しの本文の差分は `Drv -> Bus : Open()` の 1 行だけ (消した 1 + 足した 1)。書き出しでは本文は動かない
//   - 直していない図 (common・hand-class・hand-state) は保存先で 1 バイトも変わらない。直した図が描ける
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const RENDER_MS_MAX = 3000;
const EXPORT_MS_MAX = 3000;
const DOCS = [
  { name: 'hand-seq', words: ['Drv', 'Open()', 'ready', 'Poll()'] },
  { name: 'hand-class', words: ['Drv', 'Mon', 'rate : uint16'] },
  { name: 'hand-state', words: ['Idle', 'Busy', 'Slow', 'Throttle'] },
];
const FILES = ['common'].concat(DOCS.map((d) => d.name));
const FORMATS = ['exp-svg', 'exp-png', 'exp-png-transparent'];
const LINE = 'Drv -> Bus : Open()';
const NEW_LABEL = 'Open(port)';
// 台本の操作数: 開く 4 (一覧を開く 2・選ぶ 1・閉じる 1) + 書き出し 2 x 3 を 3 枚、開き直し 4・直し 1・書き出し 2。
const SCRIPT_OPS = 3 * (4 + 2 * FORMATS.length) + 4 + 1 + 2;
// この scenario を作った時点の手数。製品の変更で手が増えたら赤にして知らせる (減ったらここを下げる)。
const BASE = { clicks: 38, keys: 12 };

function hands(page) {
  const n = { clicks: 0, keys: 0 };
  return {
    n,
    async click(loc, opts) { await loc.click(opts); n.clicks++; },
    async dblclick(loc) { await loc.dblclick(); n.clicks++; },
    async clickBox(loc, what) {
      await expect(loc).toBeAttached({ timeout: 15000 });
      await loc.scrollIntoViewIfNeeded();
      const box = await loc.boundingBox();
      if (!box) throw new Error('overlay box not found: ' + what);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      n.clicks++;
    },
    async type(text) { await page.keyboard.type(text); n.keys += text.length; },
    async press(key) { await page.keyboard.press(key); n.keys++; },
  };
}

// 保存先の右クリック「保存先の一覧を開く」から図を選んで開き、一覧を閉じる (4 手)。
async function openDoc(page, h, d, text) {
  await h.click(page.locator('#btn-tab-folder'), { button: 'right' });
  await h.click(page.locator('#files-ctx-menu [data-action="open-list"]'));
  await page.waitForSelector('#folder-panel.open.is-list');
  await h.dblclick(page.locator('#folder-panel .folder-item[data-file-name="' + d.name + '"]').first());
  await expect(page.locator('#editor')).toHaveValue(text, { timeout: 20000 });
  await H.waitDrawn(page, d.words);
  await h.click(page.locator('#folder-list-close'));
  await page.waitForSelector('#folder-panel:not(.is-list)', { state: 'attached' });
  await H.expectRendered(page);
}

// Export ▾ から 1 項目を選ぶ (2 手)。項目を押してからファイルを受け取るまでを書き出し 1 回の時間にする。
async function exportOnce(page, h, testInfo, label, itemId) {
  await h.click(page.locator('#btn-export'));
  await page.waitForSelector('#export-menu', { state: 'visible' });
  const t0 = Date.now();
  const wait = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await h.click(page.locator('#' + itemId));
  const dl = await wait;
  const ms = Date.now() - t0;
  expect(dl, label + ' の ' + itemId + ' を受け取れる').not.toBeNull();
  if (!dl) return ms;
  await dl.saveAs(testInfo.outputPath(label + '.' + itemId + (itemId === 'exp-svg' ? '.svg' : '.png')));
  H.annotate(testInfo, 'exportMs', ms);
  return ms;
}

test('primary 手順6 (場面4) 書き出しの全体の手数と、書き出し 1 回・直しから再描画の時間が上限内', async ({ page }, testInfo) => {
  test.setTimeout(150 * 1000);
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const orig = {};
  const text = {};
  for (const n of FILES) {
    orig[n] = fs.readFileSync(path.join(H.FIXTURES, n + '.puml'));
    text[n] = orig[n].toString('utf8').replace(/\r\n/g, '\n');
    fs.writeFileSync(path.join(dir, n + '.puml'), orig[n]);
  }

  await H.bootWithSaveDir(page, S.dirFor(__filename));
  const h = hands(page);
  const exportMs = [];

  // 手順 2: 3 枚を 1 枚ずつ開き、3 形式を書き出す。書き出しでは本文は動かない。
  for (const d of DOCS) {
    await openDoc(page, h, d, text[d.name]);
    const opened = await H.getEditorText(page);
    for (const f of FORMATS) exportMs.push(await exportOnce(page, h, testInfo, d.name, f));
    expect(H.diffLines(opened, await H.getEditorText(page)), d.name + ' を書き出した後の本文の差分').toBe(0);
  }

  // 手順 4: hand-seq を開き直し、図の Open() のメッセージを押して右パネルの文言を書き換える。
  const seq = DOCS[0];
  await openDoc(page, h, seq, text[seq.name]);
  const lineNo = text[seq.name].split('\n').indexOf(LINE) + 1;
  expect(lineNo, 'hand-seq に Open() の行がある').toBeGreaterThan(0);
  const r = await H.measure(page, testInfo, async () => {
    await h.clickBox(page.locator('#overlay-layer rect[data-type="message"][data-line="' + lineNo + '"]').first(), 'message ' + lineNo);
    await h.click(page.locator('.rle-textarea:visible').first());
    await h.press('Control+a');
    await h.type(NEW_LABEL);
    await h.press('Tab');
  }, [NEW_LABEL]);
  expect(r.diffLines, '直しの本文の差分').toBe(2);
  expect(H.removedLines(r.before, r.after), '消えた行').toEqual([LINE]);
  expect(H.removedLines(r.after, r.before), '足した行').toEqual(['Drv -> Bus : ' + NEW_LABEL]);
  await H.expectRendered(page);
  exportMs.push(await exportOnce(page, h, testInfo, seq.name + '.after', 'exp-svg'));

  // 手数と時間を記録する (summary.json の clicks / keys / hands / renderMs / exportMs)。
  const n = h.n;
  H.annotate(testInfo, 'clicks', n.clicks);
  H.annotate(testInfo, 'keys', n.keys);
  H.annotate(testInfo, 'hands', n.clicks + n.keys);
  console.log('primary 手順6 (場面4): clicks ' + n.clicks + ', keys ' + n.keys + ', hands ' + (n.clicks + n.keys) +
    ', exportMs max ' + Math.max(...exportMs) + ', renderMs ' + r.renderMs);
  expect(n.clicks, 'クリック数は前より増えない').toBeLessThanOrEqual(BASE.clicks);
  expect(n.keys, '打鍵数は前より増えない').toBeLessThanOrEqual(BASE.keys);
  expect(n.clicks + n.keys, '手数は台本の操作数の 2 倍以内').toBeLessThanOrEqual(SCRIPT_OPS * 2);
  expect(exportMs, '書き出しは 10 回').toHaveLength(3 * FORMATS.length + 1);
  expect(Math.max(...exportMs), '書き出し 1 回の時間').toBeLessThanOrEqual(EXPORT_MS_MAX);
  expect(r.renderMs, '直しから再描画までの時間').not.toBeNull();
  expect(r.renderMs, '直しから再描画までの時間').toBeLessThanOrEqual(RENDER_MS_MAX);

  // 直していない図は保存先で 1 バイトも変わらない。直した図は描ける。
  await page.waitForTimeout(1500);
  for (const nm of ['common', 'hand-class', 'hand-state']) {
    expect(Buffer.compare(fs.readFileSync(path.join(dir, nm + '.puml')), orig[nm]), nm + '.puml は変わらない').toBe(0);
  }
  await H.waitDrawn(page, [NEW_LABEL, 'ready', 'Poll()']);
  await H.expectRendered(page);
});
