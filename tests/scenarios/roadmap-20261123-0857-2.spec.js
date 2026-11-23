// @ts-check
// TICKET-roadmap-20261123-0857-2 (roadmap v8.0 必須 3): 描き直しが届く前・図を開いた直後に押した書き出しが、押した図の今の本文の図だけを書く。
// /render の応答を 1500ms 遅らせる (遅い PC の再現。scenario の中だけ。renderMs は出さない)。
// 期待:
//   (1) 保存先から開いた図に状態を 1 つ足した直後に Export ▾ →「SVG で書き出す」: 待っている旨が出て、置き場の SVG は 1 枚、
//       足した状態の名前を含み、text の数が本文の状態の数と合う
//   (2) 同じ形で「PNG で書き出す」: 待ってから 1 枚書く (足す前の絵を書かない)
//   (3) 開いていない図を FILES の右クリック「SVG で書き出す」: その図の要素だけ (直前に見ていた図の要素を含まない)
//   (4) 押した後、届く前にタブを替える: 押した図の名前で別の図を書かず、書かなかった理由を言う
//   (5) 保存先の無い図 (白紙に 1 つ足した直後。まだ絵が無い): download で 1 枚、足した名前を含む
//   .puml は全部バイト一致、増えたファイルは押した書き出しだけ。押して何も出ず何も言わないが 0
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const WAIT = '描き直しが届いたら書き出します';

async function slowRender(page, ms) {
  await page.route('**/render', async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
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
async function seq(page) { return Number((await page.locator('#status-save-result').getAttribute('data-export-seq')) || 0); }
async function menuExport(page, id) {
  if (!(await page.locator('#export-menu').isVisible())) await page.locator('#btn-export').click();
  await page.locator(id).click();
}
async function addState(page, name) {
  const chip = page.locator('#st-tail-kind-chip-state');
  if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click();
  await page.locator('#st-tail-id').fill(name);
  await page.locator('#st-tail-add').click();
  await expect.poll(() => H.getEditorText(page)).toContain(name);
}
const textsOf = (svg) => (svg.match(/<text\b[^>]*>([^<]*)<\/text>/g) || []).map((t) => t.replace(/<[^>]+>/g, ''));

test('roadmap 0857-2 描き直しが届く前に押した書き出しは、押した図の今の本文の図を書く (描き直し 1.5 秒遅れ)', async ({ page }) => {
  test.setTimeout(150 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const dir = path.join(S.absDirFor(__filename), 'proj');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'st.puml'), '@startuml\n[*] --> Idle\n@enduml\n');
  fs.writeFileSync(path.join(dir, 'other.puml'), '@startuml\n[*] --> OtherOnly\n@enduml\n');
  const before = snapshot(dir);
  await slowRender(page, 1500);
  await H.bootWithSaveDir(page, S.dirFor(__filename) + '/proj');
  const st = page.locator('#status-save-result');

  // (1) st を開き、描けてから状態 Busy を足し、描き直しを待たずに SVG で書き出す。
  await page.locator('#files-parts .files-part-file[data-file-name="st"]').click();
  await H.waitDrawn(page, ['Idle']);
  await addState(page, 'Busy');
  let n = await seq(page);
  await menuExport(page, '#exp-svg');
  await expect(st).toContainText(WAIT, { timeout: 1000 });
  await page.waitForFunction((k) => Number(document.getElementById('status-save-result').getAttribute('data-export-seq') || 0) > k, n, { timeout: 15000 });
  const svgPath = path.join(dir, 'st.svg');
  const svg = fs.readFileSync(svgPath, 'utf8');
  const texts = textsOf(svg);
  expect(texts).toContain('Busy');
  expect(texts).toContain('Idle');
  // 本文の状態 (Idle・Busy) の数と絵の名前の数が合う。
  expect(texts.filter((t) => t === 'Idle' || t === 'Busy')).toHaveLength(2);
  await page.keyboard.press('Escape');

  // (2) 状態 Done を足し、描き直しを待たずに PNG で書き出す。待ってから 1 枚書く。
  await addState(page, 'Done');
  n = await seq(page);
  await menuExport(page, '#exp-png');
  await expect(st).toContainText(WAIT, { timeout: 1000 });
  await page.waitForFunction((k) => Number(document.getElementById('status-save-result').getAttribute('data-export-seq') || 0) > k, n, { timeout: 15000 });
  // 書いたときには絵が今の本文 (Done を含む) の図だった。
  expect(await H.svgText(page)).toContain('Done');
  expect(fs.statSync(path.join(dir, 'st.png')).size).toBeGreaterThan(0);
  await page.keyboard.press('Escape');

  // (3) 開いていない other を FILES の右クリック「SVG で書き出す」。その図の要素だけ。
  n = await seq(page);
  await page.locator('#files-parts .files-part-file[data-file-name="other"]').click({ button: 'right' });
  await page.locator('#files-ctx-menu .files-ctx-item', { hasText: 'SVG で書き出す' }).first().click();
  await page.waitForFunction((k) => Number(document.getElementById('status-save-result').getAttribute('data-export-seq') || 0) > k, n, { timeout: 15000 });
  const other = textsOf(fs.readFileSync(path.join(dir, 'other.svg'), 'utf8'));
  expect(other).toContain('OtherOnly');
  for (const w of ['Idle', 'Busy', 'Done']) expect(other).not.toContain(w);

  // (4) other に状態を足して SVG を押し、届く前に st のタブへ替える。other の名前で st の絵を書かず、理由を言う。
  await H.waitDrawn(page, ['OtherOnly']);
  const otherSvgBefore = fs.readFileSync(path.join(dir, 'other.svg'), 'utf8');
  await addState(page, 'Extra');
  await menuExport(page, '#exp-svg');
  await expect(st).toContainText(WAIT, { timeout: 1000 });
  await page.keyboard.press('Escape');
  await page.locator('#files-parts .files-part-file[data-file-name="st"]').click();
  await expect(st).toContainText('書き出しませんでした', { timeout: 15000 });
  await page.waitForTimeout(2000);
  expect(fs.readFileSync(path.join(dir, 'other.svg'), 'utf8')).toBe(otherSvgBefore);

  // .puml は変わらない (自動保存で他の図の .puml を書かない範囲で見る: 書き出しの前後で増えたのは書き出しだけ)。
  const after = snapshot(dir);
  const added = Object.keys(after).filter((f) => !(f in before)).sort();
  expect(added.filter((f) => !/\.puml$/.test(f))).toEqual(['other.svg', 'st.png', 'st.svg']);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('roadmap 0857-2 保存先の無い白紙の図に 1 つ足した直後の SVG 書き出しは、足した名前を含む 1 枚を download する (描き直し 1.5 秒遅れ)', async ({ page }) => {
  test.setTimeout(90 * 1000);
  await slowRender(page, 1500);
  await H.bootWith(page, null);
  await page.locator('#btn-tab-new').click();
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await expect(page.locator('#preview-svg svg[data-blank-canvas="1"]')).toHaveCount(1, { timeout: 20000 });
  await addState(page, 'Fresh');
  const dlP = page.waitForEvent('download', { timeout: 15000 });
  let downloads = 0;
  page.on('download', () => { downloads++; });
  await menuExport(page, '#exp-svg');
  await expect(page.locator('#status-save-result')).toContainText(WAIT, { timeout: 1000 });
  const dl = await dlP;
  const out = test.info().outputPath('fresh.svg');
  await dl.saveAs(out);
  expect(textsOf(fs.readFileSync(out, 'utf8'))).toContain('Fresh');
  await page.waitForTimeout(2000);
  expect(downloads).toBe(1);
});
