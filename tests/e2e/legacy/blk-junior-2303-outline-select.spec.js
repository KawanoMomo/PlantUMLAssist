// @ts-check
// BLK-junior-20260907-2303: 遷移を 1 本足すとプレビュー上のノードが数十 px 動くので、
// 憶えた座標をもう一度クリックすると別の要素に当たる。構造 (Outline) タブの行は
// 再レイアウトで動かないので、そこから要素を選べれば選び直しが安定する。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const STATE = [
  '@startuml',
  'title 状態遷移',
  '[*] --> Idle',
  'state Idle',
  'state Running',
  'state Error',
  'Idle --> Running : start',
  'Running --> Error : fail',
  '@enduml',
].join('\n');

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(1200);
}

async function selected(page) {
  return page.evaluate(() => window.MA.selection.getSelected());
}

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, STATE);
  await page.locator('#btn-editor-tab-outline').click();
  await expect(page.locator('#outline-pane')).toHaveClass(/open/);
});

test('構造の行をクリックするとその要素が選ばれる', async ({ page }) => {
  // Error は DSL の 6 行目 (index 5)
  await page.locator('#outline-list .outline-row[data-outline-line="5"]').click();
  await page.waitForTimeout(300);
  expect(await selected(page)).toEqual([{ type: 'state', id: 'Error', line: 6 }]);
});

test('遷移を 1 本足してレイアウトが変わっても同じ行から選び直せる', async ({ page }) => {
  await typeDsl(page, STATE.replace('@enduml', 'Error --> Idle : reset\n@enduml'));
  await page.locator('#btn-editor-tab-outline').click();
  await page.locator('#outline-list .outline-row[data-outline-line="5"]').click();
  await page.waitForTimeout(300);
  expect(await selected(page)).toEqual([{ type: 'state', id: 'Error', line: 6 }]);
});

test('要素の無い行を選んだら前の選択は残らない', async ({ page }) => {
  await page.locator('#outline-list .outline-row[data-outline-line="5"]').click();
  await page.waitForTimeout(200);
  expect((await selected(page)).length).toBe(1);
  // title 行 (2 行目 / index 1) は構造には並ぶが選べる要素ではない
  await page.locator('#btn-editor-tab-outline').click();
  await page.locator('#outline-list .outline-row[data-outline-line="1"]').click();
  await page.waitForTimeout(200);
  expect(await selected(page)).toEqual([]);
});
