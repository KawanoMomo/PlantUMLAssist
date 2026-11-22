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
