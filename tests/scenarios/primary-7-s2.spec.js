// @ts-check
// primary 台本 場面 2「手書きの既存の図を開いて直す」手順 7:
//   場面 2 の全体の手数 (クリック数 + 打鍵数) と、直しから描画までの時間を数えて記録する。
//   手順 2〜5 を、利用者の手 (実マウスのクリック・1 字ずつの打鍵) だけで通して数える。
//     手順 2 … 保存先の一覧から hand-seq・hand-state・hand-class を 1 枚ずつ開く (開いただけで本文は不変・描ける)
//     手順 3 … 各図の 1 か所を GUI で直す (メッセージの文言・遷移の条件・属性の型)
//     手順 4 … hand-seq で、字下げしたコメント行の直下 (ready の前) に GUI で 1 行を足す
//     手順 5 … 本文の欄で Ctrl+Z 1 回 (足した行だけが戻る)、Ctrl+S (保存先のバイトが画面と一致、LF・UTF-8 のまま)
//   クリック … ボタン・項目・図の要素・欄を押す 1 回 (一覧の図を開くダブルクリックは 1)。プルダウン (select) は開く + 選ぶで 2
//   打鍵     … 打った字 1 字、Ctrl+A・Tab・Ctrl+Z・Ctrl+S の 1 押し
// summary.json の tests[] に clicks / keys / hands / renderMs (直しごと) / diffLines が出る。
// 期待 (principles.md「操作コストは計る」「押した対象だけが変わる」「描ける」):
//   - 手数は BASE (この scenario を作った時点の値) を超えない (前より悪くしない)
//   - 直しから描画までは 3 秒以内 (全体実行の負荷の下の上限)
//   - 直しの差分は直した 1 行 (消した 1 + 足した 1)、足しは 1 行。Ctrl+Z 1 回で足しだけが戻る
//   - 保存した hand-seq は画面の本文と 1 バイトも違わない。直していない common は 1 バイトも変わらない。直した図が描ける
// 図: tests/scenarios/fixtures/ の hand-seq・hand-state・hand-class・common (自作の小さい図)。置くときに LF・BOM 無しで書く。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const RENDER_MS_MAX = 3000;
// この scenario を作った時点の手数。製品の変更で手が増えたら赤にして知らせる (減ったらここを下げる)。
const BASE = { clicks: 28, keys: 36 };
const COMMENT = "    ' 字下げは手で揃えたもの";

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
    async select(loc, value) { await loc.selectOption(value); n.clicks += 2; },
    // 欄を押して打つ。replace のときは Ctrl+A で入っている字を選んでから打つ。
    async type(loc, text, replace) {
      await loc.click();
      n.clicks++;
      if (replace) { await page.keyboard.press('Control+a'); n.keys++; }
      await page.keyboard.type(text);
      n.keys += text.length;
    },
    async press(key) { await page.keyboard.press(key); n.keys++; },
  };
}

// 保存先の右クリック「保存先の一覧を開く」から図を選んで開き、一覧を閉じる (4 手)。
async function openDoc(page, h, name, text, words) {
  await h.click(page.locator('#btn-tab-folder'), { button: 'right' });
  await h.click(page.locator('#files-ctx-menu [data-action="open-list"]'));
  await page.waitForSelector('#folder-panel.open.is-list');
  await h.dblclick(page.locator('#folder-panel .folder-item[data-file-name="' + name + '"]').first());
  await expect(page.locator('#editor')).toHaveValue(text, { timeout: 20000 });
  await H.waitDrawn(page, words);
  await h.click(page.locator('#folder-list-close'));
  await page.waitForSelector('#folder-panel:not(.is-list)', { state: 'attached' });
  await H.expectRendered(page);
}

// 直した 1 行だけが変わった (消えた行・足した行・位置・ほかの行) を見る。
function expectOneLineEdit(r, name, oldLine, want) {
  expect(r.diffLines, name + ' の差分行数').toBe(2);
  expect(H.removedLines(r.before, r.after), name + ' の消えた行').toEqual([oldLine]);
  const added = H.removedLines(r.after, r.before);
  expect(added, name + ' の足した行').toHaveLength(1);
  expect(added[0], name + ' の直した行 (字下げを保つ)').toMatch(want);
  const b = r.before.split('\n');
  const a = r.after.split('\n');
  expect(a.length, name + ' の行数').toBe(b.length);
  for (let i = 0; i < b.length; i++) {
    if (b[i] !== oldLine) expect(a[i], name + ' の ' + (i + 1) + ' 行目').toBe(b[i]);
  }
}

function expectFast(r, what) {
  expect(r.renderMs, 'renderMs for ' + what).not.toBeNull();
  expect(r.renderMs, 'renderMs for ' + what).toBeLessThanOrEqual(RENDER_MS_MAX);
}

test('primary 手順7 (場面2) 手書きの図を開いて直す全体の手数と、直しから描画までの時間が上限内', async ({ page }, testInfo) => {
  test.setTimeout(150 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const text = {};
  for (const n of ['common', 'hand-seq', 'hand-state', 'hand-class']) {
    // 取り出し方 (autocrlf) に左右されないよう、置くバイトはここで決める (LF・BOM 無し)。
    text[n] = H.fixture(n + '.puml').replace(/\r\n/g, '\n');
    fs.writeFileSync(path.join(dir, n + '.puml'), Buffer.from(text[n], 'utf8'));
  }
  const commonBytes = fs.readFileSync(path.join(dir, 'common.puml'));
  await H.bootWithSaveDir(page, S.dirFor(__filename));
  const h = hands(page);
  const renderMs = [];

  // --- hand-seq: 開く (手順 2) → 文言の直し (手順 3) → コメント直下に 1 行 (手順 4) → Ctrl+Z・Ctrl+S (手順 5)
  await openDoc(page, h, 'hand-seq', text['hand-seq'], ['Drv', 'Open()', 'ready', 'Poll()']);
  expect(await H.getEditorText(page), 'hand-seq は開いただけでは変わらない').toBe(text['hand-seq']);
  const readyLine = '    Bus --> Drv : ready';
  const readyNo = text['hand-seq'].split('\n').indexOf(readyLine) + 1;
  expect(readyNo, 'hand-seq に ready の行がある').toBeGreaterThan(0);
  const rSeq = await H.measure(page, testInfo, async () => {
    await h.clickBox(page.locator('#overlay-layer rect[data-type="message"][data-line="' + readyNo + '"]').first(), 'message ready');
    await h.type(page.locator('.rle-textarea:visible').first(), 'ready(ok)', true);
    await h.press('Tab');
  }, ['ready(ok)']);
  expectFast(rSeq, 'hand-seq ready(ok)');
  expectOneLineEdit(rSeq, 'hand-seq', readyLine, /^ {4}Bus --> Drv : ready\(ok\)$/);
  renderMs.push(rSeq.renderMs);

  const commentAt = rSeq.after.split('\n').indexOf(COMMENT);
  expect(commentAt, 'hand-seq に字下げしたコメント行がある').toBeGreaterThan(0);
  const anchorNo = commentAt + 2; // コメント行の直下 (1 始まり)
  // 直した ready(ok) は選ばれたまま (同じ要素をもう一度押すと選択が外れる) なので、右パネルからそのまま足す。
  await expect(page.locator('#props-content'), '直したメッセージが選ばれたまま').toContainText(anchorNo + ' 行目');
  const rIns = await H.measure(page, testInfo, async () => {
    await h.click(page.locator('#props-content .seq-insert-msg-before').first());
    const modal = page.locator('#seq-modal');
    await expect(modal).toBeVisible();
    await h.select(page.locator('#seq-mod-from'), 'Mon');
    await h.select(page.locator('#seq-mod-to'), 'Drv');
    await h.type(page.locator('#seq-modal .rle-textarea').first(), 'status', false);
    await h.click(page.locator('#seq-mod-confirm'));
    await expect(modal).toBeHidden();
  }, ['status']);
  expectFast(rIns, 'hand-seq status');
  expect(rIns.diffLines, 'コメント直下に足した差分').toBe(1);
  expect(H.removedLines(rIns.before, rIns.after), '足しで消えた行').toEqual([]);
  const insLines = rIns.after.split('\n');
  expect(insLines[commentAt], 'コメント行 (字下げを含む)').toBe(COMMENT);
  expect(insLines[commentAt + 1], 'コメント行の直下に足した行').toMatch(/^\s*Mon\s*->\s*Drv\s*:\s*status\s*$/);
  expect(insLines[commentAt + 2], '押した行 (字下げを保つ)').toBe('    Bus --> Drv : ready(ok)');
  renderMs.push(rIns.renderMs);

  // 手順 5: 本文の欄で Ctrl+Z 1 回 → 足した行だけが戻る。Ctrl+S → 保存先が画面と一致。
  await h.click(page.locator('#editor'));
  await h.press('Control+z');
  await expect.poll(() => H.getEditorText(page), { timeout: 5000 }).toBe(rSeq.after);
  await h.press('Control+s');
  await expect(page.locator('#status-save-result')).toContainText('保存しました', { timeout: 20000 });
  await expect(page.locator('#status-format')).toHaveText('LF · UTF-8');
  const seqFile = path.join(dir, 'hand-seq.puml');
  await expect.poll(() => fs.readFileSync(seqFile, 'utf8'), { timeout: 10000 }).toBe(rSeq.after);
  expect(Buffer.compare(fs.readFileSync(seqFile), Buffer.from(rSeq.after, 'utf8')), '保存先のバイトは画面の本文 (LF・BOM 無し)').toBe(0);
  await H.waitDrawn(page, ['ready(ok)', 'Open()', 'Poll()']);
  await H.expectRendered(page);

  // --- hand-state: 開く → 遷移 Throttle の条件を Throttle2 へ
  await openDoc(page, h, 'hand-state', text['hand-state'], ['Idle', 'Busy', 'Slow', 'Throttle']);
  expect(await H.getEditorText(page), 'hand-state は開いただけでは変わらない').toBe(text['hand-state']);
  const thrLine = 'Busy  --> Slow : Throttle';
  const rSt = await H.measure(page, testInfo, async () => {
    await h.click(page.locator('#props-content div:has(> .st-tr-pick)', { hasText: 'Throttle' }).first().locator('.st-tr-pick'));
    await h.type(page.locator('#st-tr-trig'), 'Throttle2', true);
    await h.click(page.locator('#st-tr-update'));
  }, ['Throttle2']);
  expectFast(rSt, 'hand-state Throttle2');
  expectOneLineEdit(rSt, 'hand-state', thrLine, /^Busy {2}--> Slow : Throttle2$/);
  renderMs.push(rSt.renderMs);
  await H.expectRendered(page);

  // --- hand-class: 開く → 図の属性 rate を押し、型を uint32 へ
  await openDoc(page, h, 'hand-class', text['hand-class'], ['Drv', 'Mon', 'rate : uint16']);
  expect(await H.getEditorText(page), 'hand-class は開いただけでは変わらない').toBe(text['hand-class']);
  const rateLine = '  - rate : uint16';
  const rateNo = text['hand-class'].split('\n').indexOf(rateLine) + 1;
  expect(rateNo, 'hand-class に rate の行がある').toBeGreaterThan(0);
  const rCl = await H.measure(page, testInfo, async () => {
    const hit = page.locator('#overlay-layer rect[data-type="member"][data-parent-id="Drv"][data-line="' + rateNo + '"]').first();
    await h.clickBox(hit, 'member rate');
    const mi = await hit.getAttribute('data-member-index');
    const type = page.locator('#cl-mem-type-' + mi);
    if (!(await type.isVisible())) await h.click(page.locator('#cl-mem-edit-' + mi));
    await expect(type).toHaveValue('uint16');
    await h.type(type, 'uint32', true);
    await h.click(page.locator('#cl-mem-update-' + mi));
  }, ['rate : uint32']);
  expectFast(rCl, 'hand-class uint32');
  expectOneLineEdit(rCl, 'hand-class', rateLine, /^ {2}- rate : uint32$/);
  renderMs.push(rCl.renderMs);
  await H.expectRendered(page);

  // 手数と時間を記録する (summary.json の clicks / keys / hands / renderMs)。
  const n = h.n;
  H.annotate(testInfo, 'clicks', n.clicks);
  H.annotate(testInfo, 'keys', n.keys);
  H.annotate(testInfo, 'hands', n.clicks + n.keys);
  console.log('primary 手順7 (場面2): clicks ' + n.clicks + ', keys ' + n.keys + ', hands ' + (n.clicks + n.keys) +
    ', renderMs ' + renderMs.join(' / ') + ' (max ' + Math.max(...renderMs) + ')');
  expect(n.clicks, 'クリック数は前より増えない').toBeLessThanOrEqual(BASE.clicks);
  expect(n.keys, '打鍵数は前より増えない').toBeLessThanOrEqual(BASE.keys);

  // !include される common.puml は直していないので 1 バイトも変わらない。
  expect(Buffer.compare(fs.readFileSync(path.join(dir, 'common.puml')), commonBytes), 'common.puml は変わらない').toBe(0);
  expect(errors, errors.join('\n')).toEqual([]);
});
