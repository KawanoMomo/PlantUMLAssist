// @ts-check
// junior 台本 手順9 (状態遷移図): 親状態に子状態を 2 つ足し、子の間に遷移を引く。
// BLK-human-20260915-1206: 素材 (composite) はあったが「Convert to composite →
// 末尾に state を足す → Move into」の 3 手に散り、どれも「子状態」と名乗って
// いなかったので、GUI から足す道を見つけられなかった。到達条件は
// 「DSL を手で書かずに、GUI の言葉だけで入れ子が作れる」こと。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

// 台本の TIMER ドライバ状態遷移。GUI の「+ State 追加」が書くのと同じ形
// (宣言行 `state X` を持つ) にそろえる — 子状態は親の宣言行を開いて作るので、
// 遷移にしか出てこない状態は親に選べない。
const TIMER_STATE = [
  '@startuml',
  'title TIMERドライバ状態遷移',
  'state Uninit',
  'state Ready',
  'state Busy',
  '[*] --> Uninit',
  'Uninit --> Ready : Timer_Init',
  'Ready --> Busy : Timer_Start',
  'Busy --> Ready : Timer_Expire',
  '@enduml',
].join('\n');

async function dsl(page) {
  return page.evaluate(() => /** @type {HTMLTextAreaElement} */ (
    document.getElementById('editor')).value);
}

// 図の中の状態を選ぶ (プレビューの当たり判定は描画待ちが要るので、
// 台本の「その状態を選ぶ」を選択 API で表す)。
async function selectState(page, id) {
  await page.evaluate((sid) => {
    const mod = window.MA.modules.plantumlState;
    const parsed = mod.parse(document.getElementById('editor').value);
    const st = parsed.states.filter((s) => s.id === sid)[0];
    window.MA.selection.setSelected([{ type: 'state', id: st.id, line: st.line }]);
  }, id);
  await page.waitForTimeout(300);
}

test('手順9 選んだ状態に子状態を 2 つ足し、子の間に遷移が引ける', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, TIMER_STATE);

  await selectState(page, 'Busy');
  // 入口はこの 1 つ。「composite に変換」を知らなくても押せる。
  await expect(page.locator('#st-add-child-pair')).toBeVisible();
  await page.locator('#st-add-child-pair').click();
  await page.waitForTimeout(400);

  const text = await dsl(page);
  // 到達条件: 親が入れ子に開き、子が 2 つ、その間に遷移が 1 本。
  expect(text).toContain('state Busy {');
  expect(text).toContain('Sub --> Sub2');
  const parsed = await page.evaluate((t) => {
    const p = window.MA.modules.plantumlState.parse(t);
    return {
      kids: p.states.filter((s) => s.parentId === 'Busy').map((s) => s.id),
      tr: p.transitions.filter((x) => x.from === 'Sub' && x.to === 'Sub2').length,
      outer: p.transitions.filter((x) => x.to === 'Busy' || x.from === 'Busy').length,
    };
  }, text);
  expect(parsed.kids).toEqual(['Busy.Sub', 'Busy.Sub2']);
  expect(parsed.tr).toBe(1);
  // 親に出入りしていた遷移は 1 本も壊れない。
  expect(parsed.outer).toBe(2);
});

test('手順9 名前を決めて 1 つずつ足せる。孫も同じ手で入る', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, TIMER_STATE);

  await selectState(page, 'Ready');
  await page.locator('#st-child-id').fill('Warmup');
  await page.locator('#st-add-child').click();
  await page.waitForTimeout(400);
  expect(await dsl(page)).toContain('state Ready {');

  // 子を選ぶと「どの親の中に居るか」が読める。
  await selectState(page, 'Ready.Warmup');
  await expect(page.locator('#props-content')).toContainText('Ready の中');
  await expect(page.locator('#props-content')).toContainText('Ready › Warmup');

  // 同じ入口から孫が入る。
  await page.locator('#st-child-id').fill('Step1');
  await page.locator('#st-add-child').click();
  await page.waitForTimeout(400);
  const grand = await page.evaluate(() => {
    const p = window.MA.modules.plantumlState.parse(
      document.getElementById('editor').value);
    return p.states.filter((s) => s.id === 'Ready.Warmup.Step1').length;
  });
  expect(grand).toBe(1);
});

test('手順9 GUI のヘルプ (Ctrl+K) から「子状態」を引ける', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, TIMER_STATE);
  await page.keyboard.press('Control+k');
  await expect(page.locator('#cp-modal')).toBeVisible();
  await page.locator('#cp-input').fill('子状態');
  await page.waitForTimeout(400);
  // 到達条件: 記法 (`state A { }`) を知らなくても、言葉で入口に届く。
  await expect(page.locator('#cp-list')).toContainText('子状態');
});

test('手順9 追加フォームからも、どの状態の中に入れるかを選んで足せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, TIMER_STATE);
  await page.evaluate(() => {
    if (window.MA.selection) window.MA.selection.clearSelection();
  });
  await page.waitForTimeout(300);
  await page.locator('#st-tail-kind').selectOption('child');
  await page.waitForTimeout(300);
  // 中身をまだ持たない状態も親の候補に並ぶ (最初の 1 つが作れる)。
  const opts = await page.locator('#st-tail-where-target option').allTextContents();
  expect(opts).toContain('Uninit');
  await page.locator('#st-tail-where-target').selectOption('Uninit');
  await page.locator('#st-tail-id').fill('Boot');
  await page.locator('#st-tail-add').click();
  await page.waitForTimeout(400);
  expect(await dsl(page)).toContain('state Uninit {');
  expect(await dsl(page)).toContain('state Boot');
});
