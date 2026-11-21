// @ts-check
// TICKET-owner-20261116-0121-1 (data-loss): 本文を打った直後、描き直しが届く前に前の図の枠を押すと、
// 枠の順番の id が今の本文の別の要素に当たり、右パネルの操作・Delete が押していない行を書き換えていた。
// 期待 (principles.md「押した対象だけが変わる」):
//   - 描き直しを 1.5 秒遅らせ、押す対象より前に 1 行打った直後に、前の図の枠を実マウスで押す
//   - 描き直しが届くまでは何も選ばれず、その間の Delete で本文は 1 バイトも変わらない
//   - 届いたら、押した要素 (同じ中身の行) が選ばれる。そこで操作・Delete しても、打った行と押していない行は変わらない
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

const DELAY_MS = 1500;

function lineOf(text, n) { return text.split('\n')[n - 1]; }

// 本文を描かせ、targetLine の枠の位置を控えてから、描き直しを遅らせて insertBefore 行の前に insert を実キーで打ち、
// すぐ控えた位置を押す。描き直しの前の Delete が何も変えないことまで見て、選ばれた枠の行番号を返す。
async function typeThenClickStale(page, dsl, drawnWords, targetLine, insertBefore, insert) {
  await H.bootWith(page, dsl);
  await H.waitDrawn(page, drawnWords);
  const frame = page.locator('#overlay-layer [data-type][data-line="' + targetLine + '"]').first();
  await expect(frame).toBeVisible({ timeout: 20000 });
  const box = await frame.boundingBox();
  expect(box).not.toBeNull();

  await page.route('**/render', async (route) => {
    await new Promise((r) => setTimeout(r, DELAY_MS));
    await route.continue();
  });
  await page.locator('#editor').click();
  await page.keyboard.press('Control+Home');
  for (let i = 1; i < insertBefore; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Home');
  await page.keyboard.type(insert + '\n');
  const typed = await page.locator('#editor').inputValue();
  expect(lineOf(typed, insertBefore)).toBe(insert);

  // 画面はまだ前の図。控えた枠を実マウスで押し、続けて Delete。
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  expect(await page.locator('#editor').inputValue(), '描き直しの前の Delete は本文を変えない').toBe(typed);

  // 描き直しが届くと、押した要素の行 (打った分だけ下にずれた行) が選ばれる。
  const sel = page.locator('#overlay-layer .selected[data-line]').first();
  await expect(sel).toBeAttached({ timeout: DELAY_MS * 4 + 10000 });
  const selLine = Number(await sel.getAttribute('data-line'));
  expect(lineOf(typed, selLine), '押した要素の行が選ばれる').toBe(lineOf(dsl, targetLine));
  return { typed, selLine };
}

// 押した行 (pressedLine) 以外の行が typed と同じであること。
function expectOnlyPressedChanged(typed, after, pressed) {
  const keep = typed.split('\n').filter((l) => l !== pressed);
  const now = after.split('\n');
  for (const l of keep) expect(now, '押していない行が残る: ' + l).toContain(l);
}

test('owner 0121 sequence: 前に 1 行打った直後に前の図の矢印を押し、矢印の種類を替えても打った行は変わらない', async ({ page }) => {
  const dsl = ['@startuml', 'participant A', 'participant B', 'A -> B : req', 'B --> A : res', '@enduml'].join('\n');
  const { typed } = await typeThenClickStale(page, dsl, ['req', 'res'], 4, 4, 'A -> B : ping');
  await page.locator('#seq-edit-arrow-seg .prop-seg[data-value="->>"]').click();
  await expect.poll(() => page.locator('#editor').inputValue(), { timeout: 10000 }).toContain('A ->> B : req');
  const after = await page.locator('#editor').inputValue();
  expect(after).toContain('A -> B : ping');
  expectOnlyPressedChanged(typed, after, 'A -> B : req');
  expect(after.split('\n').length).toBe(typed.split('\n').length);
});

test('owner 0121 sequence: 前の図の矢印を押した後の Delete は、押した矢印の行だけを消す', async ({ page }) => {
  const dsl = ['@startuml', 'participant A', 'participant B', 'A -> B : req', 'B --> A : res', '@enduml'].join('\n');
  const { typed } = await typeThenClickStale(page, dsl, ['req', 'res'], 5, 4, 'A -> B : ping');
  await page.keyboard.press('Delete');
  await expect.poll(() => page.locator('#editor').inputValue(), { timeout: 10000 }).not.toContain('B --> A : res');
  const after = await page.locator('#editor').inputValue();
  expectOnlyPressedChanged(typed, after, 'B --> A : res');
});

test('owner 0121 class: メンバーを前に足した直後に前の図のメンバーを押しても、押したメンバーが選ばれ他は消えない', async ({ page }) => {
  const dsl = ['@startuml', 'class Spi {', '  +Init()', '  +Write()', '}', 'class Can', '@enduml'].join('\n');
  const { typed } = await typeThenClickStale(page, dsl, ['Spi', 'Write'], 4, 3, '  +Reset()');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(1500);
  const after = await page.locator('#editor').inputValue();
  expectOnlyPressedChanged(typed, after, '  +Write()');
  expect(after).toContain('  +Reset()');
  expect(after).toContain('  +Init()');
});

test('owner 0121 activity: 動作を前に足した直後に前の図の動作を押しても、押した動作が選ばれ他は消えない', async ({ page }) => {
  const dsl = ['@startuml', 'start', ':Init;', ':Write;', ':Done;', 'stop', '@enduml'].join('\n');
  const { typed } = await typeThenClickStale(page, dsl, ['Init', 'Write', 'Done'], 4, 3, ':Reset;');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(1500);
  const after = await page.locator('#editor').inputValue();
  expectOnlyPressedChanged(typed, after, ':Write;');
  expect(after).toContain(':Reset;');
  expect(after).toContain(':Init;');
});
