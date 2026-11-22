// @ts-check
// primary 台本 場面 3「レビュー指摘の反映」手順 3:
//   指摘の 5 件を、同名ラベルが混ざる図から押した 1 件だけ図から直す
//   (seq はメッセージのラベル 3 件、class は属性 1 件、state は遷移の条件 1 件)。
// 期待 (principles.md「押した対象だけが変わる」「描ける」「操作コストは計る」):
//   - 1 件の直しで本文の差分は直した 1 行だけ (消えた 1 行 + 足した 1 行 = 2)。直した行は同じ位置にあり、
//     行頭の字下げ・矢印の前後の空白の幅を保ち、直した値の字だけが変わる (完全一致で見る)
//   - 同名の他の行 (同じラベルの別のメッセージ・別クラスの同名属性・同じ条件の別の遷移)・コメント・skinparam は 1 字も動かない
//   - 直した図がエラー無しで描け、新しい文言が図に出る。操作から描画までは上限 (3 秒) 以内
// 図: tests/scenarios/fixtures/ の rev-s3-seq (primary の写しの元・同名ラベル Open()/Read()/done)・
//     rev-class-crlf (Drv と DrvMon に同名の speed : int。保存先には rev-class の名で置く)・
//     rev-s3-state (同じ条件 Tick [load > 80] の遷移が 2 本)。どれも自作の小さい図。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const RENDER_MS_MAX = 3000;
const SRC = { 'rev-seq': 'rev-s3-seq', 'rev-class': 'rev-class-crlf', 'rev-state': 'rev-s3-state' };

// 図の要素を実マウスで押す (合成イベントは当たり判定を素通りするので使わない)。
async function clickHit(page, locator, what) {
  await expect(locator).toBeAttached({ timeout: 15000 });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('overlay box not found: ' + what);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

// 図のメッセージ (行 lineNo) を押し、右パネルのラベルを書き換える。手数 = 押す 1 + 欄 1 + 全選択 1 + 打鍵 + Tab 1。
function seqLabel(value) {
  return async (page, lineNo) => {
    const hit = page.locator('#overlay-layer rect[data-type="message"][data-line="' + lineNo + '"]').first();
    await clickHit(page, hit, 'message line ' + lineNo);
    const ta = page.locator('.rle-textarea:visible').first();
    await ta.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type(value);
    await page.keyboard.press('Tab');
    return 4 + value.length;
  };
}

const DOCS = [
  {
    name: 'rev-seq', type: 'plantuml-sequence', words: ['CtlMon', 'Open()', 'Read()', 'done'],
    fixes: [
      // Open() は 3 本。字下げした Bus -> Dev と Ctl -> Bus の Open() は動かない。
      { line: 'CtlMon -> Bus : Open()', want: 'CtlMon -> Bus : Open(mon)', drawn: ['Open(mon)'], edit: seqLabel('Open(mon)'),
        keep: ['Ctl -> Bus : Open()', '    Bus -> Dev : Open()'] },
      // Read() は 2 本。押した CtlMon 側だけ。
      { line: 'CtlMon -> Bus : Read()', want: 'CtlMon -> Bus : Read(1)', drawn: ['Read(1)'], edit: seqLabel('Read(1)'),
        keep: ['Ctl -> Bus : Read()'] },
      // done は 2 本。押した Ctl 宛てだけ。
      { line: 'Bus --> Ctl : done', want: 'Bus --> Ctl : ok', drawn: ['ok'], edit: seqLabel('ok'),
        keep: ['Bus --> CtlMon : done'] },
    ],
  },
  {
    name: 'rev-class', type: 'plantuml-class', words: ['Drv', 'DrvMon', 'speed : int'],
    fixes: [
      // speed : int は Drv と DrvMon の 2 か所。図の Drv 側を押して型を直す。
      { line: '  - speed : int', want: '  - speed : long', drawn: ['speed : long'], keep: [],
        edit: async (page, lineNo) => {
          const hit = page.locator('#overlay-layer rect[data-type="member"][data-parent-id="Drv"][data-line="' + lineNo + '"]').first();
          await clickHit(page, hit, 'member speed (line ' + lineNo + ')');
          const mi = await hit.getAttribute('data-member-index');
          const type = page.locator('#cl-mem-type-' + mi);
          let ops = 1;
          if (!(await type.isVisible())) { await page.locator('#cl-mem-edit-' + mi).click(); ops += 1; }
          await expect(type).toHaveValue('int');
          await type.fill('long');
          await page.locator('#cl-mem-update-' + mi).click();
          return ops + 1 + 'long'.length + 1;
        } },
    ],
  },
  {
    name: 'rev-state', type: 'plantuml-state', words: ['Idle', 'Busy', 'Slow', 'Tick'],
    fixes: [
      // 条件 [load > 80] は 2 本。図の Idle --> Slow の線を押して条件だけを直す。
      { line: '  Idle --> Slow : Tick [load > 80]', want: '  Idle --> Slow : Tick [load > 95]', drawn: ['load > 95'],
        keep: ['Busy  --> Slow : Tick [load > 80]'],
        edit: async (page, lineNo) => {
          const hit = page.locator('#overlay-layer [data-type="transition"][data-line="' + lineNo + '"]').first();
          await clickHit(page, hit, 'transition line ' + lineNo);
          await expect(page.locator('#st-tr-head'), '押した遷移が右パネルに開く').toContainText(lineNo + ' 行目');
          await expect(page.locator('#st-tr-guard')).toHaveValue('load > 80');
          await page.locator('#st-tr-guard').fill('load > 95');
          await page.locator('#st-tr-update').click();
          return 1 + 1 + 'load > 95'.length + 1;
        } },
    ],
  },
];

function count(re, s) { return (String(s).match(re) || []).length; }

test('primary 手順3 (場面3) 同名ラベルの混ざる 3 図で指摘の 5 件を 1 件ずつ図から直しても、押した行だけが変わる', async ({ page }, testInfo) => {
  test.setTimeout(150 * 1000);
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const orig = {};
  for (const n of Object.keys(SRC)) {
    orig[n] = fs.readFileSync(path.join(H.FIXTURES, SRC[n] + '.puml'));
    fs.writeFileSync(path.join(dir, n + '.puml'), orig[n]);
  }
  await H.bootWithSaveDir(page, S.dirFor(__filename));
  let ops = 0;
  let fixed = 0;

  for (const d of DOCS) {
    const text = orig[d.name].toString('utf8').replace(/\r\n/g, '\n');
    await S.openFolder(page);
    await page.locator('#folder-panel .folder-item[data-file-name="' + d.name + '"]').first().dblclick();
    await expect(page.locator('#editor')).toHaveValue(text, { timeout: 20000 });
    await H.waitDrawn(page, d.words);
    await S.closeFolderList(page);
    ops += 4;
    await expect(page.locator('#diagram-type'), d.name + ' の図種').toHaveValue(d.type);
    await H.expectRendered(page);

    for (const f of d.fixes) {
      const before = await H.getEditorText(page);
      const lines = before.split('\n');
      const lineNo = lines.indexOf(f.line) + 1;
      expect(lineNo, d.name + ' に直す行「' + f.line + '」がある').toBeGreaterThan(0);
      // 同名の行が本当に混ざっている (押した 1 件と同じ値を持つ別の行がある)。
      const same = f.keep.length ? f.keep : lines.filter((l, i) => i !== lineNo - 1 && l === f.line);
      for (const k of same) expect(lines, d.name + ' の同名の行「' + k + '」').toContain(k);
      if (!f.keep.length) expect(same.length, d.name + ' に同名の別の行がある').toBeGreaterThan(0);

      let n = 0;
      const r = await H.measure(page, testInfo, async () => { n = await f.edit(page, lineNo); }, f.drawn);
      ops += n;
      // 押した対象だけが変わる: 差分は直した 1 行だけで、同じ位置に新しい値の行がある。
      expect(r.diffLines, d.name + ' 「' + f.line + '」の差分行数').toBe(2);
      expect(H.removedLines(r.before, r.after), d.name + ' の消えた行').toEqual([f.line]);
      const afterLines = r.after.split('\n');
      expect(afterLines.length).toBe(lines.length);
      expect(afterLines[lineNo - 1], d.name + ' の直した行 (字下げ・空白を保つ)').toBe(f.want);
      for (let i = 0; i < lines.length; i++) {
        if (i !== lineNo - 1) expect(afterLines[i], d.name + ' の ' + (i + 1) + ' 行目').toBe(lines[i]);
      }
      // 同名の他の行は残る。コメント・skinparam の数も不変。
      for (const k of same) expect(afterLines, d.name + ' の同名の行「' + k + '」は残る').toContain(k);
      expect(count(/^\s*'/gm, r.after)).toBe(count(/^\s*'/gm, r.before));
      expect(count(/skinparam/g, r.after)).toBe(count(/skinparam/g, r.before));
      // 描ける
      await H.expectRendered(page);
      expect(r.renderMs, d.name + ' の直しから描画まで').toBeLessThanOrEqual(RENDER_MS_MAX);
      fixed += 1;
    }
  }
  expect(fixed, '指摘の件数').toBe(5);
  H.annotate(testInfo, 'ops', ops);
});

// 同じ手順 3 を、図の上で探して押す代わりに Ctrl+K で名指しして行う (roadmap v7.0 必須 3・クライテリア 3)。
// 指摘は「15 行目の Open()」「done の 2 本目」のように行番号か名前で来る。
//   - 行番号: Ctrl+K → 行番号 → Enter (クリック 0・6 打鍵以内) でその行の要素が選ばれ、右パネルの見出しがその行番号を言う
//   - 名前: ラベルを打つと同名の候補が行の順に全部並び、各行で行番号と From → To が読める
//   - 選んで右パネルで直した差分はその 1 行 (消えた 1 + 足した 1)。同名の他の行はバイト不変
test('primary 手順3 (場面3) 同名ラベルの 1 本を Ctrl+K の行番号・名前で選んで直すと、その行だけが変わる', async ({ page }, testInfo) => {
  test.setTimeout(150 * 1000);
  const dir = S.absDirFor(__filename) + '-palette';
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const src = fs.readFileSync(path.join(H.FIXTURES, 'rev-s3-seq.puml'));
  fs.writeFileSync(path.join(dir, 'rev-seq.puml'), src);
  await H.bootWithSaveDir(page, S.dirFor(__filename) + '-palette');
  await S.openFolder(page);
  await page.locator('#folder-panel .folder-item[data-file-name="rev-seq"]').first().dblclick();
  const text = src.toString('utf8').replace(/\r\n/g, '\n');
  await expect(page.locator('#editor')).toHaveValue(text, { timeout: 20000 });
  await H.waitDrawn(page, ['CtlMon', 'Open()', 'Read()', 'done']);
  await S.closeFolderList(page);
  await H.expectRendered(page);
  const lines = text.split('\n');
  const lineOf = (l) => lines.indexOf(l) + 1;
  expect(lines.filter((l) => l.trim().endsWith(': Open()')).length, '同名の Open() は 3 本').toBe(3);
  expect(lines.filter((l) => l.trim().endsWith(': done')).length, '同名の done は 2 本').toBe(2);

  const selectedLines = () => page.evaluate(() =>
    (window.MA.selection.getSelected() || []).map((s) => s.line));
  const jumpRows = page.locator('#cp-list .cp-item[data-cp-id^="relation:"], #cp-list .cp-item[data-cp-id^="element:"]');
  const firstRow = page.locator('#cp-list .cp-item').first();

  // ── 1. 行番号で名指し: 「15 行目の Open()」(CtlMon -> Bus) ──
  const target = 'CtlMon -> Bus : Open()';
  const tl = lineOf(target);
  expect(tl).toBe(15);
  let keys = 0;
  await page.keyboard.press('Control+k'); keys += 1;
  await expect(page.locator('#cp-modal')).toBeVisible();
  await page.keyboard.type(String(tl)); keys += String(tl).length;
  await expect(firstRow, '行番号を打つと、その行の候補が先頭').toHaveAttribute('data-cp-id', 'relation:' + tl);
  await expect(firstRow).toContainText('CtlMon');
  await expect(firstRow).toContainText(tl + ' 行目');
  await page.screenshot({ path: testInfo.outputPath('palette-line.png') });
  await page.keyboard.press('Enter'); keys += 1;
  expect(keys, '行番号で選ぶ打鍵').toBeLessThanOrEqual(6);
  await expect.poll(selectedLines, '選ばれたのはその行の要素だけ').toEqual([tl]);
  await expect(page.locator('#props-content'), '右パネルの見出しがその行番号を言う').toContainText('Message · ' + tl + ' 行目');
  await expect(page.locator('#props-content')).toContainText('CtlMon -> Bus');

  let r = await H.measure(page, testInfo, async () => {
    const ta = page.locator('.rle-textarea:visible').first();
    await ta.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Open(mon)');
    await page.keyboard.press('Tab');
  }, ['Open(mon)']);
  expect(r.diffLines, '直した 1 行だけ (消えた 1 + 足した 1)').toBe(2);
  expect(H.removedLines(r.before, r.after)).toEqual([target]);
  let after = r.after.split('\n');
  expect(after[tl - 1]).toBe('CtlMon -> Bus : Open(mon)');
  for (let i = 0; i < lines.length; i++) if (i !== tl - 1) expect(after[i], (i + 1) + ' 行目は不変').toBe(lines[i]);
  await H.expectRendered(page);
  expect(r.renderMs).toBeLessThanOrEqual(RENDER_MS_MAX);

  // ── 2. 名前で名指し: done は同名 2 本。行の順に並び、行番号と From → To が読める ──
  const cur = r.after.split('\n');
  const dones = cur.map((l, i) => ({ l, n: i + 1 })).filter((x) => x.l.trim().endsWith(': done'));
  expect(dones.map((x) => x.n)).toEqual([19, 20]);
  await page.keyboard.press('Control+k');
  await expect(page.locator('#cp-modal')).toBeVisible();
  await page.keyboard.type('done');
  const doneIds = dones.map((x) => 'relation:' + x.n);
  await expect.poll(async () => (await page.locator('#cp-list .cp-item').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-cp-id')))).slice(0, doneIds.length),
  '同名の候補が先頭から行の順に全部並ぶ').toEqual(doneIds);
  await expect(jumpRows.nth(0)).toContainText('Bus --> Ctl : done');
  await expect(jumpRows.nth(0)).toContainText('19 行目');
  await expect(jumpRows.nth(1)).toContainText('Bus --> CtlMon : done');
  await expect(jumpRows.nth(1)).toContainText('20 行目');
  // 指摘の 1 本は 19 行目 (Ctl 宛て)。先頭のまま Enter。
  await page.keyboard.press('Enter');
  await expect.poll(selectedLines).toEqual([19]);
  await expect(page.locator('#props-content')).toContainText('Message · 19 行目');
  r = await H.measure(page, testInfo, async () => {
    const ta = page.locator('.rle-textarea:visible').first();
    await ta.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('ok');
    await page.keyboard.press('Tab');
  }, ['ok']);
  expect(r.diffLines).toBe(2);
  expect(H.removedLines(r.before, r.after)).toEqual(['Bus --> Ctl : done']);
  after = r.after.split('\n');
  expect(after[18]).toBe('Bus --> Ctl : ok');
  expect(after[19], '同名の他の行はバイト不変').toBe('Bus --> CtlMon : done');
  for (let i = 0; i < cur.length; i++) if (i !== 18) expect(after[i]).toBe(cur[i]);
  await H.expectRendered(page);

  // ── 3. Open() を打つと 3 本が行の順に並ぶ (今は 15 行目を直したので残る 2 本 + Open(mon))。
  await page.keyboard.press('Control+k');
  await expect(page.locator('#cp-modal')).toBeVisible();
  await page.keyboard.type('Open()');
  const opens = after.map((l, i) => ({ l, n: i + 1 })).filter((x) => x.l.trim().endsWith(': Open()'));
  expect(opens.map((x) => x.n)).toEqual([12, 14]);
  await expect.poll(async () => (await page.locator('#cp-list .cp-item').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-cp-id')))).slice(0, 2)).toEqual(['relation:12', 'relation:14']);
  await expect(jumpRows.nth(1), '字下げした行も From → To で読める').toContainText('Bus -> Dev : Open()');
  await page.keyboard.press('Escape');
  H.annotate(testInfo, 'ops', 4);
});
