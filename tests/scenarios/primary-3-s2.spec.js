// @ts-check
// primary 台本 場面 2「手書きの既存の図を開いて直す」手順 3:
//   保存先の一覧から hand-seq・hand-state・hand-class を 1 枚ずつ開き、既存の 1 か所を GUI で直す
//   (シーケンスはメッセージの文言、状態遷移は遷移の条件 (きっかけ)、クラスは属性の型)。
// 期待 (principles.md「押した対象だけが変わる」「描ける」「手書きや他の道具で作った .puml は壊さず開ける」):
//   - 1 か所の直しで本文の差分は直した行の 1 行だけ (消えた 1 行 + 足した 1 行 = 2)
//   - 直した行は行頭の字下げを保ち、新しい文言・条件・型を持つ
//   - ほかの行 (コメント・字下げ・skinparam・!include・同じ語を持つ別の行) は 1 字も動かない
//   - 直した図がエラー無しで描け、新しい文言が図に出る。操作から描画までは上限 (3 秒) 以内
// 図: tests/scenarios/fixtures/ の hand-seq・hand-state・hand-class・common (自作の小さい図)。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const RENDER_MS_MAX = 3000;

// 図の要素を実マウスで押す (合成イベントは当たり判定を素通りするので使わない)。
async function clickHit(page, locator, what) {
  await expect(locator).toBeAttached({ timeout: 15000 });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('overlay box not found: ' + what);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const DOCS = [
  {
    name: 'hand-seq', type: 'plantuml-sequence', words: ['Drv', 'Open()', 'ready', 'Poll()'],
    line: '    Bus --> Drv : ready', want: /^ {4}Bus\s*-->\s*Drv\s*:\s*ready\(ok\)$/, drawn: ['ready(ok)'],
    edit: async (page, lineNo) => {
      // 図のメッセージ「ready」を押し、右パネルの文言を書き換える。
      const hit = page.locator('#overlay-layer rect[data-type="message"][data-line="' + lineNo + '"]').first();
      await clickHit(page, hit, 'message line ' + lineNo);
      const ta = page.locator('.rle-textarea:visible').first();
      await ta.click();
      await page.keyboard.press('Control+a');
      await page.keyboard.type('ready(ok)');
      await page.keyboard.press('Tab');
    },
  },
  {
    name: 'hand-state', type: 'plantuml-state', words: ['Idle', 'Busy', 'Slow', 'Throttle'],
    line: 'Busy  --> Slow : Throttle', want: /^Busy\s*-->\s*Slow\s*:\s*Throttle2$/, drawn: ['Throttle2'],
    edit: async (page) => {
      // 右パネルの遷移の一覧から Throttle の遷移を選び、条件 (きっかけ) を書き換える。
      await page.locator('#props-content div:has(> .st-tr-pick)', { hasText: 'Throttle' }).first().locator('.st-tr-pick').click();
      await page.locator('#st-tr-trig').fill('Throttle2');
      await page.locator('#st-tr-update').click();
    },
  },
  {
    name: 'hand-class', type: 'plantuml-class', words: ['Drv', 'Mon', 'rate : uint16'],
    line: '  - rate : uint16', want: /^ {2}- rate\s*:\s*uint32$/, drawn: ['rate : uint32'],
    edit: async (page, lineNo) => {
      // 図の Drv の属性 rate を押すと右パネルにその属性の欄が開く。型を書き換えて「更新」。
      const hit = page.locator('#overlay-layer rect[data-type="member"][data-parent-id="Drv"][data-line="' + lineNo + '"]').first();
      await clickHit(page, hit, 'member rate (line ' + lineNo + ')');
      const mi = await hit.getAttribute('data-member-index');
      const type = page.locator('#cl-mem-type-' + mi);
      if (!(await type.isVisible())) await page.locator('#cl-mem-edit-' + mi).click();
      await expect(type).toHaveValue('uint16');
      await type.fill('uint32');
      await page.locator('#cl-mem-update-' + mi).click();
    },
  },
];
const FILES = ['common'].concat(DOCS.map((d) => d.name));

function count(re, s) { return (String(s).match(re) || []).length; }

test('primary 手順3 (場面2) 手書きの 3 図を保存先の一覧から開き、1 か所ずつ GUI で直しても直した行だけが変わる', async ({ page }, testInfo) => {
  test.setTimeout(120 * 1000);
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const orig = {};
  for (const n of FILES) {
    orig[n] = fs.readFileSync(path.join(H.FIXTURES, n + '.puml'));
    fs.writeFileSync(path.join(dir, n + '.puml'), orig[n]);
  }
  await H.bootWithSaveDir(page, S.dirFor(__filename));

  for (const d of DOCS) {
    const text = orig[d.name].toString('utf8').replace(/\r\n/g, '\n');
    await S.openFolder(page);
    await page.locator('#folder-panel .folder-item[data-file-name="' + d.name + '"]').first().dblclick();
    await expect(page.locator('#editor')).toHaveValue(text, { timeout: 20000 });
    await H.waitDrawn(page, d.words);
    await S.closeFolderList(page);
    await expect(page.locator('#diagram-type'), d.name + ' の図種').toHaveValue(d.type);
    await H.expectRendered(page);

    const lines = text.split('\n');
    const lineNo = lines.indexOf(d.line) + 1;
    expect(lineNo, d.name + ' に直す行がある').toBeGreaterThan(0);

    const r = await H.measure(page, testInfo, () => d.edit(page, lineNo), d.drawn);
    // 押した対象だけが変わる: 差分は直した 1 行だけ。
    expect(r.diffLines, d.name + ' の差分行数').toBe(2);
    expect(H.removedLines(r.before, r.after), d.name + ' の消えた行').toEqual([d.line]);
    const added = H.removedLines(r.after, r.before);
    expect(added, d.name + ' の足した行').toHaveLength(1);
    expect(added[0], d.name + ' の直した行 (字下げを保つ)').toMatch(d.want);
    // 直した行は同じ位置にある。ほかの行は 1 字も動かない。
    const afterLines = r.after.split('\n');
    expect(afterLines.length).toBe(lines.length);
    expect(afterLines[lineNo - 1]).toBe(added[0]);
    for (let i = 0; i < lines.length; i++) {
      if (i !== lineNo - 1) expect(afterLines[i], d.name + ' の ' + (i + 1) + ' 行目').toBe(lines[i]);
    }
    // コメント・skinparam・!include の数も不変。
    expect(count(/^\s*'/gm, r.after)).toBe(count(/^\s*'/gm, r.before));
    expect(count(/skinparam/g, r.after)).toBe(count(/skinparam/g, r.before));
    expect(r.after).toMatch(/^!include common\.puml$/m);
    // 描ける
    await H.expectRendered(page);
    expect(r.renderMs, d.name + ' の操作から描画まで').toBeLessThanOrEqual(RENDER_MS_MAX);
  }

  // !include される common.puml は直していないので 1 バイトも変わらない。
  expect(Buffer.compare(fs.readFileSync(path.join(dir, 'common.puml')), orig.common), 'common.puml は変わらない').toBe(0);
});
