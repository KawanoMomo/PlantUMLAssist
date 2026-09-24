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
  await page.locator('#st-tail-kind-chip-child').click();
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

// BLK-human-20260923-2001: 入れ子の子状態が状態遷移表に出ず、子の遷移が見えない・入れられなかった。
// 表は入れ子を含む全状態を「親 / 子」で字下げして出し、親の行を畳めば子が隠れ、
// 空欄から足した子どうしの遷移は親の { } の中に入る。
test('手順9 状態遷移表に親 2 つ・子 3 つずつと各親の開始が全部出て、空欄から子の遷移を足せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, [
    '@startuml',
    '[*] --> Idle',
    'state Idle {',
    '  state Wait',
    '  state Poll',
    '  state Sleep',
    '  [*] --> Wait',
    '  Wait --> Poll : tick',
    '}',
    'state Busy {',
    '  state Send',
    '  state Recv',
    '  state Done',
    '  [*] --> Send',
    '  Send --> Recv : sent',
    '}',
    'Idle --> Busy : start',
    'Busy --> [*] : stop',
    '@enduml',
  ].join('\n'));

  await page.locator('#btn-state-table-toggle').click();
  const heads = page.locator('#state-table-body tbody th');
  await expect(heads).toHaveCount(11);
  const labels = (await heads.allInnerTexts()).map((s) => s.replace(/[▾▸]/g, '').trim());
  expect(labels).toEqual([
    '（開始）', 'Idle', 'Idle / （開始）', 'Idle / Wait', 'Idle / Poll', 'Idle / Sleep',
    'Busy', 'Busy / （開始）', 'Busy / Send', 'Busy / Recv', 'Busy / Done',
  ]);
  // 子は親より字下げされる
  const pad = async (id) => page.locator('#state-table-body tr[data-stt-row="' + id + '"] th')
    .evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
  expect(await pad('Busy.Recv')).toBeGreaterThan(await pad('Busy'));

  // 親の行を畳むと子が隠れ、開けば戻る
  await page.locator('#state-table-body [data-stt-fold="Idle"]').click();
  await expect(heads).toHaveCount(7);
  await page.locator('#state-table-body [data-stt-fold="Idle"]').click();
  await expect(heads).toHaveCount(11);

  // 子 (Recv) の行・sent 列の空欄から Done への遷移を足す → Busy の { } の中に入る
  const cell = page.locator('#state-table-body td.stt-empty[data-state-id="Busy.Recv"][data-trigger="sent"]');
  await cell.click();
  // BLK-human-20260923-2000: 空欄は右パネルの連続入力フォームを行・列入りで開く (モーダルは廃止)。
  await expect(page.locator('#st-tail-from')).toHaveValue('Busy.Recv');
  await expect(page.locator('#st-tail-trig')).toHaveValue('sent');
  await page.locator('#st-tail-to').selectOption('Busy.Done');
  await page.locator('#st-tail-add').click();
  await page.waitForTimeout(400);
  const lines = (await dsl(page)).split('\n').map((l) => l.trim());
  const at = lines.indexOf('Recv --> Done : sent');
  expect(at).toBeGreaterThan(lines.indexOf('state Busy {'));
  expect(at).toBeLessThan(lines.indexOf('Idle --> Busy : start'));
  // 表にも子の遷移として出る
  await expect(page.locator('#state-table-body td[data-state-id="Busy.Recv"][data-trigger="sent"]'))
    .toHaveText('Busy / Done');

  // BLK-owner-20260923-2332-1: 表を開いても、見出しの「CSV で書き出し」にズームの帯が重ならず押せる。
  const csvBox = await page.locator('#btn-state-table-csv').boundingBox();
  const hudBox = await page.locator('#zoom-hud').boundingBox();
  expect(csvBox && hudBox).toBeTruthy();
  const overlap = !(csvBox.x + csvBox.width <= hudBox.x || hudBox.x + hudBox.width <= csvBox.x
    || csvBox.y + csvBox.height <= hudBox.y || hudBox.y + hudBox.height <= csvBox.y);
  expect(overlap).toBe(false);

  // BLK-owner-20260923-2332-1: 先輩や他ツールの図にある、最上位に `親.子` と修飾して書いた子どうしの遷移も
  // 同じ子の遷移として読む (表のマス・遷移一覧・下端の件数)。書き換えはしない。
  const withQualified = (await dsl(page)).replace('@enduml', 'Idle.Poll --> Idle.Sleep : nap\n@enduml');
  await S.typeDsl(page, withQualified);
  await page.waitForTimeout(600);
  await expect(page.locator('#state-table-body td[data-state-id="Idle.Poll"][data-trigger="nap"]'))
    .toHaveText('Idle / Sleep');
  await expect(page.locator('#status-info')).toContainText('8 states');
  expect(await dsl(page)).toContain('Idle.Poll --> Idle.Sleep : nap');
  // 遷移一覧から選ぶと、右パネルの From / To は `親 / 子` で並び、書かれた子が選ばれている。
  const qLine = (await dsl(page)).split('\n').findIndex((l) => l.trim().indexOf('Idle.Poll -->') === 0) + 1;
  const pick = page.locator('.st-tr-pick[data-line="' + qLine + '"]');
  await expect(pick).toHaveCount(1);
  await pick.click();
  await expect(page.locator('#st-tr-from')).toHaveValue('Idle.Poll');
  await expect(page.locator('#st-tr-to')).toHaveValue('Idle.Sleep');
  await expect(page.locator('#st-tr-from option:checked')).toHaveText('Idle / Poll');
  // 何も変えずに更新しても、書かれた修飾名のまま残る。
  await page.locator('#st-tr-update').click();
  await page.waitForTimeout(400);
  expect(await dsl(page)).toContain('Idle.Poll --> Idle.Sleep : nap');

  // BLK-builder-20260924-1202-b2-2 (design 4c): `state` 宣言の無い図 (遷移にだけ状態が出る) でも、
  // 図の遷移を押すと From / To にその状態が選ばれて開き、「更新」だけでは端が変わらない。
  await S.typeDsl(page, [
    '@startuml', 'title Sample State', '[*] --> Idle', 'Idle --> Running : start',
    'Running --> Idle : stop', 'Running --> [*] : done', '@enduml',
  ].join('\n'));
  await page.waitForTimeout(1500);
  const startLabel = page.locator('#preview-svg svg text', { hasText: 'start' }).first();
  await expect(startLabel).toBeVisible();
  // 図の上は当たり判定の層が受ける。ラベルの位置を実マウスで押す。
  const lb = await startLabel.boundingBox();
  expect(lb).toBeTruthy();
  await page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2);
  await expect(page.locator('#st-tr-from')).toHaveValue('Idle');
  await expect(page.locator('#st-tr-to')).toHaveValue('Running');
  await expect(page.locator('#st-tr-preview')).toContainText('Idle --> Running : start');
  await page.locator('#st-tr-update').click();
  await page.waitForTimeout(400);
  expect(await dsl(page)).toContain('Idle --> Running : start');
  expect(await dsl(page)).not.toContain('[*] --> [*]');
});

// BLK-human-20260923-2001: 開始 [*] を足すとき「最上位の開始か、どの親の中の開始か」を選べなかった。
test('手順9 開始・終了を「どこの」ものか選んで GUI だけで足し、既にあれば差し替えを聞かれる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, [
    '@startuml',
    'state Idle {',
    '  state Wait',
    '  state Poll',
    '}',
    'state Busy {',
    '  state Send',
    '  state Recv',
    '}',
    'Idle --> Busy : start',
    '@enduml',
  ].join('\n'));
  await page.evaluate(() => { if (window.MA.selection) window.MA.selection.clearSelection(); });
  await page.waitForTimeout(300);

  async function addPseudo(kind, scope, state) {
    await page.locator('#st-tail-kind-chip-pseudo').click();
    await page.locator('#st-ps-kind').selectOption(kind);
    await page.locator('#st-ps-scope').selectOption(scope);
    await page.locator('#st-ps-state').selectOption(state);
    await page.locator('#st-tail-add').click();
    await page.waitForTimeout(400);
  }
  await addPseudo('start', '', 'Idle');
  await addPseudo('start', 'Idle', 'Idle.Wait');
  await addPseudo('start', 'Busy', 'Busy.Send');
  await addPseudo('end', '', 'Busy');
  let lines = (await dsl(page)).split('\n');
  expect(lines.indexOf('[*] --> Idle')).toBeLessThan(lines.indexOf('Idle --> Busy : start'));
  expect(lines.indexOf('  [*] --> Wait')).toBe(lines.indexOf('state Idle {') + 1);
  expect(lines.indexOf('  [*] --> Send')).toBe(lines.indexOf('state Busy {') + 1);
  expect(lines).toContain('Busy --> [*]');

  // 既に開始がある Idle の中に 2 つ目を足そうとすると、差し替えるかを聞かれる
  await page.locator('#st-tail-kind-chip-pseudo').click();
  await page.locator('#st-ps-scope').selectOption('Idle');
  await expect(page.locator('#st-ps-hint')).toContainText('既に開始');
  page.once('dialog', (d) => d.accept());
  await page.locator('#st-ps-state').selectOption('Idle.Poll');
  await page.locator('#st-tail-add').click();
  await page.waitForTimeout(400);
  lines = (await dsl(page)).split('\n');
  expect(lines).toContain('  [*] --> Poll');
  expect(lines).not.toContain('  [*] --> Wait');

  // 表には最上位と各親の開始が別の行で出る
  await page.locator('#btn-state-table-toggle').click();
  const labels = (await page.locator('#state-table-body tbody th').allInnerTexts()).map((s) => s.replace(/[▾▸]/g, '').trim());
  expect(labels).toContain('（開始）');
  expect(labels).toContain('Idle / （開始）');
  expect(labels).toContain('Busy / （開始）');

  // プレビューの開始の丸も実マウスで選べ、どこの開始か (親名) が出る
  const hit = page.locator('#overlay-layer rect[data-type="pseudo"][data-id="start@Idle"]');
  await expect(hit).toHaveCount(1, { timeout: 10000 });
  const b = await hit.boundingBox();
  if (!b) throw new Error('no box: start@Idle');
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.locator('#st-pseudo-info')).toHaveAttribute('data-scope', 'Idle');
  await expect(page.locator('#st-pseudo-scope')).toHaveText('Idle の中');
  await expect(page.locator('#st-pseudo-links')).toContainText('[*] --> Poll');
  const top = page.locator('#overlay-layer rect[data-type="pseudo"][data-id="start@"]');
  const tb = await top.boundingBox();
  if (!tb) throw new Error('no box: start@');
  await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await expect(page.locator('#st-pseudo-scope')).toHaveText('最上位 (図全体)');
});

// BLK-human-20260923-2000: 遷移を続けて入れる。状態 5 つ・遷移 12 本 (同じトリガを 3 回使う) を
// GUI のフォームと図のクリックだけで入れ、DSL を一度も直接編集しない。
// 1 本あたりクリック 3 以下・打鍵はトリガ名の文字数 + 2 以下。
const FIVE_STATES = [
  '@startuml',
  'title ADC 状態遷移',
  'state Idle',
  'state Init',
  'state Ready',
  'state Busy',
  'state Error',
  '[*] --> Idle',
  '@enduml',
].join('\n');

test('手順9 遷移 12 本を、図で遷移先を押してトリガだけ打つ連続入力で入れる', async ({ page }) => {
  test.setTimeout(120 * 1000);
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, FIVE_STATES);
  await page.waitForTimeout(1500);

  let clicks = 0;
  let keys = 0;
  const perTr = [];
  const stateRect = (id) => page.locator('#overlay-layer rect[data-type="state"][data-id="' + id + '"]').first();
  async function click(loc) { await loc.click(); clicks++; }
  async function waitTrigFocus() {
    await expect(page.locator('#st-tail-trig')).toBeFocused();
  }
  // 候補から選ぶとき: 頭の数文字 → ↓ → Enter (候補を入れる) → Enter (確定)
  async function typeTrig(full, prefix) {
    await waitTrigFocus();
    if (prefix) {
      await page.keyboard.type(prefix); keys += prefix.length;
      await expect(page.locator('#st-tail-trig-sugg .st-tx-sugg-item').first()).toHaveText(full);
      await page.keyboard.press('ArrowDown'); keys++;
      await page.keyboard.press('Enter'); keys++;
      await expect(page.locator('#st-tail-trig')).toHaveValue(full);
    } else {
      await page.keyboard.type(full); keys += full.length;
    }
    await page.keyboard.press('Enter'); keys++;
  }
  let n = 0;
  async function one(to, trig, prefix) {
    const c0 = clicks, k0 = keys;
    await expect(page.locator('#st-tx-hint')).toContainText('遷移先');
    await click(stateRect(to));
    await typeTrig(trig, prefix);
    n++;
    await expect(page.locator('#st-tx-count')).toHaveText('この回に入れた遷移: ' + n + ' 本');
    await page.waitForTimeout(700);
    perTr.push({ trig, clicks: clicks - c0, keys: keys - k0 });
  }

  // 1 本目: 図で Idle を選び「ここから遷移」→ 図で Init を押す → トリガ + Enter (クリック 3)
  const c0 = clicks, k0 = keys;
  await click(stateRect('Idle'));
  await click(page.locator('#st-add-tx'));
  await click(stateRect('Init'));
  await typeTrig('power_on');
  n++;
  await expect(page.locator('#st-tx-count')).toHaveText('この回に入れた遷移: 1 本');
  await page.waitForTimeout(700);
  perTr.push({ trig: 'power_on', clicks: clicks - c0, keys: keys - k0 });

  // 2 本目以降: from は直前の遷移先。遷移先を図で 1 回押し、トリガだけ打つ。
  await one('Ready', 'init_done');
  await one('Busy', 'start');
  await one('Ready', 'done');
  await one('Ready', 'poll');                 // 自己遷移: 同じ状態を押す
  await one('Error', 'fault');
  await one('Idle', 'reset');
  await one('Busy', 'start', 'st');           // 2 回目の start は候補から
  await one('Error', 'fault', 'fa');
  await one('Init', 'reset', 're');
  await one('Error', 'fault', 'fa');
  await one('Ready', 'reset', 're');          // reset は 3 回目

  // 到達条件その1: 1 本あたりクリック 3 以下・打鍵はトリガ名 + 2 以下。
  perTr.forEach((p) => {
    expect(p.clicks, JSON.stringify(p)).toBeLessThanOrEqual(3);
    expect(p.keys, JSON.stringify(p)).toBeLessThanOrEqual(p.trig.length + 2);
  });

  // 到達条件その2: 12 本が `A --> B : trigger` の 1 行ずつで入り、同じ from の並びにまとまる。
  const text = await dsl(page);
  const trLines = text.split('\n').filter((l) => / --> /.test(l) && !/^\[\*\]/.test(l.trim()));
  expect(trLines).toEqual([
    'Idle --> Init : power_on',
    'Idle --> Busy : start',
    'Init --> Ready : init_done',
    'Init --> Error : fault',
    'Ready --> Busy : start',
    'Ready --> Ready : poll',
    'Ready --> Error : fault',
    'Busy --> Ready : done',
    'Busy --> Error : fault',
    'Error --> Idle : reset',
    'Error --> Init : reset',
    'Error --> Ready : reset',
  ]);
  expect(text.trim().endsWith('@enduml')).toBe(true);

  // 到達条件その3: Esc で回を閉じると、フォームは初期状態 (State) に戻る
  // (候補が開いていれば 1 回目の Esc は候補を閉じる)。
  await page.locator('#st-tail-trig').click();
  await page.keyboard.press('Escape');
  if (await page.locator('#st-tail-kind').inputValue() === 'transition') await page.keyboard.press('Escape');
  await expect(page.locator('#st-tail-kind')).toHaveValue('state');
});

test('手順9 状態遷移表の空欄から、行と列が埋まった同じ連続入力フォームが開く', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, TIMER_STATE);
  await page.waitForTimeout(1200);
  if (!(await page.locator('#state-table-body').isVisible())) await page.locator('#btn-state-table-toggle').click();
  await expect(page.locator('#state-table-body')).toBeVisible();
  // Ready 行 × Timer_Init 列 は空欄
  const cell = page.locator('#state-table-body td.stt-cell[data-state-id="Ready"][data-trigger="Timer_Init"]');
  await cell.click();
  await expect(page.locator('#st-tail-kind')).toHaveValue('transition');
  await expect(page.locator('#st-tail-from')).toHaveValue('Ready');
  await expect(page.locator('#st-tail-trig')).toHaveValue('Timer_Init');
  await expect(page.locator('#st-tail-trig')).toBeFocused();
  await page.locator('#st-tail-to').selectOption('Uninit');
  await page.locator('#st-tail-trig').press('Enter');
  await expect(page.locator('#st-tx-count')).toHaveText('この回に入れた遷移: 1 本');
  const text = await dsl(page);
  // Ready から出る遷移の並びの末尾 (Ready --> Busy の直後) に入る。
  const lines = text.split('\n');
  expect(lines[lines.indexOf('Ready --> Busy : Timer_Start') + 1]).toBe('Ready --> Uninit : Timer_Init');
});
