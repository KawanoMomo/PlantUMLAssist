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

// BLK-junior-20260916-0526-wish: 子状態を足した後の「中を見る」手立て。
// 足す口 (上のテスト) はあっても、入れ子が深くなると元の 1 枚のズーム図の中でしか
// 中身を確かめられず、どの階層に何があるか追えなかった。到達条件は
// 「木で階層を辿れること」と「選んだ階層だけを図に大きく出して、全体に戻れること」。

// 台本の手順 9 を進めた後の図 (親 Configured の中に子 2 つ、片方が孫を持つ)。
const TIMER_NESTED = [
  '@startuml',
  'title TIMERドライバ状態遷移',
  'state Uninit',
  'state Configured {',
  '  state Counting {',
  '    state Tick',
  '  }',
  '  state Paused',
  '  Counting --> Paused : Timer_Pause',
  '  Paused --> Counting : Timer_Resume',
  '}',
  '[*] --> Uninit',
  'Uninit --> Configured : Timer_Init',
  'Configured --> Uninit : Timer_Stop',
  '@enduml',
].join('\n');

async function openTree(page) {
  await page.locator('#btn-state-tree-toggle').click();
  await expect(page.locator('#state-tree-body')).toBeVisible();
}

test('手順9 入れ子ツリーで親→子→孫を辿れる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, TIMER_NESTED);

  await openTree(page);
  const rows = page.locator('#state-tree-body .stree-row');
  // 木は図と同じ並び。親のすぐ下に子、その下に孫。
  await expect(rows).toHaveCount(5);
  const ids = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-tree-id')));
  expect(ids).toEqual([
    'Uninit', 'Configured', 'Configured.Counting', 'Configured.Counting.Tick', 'Configured.Paused',
  ]);
  // 深さは字下げで見える (孫は親より深い)。
  const depths = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-tree-depth')));
  expect(depths).toEqual(['0', '0', '1', '2', '1']);
  // どの親が何を抱えているかが数で読める。
  await expect(rows.nth(1)).toContainText('子 2');
  await expect(rows.nth(1)).toContainText('子孫 3');
  await expect(page.locator('#state-tree-summary')).toContainText('3 段');

  // 行を押すとその状態が選ばれ、右ペインが同じ階層を指す。
  await rows.nth(3).click();
  await page.waitForTimeout(400);
  await expect(page.locator('#props-content')).toContainText('Configured › Counting › Tick');
});

test('手順9 選んだ階層だけを図に大きく出し、全体に戻れる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, TIMER_NESTED);
  await openTree(page);

  await page.locator('[data-tree-focus="Configured"]').click();
  await page.waitForTimeout(1500);

  // 今どの階層を見ているかと、この図に出ない外とのつながりの本数を言う。
  await expect(page.locator('#state-tree-focus-bar')).toBeVisible();
  await expect(page.locator('#state-tree-focus-label')).toContainText('Configured の中だけを表示中');
  await expect(page.locator('#state-tree-focus-label')).toContainText('子状態 2');
  await expect(page.locator('#state-tree-focus-label')).toContainText('外と 2 本');

  // 図はその階層だけ。外の状態は描かれない。
  const svgText = await page.locator('#preview-svg').innerText();
  expect(svgText).toContain('Paused');
  expect(svgText).toContain('Timer_Pause');
  expect(svgText).not.toContain('Uninit');

  // 焦点にしても DSL は 1 文字も変わらない (見え方だけの操作)。
  expect(await dsl(page)).toBe(TIMER_NESTED);

  // 孫の階層へ掘り下げられる。
  await page.locator('[data-tree-focus="Configured.Counting"]').click();
  await page.waitForTimeout(1500);
  const innerText = await page.locator('#preview-svg').innerText();
  expect(innerText).toContain('Tick');
  expect(innerText).not.toContain('Paused');

  // 全体に戻る。
  await page.locator('#btn-state-tree-focus-clear').click();
  await page.waitForTimeout(1500);
  await expect(page.locator('#state-tree-focus-bar')).toBeHidden();
  const wholeText = await page.locator('#preview-svg').innerText();
  expect(wholeText).toContain('Uninit');
  expect(wholeText).toContain('Paused');
});

test('手順9 木のその場から、どの階層にも子状態を足せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, TIMER_NESTED);
  await openTree(page);

  // 孫の下にさらに足す — 右ペインへ戻らずに深い階層を伸ばせる。
  await page.locator('[data-tree-add-child="Configured.Counting.Tick"]').click();
  await page.waitForTimeout(600);
  const deep = await page.evaluate(() => {
    const p = window.MA.modules.plantumlState.parse(
      document.getElementById('editor').value);
    return p.states.filter((s) => s.parentId === 'Configured.Counting.Tick').length;
  });
  expect(deep).toBe(1);
  // 足した子はその場で木にも出る (図を探しに行かなくてよい)。
  await expect(page.locator('#state-tree-body .stree-row')).toHaveCount(6);
});

// BLK-junior-20260916-0526: 入口 (チップ・パネルのボタン) は出ていたのに見つけ
// られなかった。置き場所ではなく言葉の問題で、研修で PlantUML を見た程度の人は
// 「子状態」「複合状態」を知らない。知らない語は目に入っても「状態の中に状態を
// 入れる」と結びつかず、コマンド検索に打つ語も当てられない。
test('手順9 用語を知らなくても、自分の言葉 (入れ子・中に入れる) で入口に届く', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, TIMER_STATE);

  for (const word of ['入れ子', 'ネスト', '中に入れる']) {
    await page.keyboard.press('Control+k');
    await expect(page.locator('#cp-modal')).toBeVisible();
    await page.locator('#cp-input').fill(word);
    await page.waitForTimeout(400);
    // 到達条件: 正しい用語を知らない語でも、子状態の入口が候補に出る。
    await expect(page.locator('#cp-list')).toContainText('子状態');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
});

test('手順9 選んだ状態のボタンが、用語抜きで何が起きるかを言う', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, TIMER_STATE);
  await selectState(page, 'Busy');

  // 到達条件: 「子状態」の語を知らなくても、押す前に何が起きるかが読める。
  await expect(page.locator('#st-add-child-pair')).toHaveAttribute('title', /中に状態を 2 つ入れて/);
  await expect(page.locator('#st-add-child')).toHaveAttribute('title', /中に、もう 1 つ状態を入れます/);
  await expect(page.locator('#props-content')).toContainText('入れ子');
});
