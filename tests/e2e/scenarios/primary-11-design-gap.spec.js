// @ts-check
// primary 台本 手順11: design/README.md の「対象の仕様」を上から 1 ファイル開き、
// 仕様に描かれていて現状の GUI に無い操作・画面を 1 つ選んで BLK にする。
// spec 側で見るのは「仕様書が読める場所にあり、GUI と突き合わせられる」ことまで。
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DESIGN = path.join('E:', '01_Loop', 'loop', 'design');
const DIR = S.dirFor(__filename);

test('手順11 仕様の「対象の仕様」を読み、GUI と突き合わせられる', async ({ page }) => {
  const readme = path.join(DESIGN, 'README.md');
  test.skip(!fs.existsSync(readme), 'design/README.md が無い環境では突き合わせができない');

  const text = fs.readFileSync(readme, 'utf8');
  // 到達条件その1: 「対象の仕様」の一覧が読め、そこに挙がったファイルが実在する。
  expect(text).toContain('対象の仕様');
  const files = (text.match(/[^`\n]+\.dc\.html/g) || []).map((f) => f.replace(/^`/, ''));
  expect(files.length).toBeGreaterThan(0);
  const present = files.filter((f) => fs.existsSync(path.join(DESIGN, f)));
  expect(present.length).toBeGreaterThan(0);

  // 到達条件その2: 突き合わせる相手の GUI が実際に立ち上がる。
  await S.bootWithSaveDir(page, DIR);
  await expect(page.locator('#preview-svg')).toBeVisible();
  await expect(page.locator('#btn-tab-folder')).toBeVisible();
});

// 📐 仕様突合 は 7b どおり畳まれているので、入口は Ctrl+K に寄せる。
async function openDesignCheck(page) {
  // 読み込み直後はどこにも焦点が無く Ctrl+K が届かないので、画面が組み上がるのを
  // 待って本文に焦点を置いてから押す (設定を戻した直後は読み込み直しの途中で届かない)。
  await page.waitForSelector('#preview-svg');
  await page.waitForTimeout(800);
  await page.locator('#editor').click();
  await page.keyboard.press('Control+k');
  await page.waitForSelector('#cp-modal');
  await page.locator('#cp-input').fill('仕様突合');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#dc-modal .dc-table');
}

// BLK-primary-20260915-2240-wish: 仕様と GUI の食い違いが「仕様後退」なのか
// 「この環境の設定が既定と違うだけ」なのかを GUI から判定できず、手順 11 が
// 原因の切り分けをできないまま終わっていた。📐 仕様突合 でその 1 手を守る。
test('手順11 仕様突合 が、仕様と現在値を並べて不一致を設定差と仕様後退に分ける', async ({ page }) => {
  // 既定そのものを見る手順なので、helper に畳み方を書かせない (foldedTools)。
  await S.bootWithSaveDir(page, DIR, { foldedTools: true });

  // 到達条件その1: Ctrl+K から入口に着く (7b: 機能はコマンドパレットから引く)。
  await page.keyboard.press('Control+k');
  await page.waitForSelector('#cp-modal');
  await page.locator('#cp-input').fill('仕様突合');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#dc-modal .dc-table');

  // 到達条件その2: 仕様項目が出典 (.dc.html と案番号) つきで並ぶ。
  const rows = page.locator('#dc-modal .dc-row');
  expect(await rows.count()).toBeGreaterThan(0);
  await expect(page.locator('#dc-modal')).toContainText('.dc.html');

  // 到達条件その3: 既定の環境では仕様後退が 0 件だと言い切る (保留にしない)。
  const summary = await page.locator('#dc-summary').textContent();
  expect(summary).not.toContain('仕様後退');

  // 判定はどの行も「一致 / 設定差 / 仕様後退」のどれかに落ちている。
  const verdicts = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-verdict')));
  expect(verdicts.every((v) => ['ok', 'setting', 'gap'].includes(v))).toBe(true);
});

// BLK-primary-20260915-2240-friction: 突合項目が 2 ファイルぶんしか無いと、残りの
// 仕様ファイルは結局 .dc.html を grep して読むことになり、手順 11 の手作業が半分残る。
// 「対象の仕様」6 ファイル全部を機械で見ていること、出典ごとに読めることを守る。
test('手順11 突合は design の「対象の仕様」6 ファイル全部を見ていて、出典で絞って読める', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR, { foldedTools: true });
  await openDesignCheck(page);

  // 到達条件その1: 手で grep する必要のあるファイルが残っていないと言い切る。
  await expect(page.locator('#dc-coverage')).toContainText('6 ファイル中 6 ファイル');
  await expect(page.locator('#dc-coverage')).toContainText('grep で読む必要のあるファイルは無い');

  // 到達条件その2: 出典の選択肢が 6 ファイルぶんあり、どれも項目を持つ (0 件が無い)。
  const opts = page.locator('#dc-spec option');
  expect(await opts.count()).toBe(7); // すべての出典 + 6 ファイル
  const labels = await opts.evaluateAll((els) => els.map((e) => e.textContent || ''));
  expect(labels.slice(1).some((t) => / \(0\)$/.test(t))).toBe(false);

  // 到達条件その3: 1 ファイルに絞ると、その出典の行だけが残る。
  const target = 'PlantUMLAssist - 1a 設定と網羅.dc.html';
  await page.locator('#dc-spec').selectOption(target);
  const specs = await page.locator('#dc-modal .dc-row').evaluateAll(
    (els) => els.map((e) => (e.textContent || '')));
  expect(specs.length).toBeGreaterThan(0);
  expect(specs.every((t) => t.includes(target))).toBe(true);

  // 到達条件その4: その場面でだけ出る項目は「組み込まれているかを見る」と断ってある
  // (設定モーダルを開いていないだけの状態を仕様後退と読まないため)。
  await expect(page.locator('#dc-modal .dc-scope').first()).toContainText('その場面でだけ出る');
});

test('手順11 設定を既定から変えた環境の不一致は「設定差」と名指しされ、その場で戻せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR, { foldedTools: true });
  // 「機能ボタンを畳む」を自分で解いた人と同じ状態にする (7a/7b の既定は畳む)。
  // この設定は localStorage を消してから開き直しても効くよう、逃がし鍵の下で書く。
  await page.evaluate(() => {
    try {
      localStorage.setItem('pua.e2e.keep', '1');
      localStorage.setItem('plantuml-tools-folded', '0');
    } catch (e) {}
  });
  await page.reload();
  await page.waitForSelector('#editor');

  await openDesignCheck(page);

  // 到達条件その1: タブ列の項目が「設定差」と名指しされる (仕様後退にしない)。
  const row = page.locator('#dc-modal .dc-row[data-verdict="setting"]').first();
  await expect(row).toContainText('設定差');
  await expect(row).toContainText('既定に戻せば');

  // 到達条件その2: その場で既定に戻せて、戻すと一致になる。
  await row.locator('.dc-reset').click();
  await page.waitForSelector('#editor');
  expect(await page.evaluate(() => localStorage.getItem('plantuml-tools-folded'))).toBe(null);

  // 到達条件その3: 戻したあと測り直すと設定差が消える (残れば仕様後退だと分かる)。
  await openDesignCheck(page);
  await expect(page.locator('#dc-modal .dc-row[data-verdict="setting"]')).toHaveCount(0);
  await expect(page.locator('#dc-summary')).toContainText('すべて仕様どおり');
});

// BLK-builder-20260924-1202-2 (design 4a/4b/4c): ズームの帯は図種名を名乗る (「Class · 100%」)。
// 図種の違う本文を打ち込む・貼ると、右パネルと下端の件数はその図種に替わるのに、帯・左レール・
// 上端の図種欄は元の Sequence のままで、どの図種を見ているかを 3 か所が違うことを言っていた。
test('手順11 本文の図種が変わると、ズームの帯・左レール・図種欄もその図種を名乗り、本文は変わらない', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  const NL = String.fromCharCode(10);
  const CLS = ['@startuml', 'title Sample Class', 'class Circle {', '- radius : double', '}', 'Shape <|-- Circle', '@enduml'].join(NL);
  const ST = ['@startuml', 'title Sample State', '[*] --> Idle', 'Idle --> Running : start', '@enduml'].join(NL);

  await S.typeDsl(page, CLS);
  await page.waitForTimeout(800);
  await expect(page.locator('#zoom-hud')).toContainText('Class');
  await expect(page.locator('#rail-types .rail-btn.active')).toHaveAttribute('data-type', 'plantuml-class');
  await expect(page.locator('#diagram-type')).toHaveValue('plantuml-class');
  expect(await page.locator('#editor').inputValue()).toBe(CLS);

  // 今と同じ図種を選び直しても、本文は見本や下書きに入れ替わらない。
  await page.locator('#rail-types .rail-btn[data-type="plantuml-class"]').click();
  await page.waitForTimeout(500);
  expect(await page.locator('#editor').inputValue()).toBe(CLS);

  await S.typeDsl(page, ST);
  await page.waitForTimeout(800);
  await expect(page.locator('#zoom-hud')).toContainText('State');
  await expect(page.locator('#rail-types .rail-btn.active')).toHaveAttribute('data-type', 'plantuml-state');
  await expect(page.locator('#diagram-type')).toHaveValue('plantuml-state');
  expect(await page.locator('#editor').inputValue()).toBe(ST);
});

// BLK-builder-20260924-1245-2 (design 4a「関係を追加」): 図で選んだクラスの右パネルから、
// そのクラスを一端にして関係を 1 本引ける。選択を外して追加ペインの Relation へ行き
// From を選び直す遠回りをしない。継承は「選んだクラスが子」を既定にする。
test('手順11 図で選んだクラスの右パネルから、そのクラスの関係をその場で足せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  const NL = String.fromCharCode(10);
  const CLS = ['@startuml', 'title Sample Class', 'abstract class Shape', 'class Circle {', '- radius : double', '}',
    'interface Drawable', '@enduml'].join(NL);
  await S.typeDsl(page, CLS);
  await page.waitForTimeout(1500);

  const hit = page.locator('#overlay-layer rect.selectable[data-type="class"][data-id="Circle"]').first();
  await expect(hit).toBeAttached({ timeout: 10000 });
  const hb = await hit.boundingBox();
  await page.mouse.click(hb.x + hb.width / 2, hb.y + 8);
  await page.waitForTimeout(400);

  // 到達条件その1: 選んだクラスの右パネルに「関係を追加」があり、開くと種類のカード・相手・組み立てられる行が出る。
  await page.locator('#cl-reladd > summary').click();
  await page.locator('#cl-reladd .cl-reladd-card[data-value="inheritance"]').click();
  await page.locator('#cl-reladd-other').selectOption('Shape');
  await expect(page.locator('#cl-reladd-preview')).toHaveText('Shape <|-- Circle');
  await page.locator('#cl-reladd-go').click();
  await page.waitForTimeout(800);
  expect(await page.locator('#editor').inputValue()).toContain('Shape <|-- Circle');

  // 到達条件その2: 足したあとも選んだクラスのまま「関係を追加」が開いていて、続けて 2 本目を引ける。
  await expect(page.locator('#cl-reladd')).toHaveAttribute('open', '');
  await page.locator('#cl-reladd .cl-reladd-card[data-value="implementation"]').click();
  await page.locator('#cl-reladd-other').selectOption('Drawable');
  await expect(page.locator('#cl-reladd-preview')).toHaveText('Drawable <|.. Circle');
  await page.locator('#cl-reladd-go').click();
  await page.waitForTimeout(800);
  expect(await page.locator('#editor').inputValue()).toContain('Drawable <|.. Circle');
});

// BLK-builder-20260924-1252-2 (design 4c「状態を追加 / Add state」と「追加する位置」): 図で選んだ遷移の右パネルから、
// その遷移の途中に状態を挟める。選択を外して追加タブの State →「この遷移の途中」→ 挟む遷移を選び直す遠回りをしない。
test('手順11 図で選んだ遷移の右パネルから、その遷移の途中・From の中に状態を足せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  const NL = String.fromCharCode(10);
  const ST = ['@startuml', 'title Sample State', '[*] --> Idle', 'Idle --> Running : start', 'Running --> Idle : stop',
    'Running --> [*] : done', '@enduml'].join(NL);
  await S.typeDsl(page, ST);
  await page.waitForTimeout(1500);

  async function pickLabel(text) {
    const label = page.locator('#preview-svg svg text', { hasText: text }).first();
    await expect(label).toBeVisible({ timeout: 10000 });
    const bb = await label.boundingBox();
    await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(400);
  }

  // 到達条件その1: 遷移「start」を選んだパネルに「状態を追加」があり、位置の既定は「この遷移の途中」。名前を入れて押すと
  // 選んでいた遷移が新しい状態を経由する 2 本に割れ (きっかけは前半)、足した状態が選ばれる。
  await pickLabel('start');
  await expect(page.locator('#st-tr-addstate')).toContainText('状態を追加');
  await expect(page.locator('#st-tr-add-where')).toHaveValue('transition');
  await page.locator('#st-tr-add-id').fill('Checking');
  await page.locator('#st-tr-add').click();
  await page.waitForTimeout(800);
  expect(await page.locator('#editor').inputValue())
    .toContain(['state Checking', 'Idle --> Checking : start', 'Checking --> Running'].join(NL));
  await expect(page.locator('#st-id')).toHaveValue('Checking');

  // 到達条件その2: 遷移「stop」を選び、位置を「Running の中」にして名前を空のまま押すと、Running の子状態が入る。
  await pickLabel('stop');
  await page.locator('#st-tr-add-where').selectOption('inside');
  await expect(page.locator('#st-tr-add-where option:checked')).toHaveText('Running の中');
  await page.locator('#st-tr-add').click();
  await page.waitForTimeout(800);
  expect(await page.locator('#editor').inputValue()).toContain(['state Running {', '  state NewState', '}'].join(NL));
  expect(await page.locator('#editor').inputValue()).toContain('Running --> Idle : stop');

  // 到達条件その3 (BLK-builder-20260924-2341-1, design 4c の残り): 種類に H 履歴 / 開始 [*] / 終了 [*] と「その他… ▾」がある。
  // その他… ▾ の 並行状態 fork を選ぶと、選択 choice と同じく遷移の途中に <<fork>> が挟まる。
  await pickLabel('stop');
  const kinds = await page.locator('#st-tr-add-kind .prop-seg').allTextContents();
  expect(kinds).toEqual(['単純状態', '複合状態', '選択 choice', 'H 履歴', '開始 [*]', '終了 [*]']);
  await page.locator('#st-tr-add-more').click();
  await page.locator('#st-tr-add-other .prop-seg[data-value="fork"]').click();
  await expect(page.locator('#st-tr-add-where')).toHaveValue('transition');
  await page.locator('#st-tr-add-id').fill('F1');
  await page.locator('#st-tr-add').click();
  await page.waitForTimeout(800);
  const afterFork = await page.locator('#editor').inputValue();
  expect(afterFork).toContain(['state F1 <<fork>>', 'Running --> F1 : stop', 'F1 --> Idle'].join(NL));

  // 到達条件その4: 開始・終了・履歴は相手が遷移で決まり、書かれる行を先に見せる。
  // 「done」(Running --> [*]) では履歴は押せず理由が出る。開始は Running を最上位の開始にし、既にある開始は聞いてから差し替える。
  await pickLabel('done');
  await page.locator('#st-tr-add-kind .prop-seg[data-value="history"]').click();
  await expect(page.locator('#st-tr-add')).toBeDisabled();
  await expect(page.locator('#st-tr-add-hint')).toContainText('複合状態');
  await page.locator('#st-tr-add-kind .prop-seg[data-value="start"]').click();
  await expect(page.locator('#st-tr-add-line')).toHaveText('[*] --> Running');
  page.once('dialog', (d) => d.accept());
  await page.locator('#st-tr-add').click();
  await page.waitForTimeout(800);
  const afterStart = (await page.locator('#editor').inputValue()).split(NL);
  expect(afterStart).toContain('[*] --> Running');
  expect(afterStart).not.toContain('[*] --> Idle');

  // 到達条件その5 (BLK-builder-20260924-2350-1): その他… ▾ の 状態内の動作 / 並行領域に分ける で、遷移の端の状態に付ける。
  // 「start」(Idle --> Checking) の To の Checking に entry 動作を、「stop」(Running --> F1) の From の Running (複合状態) に -- を足す。
  await pickLabel('start');
  await page.locator('#st-tr-add-more').click();
  await page.locator('#st-tr-add-other .prop-seg[data-value="behavior"]').click();
  await expect(page.locator('#st-tr-add-target option:checked')).toHaveText('Checking (To)');
  await page.locator('#st-tr-add-bval').fill('motorOn()');
  await expect(page.locator('#st-tr-add-line')).toHaveText('Checking : entry / motorOn()');
  await page.locator('#st-tr-add').click();
  await page.waitForTimeout(800);
  expect((await page.locator('#editor').inputValue()).split(NL)).toContain('Checking : entry / motorOn()');

  await pickLabel('stop');
  await page.locator('#st-tr-add-other .prop-seg[data-value="region"]').click();
  await expect(page.locator('#st-tr-add')).toBeDisabled();   // To の F1 は中を持たない
  await page.locator('#st-tr-add-target').selectOption('from');
  await expect(page.locator('#st-tr-add')).toBeEnabled();
  await page.locator('#st-tr-add').click();
  await page.waitForTimeout(800);
  expect(await page.locator('#editor').inputValue()).toContain(['state Running {', '  state NewState', '  --', '}'].join(NL));
});

// BLK-builder-20260924-1252-3 (design 4b「Activity — 途中に挿入」の右パネル): 図で選んだアクションの
// 右パネルは「Action · N 行目」と名前を見出しにし、ラベル → スイムレーン → 位置 → この位置に挿入 →
// ノートを添える → ↑ ↓ → 削除 / Delete の順に日本語で並ぶ。ノートはその場で添えられる。
test('手順11 図で選んだアクションの右パネルが design 4b の見出し・並びで、ノートをその場で添えられる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  const NL = String.fromCharCode(10);
  const ACT = ['@startuml', 'title Sample Activity', 'start', ':入力を受け取る;', 'if (有効?) then (yes)', ':保存する;',
    'else (no)', ':エラーを返す;', 'endif', 'stop', '@enduml'].join(NL);
  await S.typeDsl(page, ACT);
  await page.waitForTimeout(1500);

  const hit = page.locator('#overlay-layer rect.selectable[data-type="action"][data-line="6"]').first();
  await expect(hit).toBeAttached({ timeout: 10000 });
  const hb = await hit.boundingBox();
  await page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.waitForTimeout(400);

  // 到達条件その1: 見出しが「Action · 6 行目 / 保存する」、欄は「ラベル / Label」。
  await expect(page.locator('#ac-action-head')).toContainText('Action · 6 行目');
  await expect(page.locator('#ac-action-name')).toHaveText('保存する');
  await expect(page.locator('#ac-action-label')).toContainText('ラベル / Label');
  await expect(page.locator('#ac-action-delete')).toHaveText('削除 / Delete');

  // 到達条件その2: 並びが design 4b の順 (上から下へ)。
  const ys = [];
  for (const sel of ['#ac-action-text', '#ac-swimlane', '#ac-action-place', '#ac-insert-before', '#ac-add-note-btn', '#ac-move-up', '#ac-action-delete']) {
    const b = await page.locator(sel).boundingBox();
    ys.push(b.y);
  }
  for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]);

  // 到達条件その3: 「ノートを添える」から本文を書いて添えると、そのアクションの後ろに note が入る。
  await page.locator('#ac-add-note-btn').click();
  await page.locator('#ac-new-ntext').fill('上書きする');
  await page.locator('#ac-new-nadd').click();
  await page.waitForTimeout(800);
  const lines = (await page.locator('#editor').inputValue()).split(NL);
  expect(lines[6]).toContain('note right');
  expect(lines[6]).toContain('上書きする');
});

// BLK-builder-20260924-1305-2 (design 4a / 4c の見出し): 選んだクラス・遷移の右パネルは「Class · 6 行目」「Transition · 4 行目」と
// その下に名前 (Circle / Idle → Running) を出す。欄の名前は日本語で、クラスの削除はパネルの末尾に「クラスを削除」。
test('手順11 クラス・遷移を選んだ右パネルの見出しは「種類 · N 行目」と名前で、クラスを削除は末尾にある', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  const NL = String.fromCharCode(10);
  const CLS = ['@startuml', 'title Sample Class', 'abstract class Shape {', '+ {abstract} area() : double', '}',
    'class Circle {', '- radius : double', '+ area() : double', '}', 'Shape <|-- Circle', '@enduml'].join(NL);
  await S.typeDsl(page, CLS);
  await page.waitForTimeout(1500);
  const hit = page.locator('#overlay-layer rect.selectable[data-type="class"][data-id="Circle"]').first();
  await expect(hit).toBeAttached({ timeout: 10000 });
  const hb = await hit.boundingBox();
  await page.mouse.click(hb.x + hb.width / 2, hb.y + 8);
  await page.waitForTimeout(400);

  await expect(page.locator('#cl-sel-head')).toHaveText('Class · 6 行目');
  await expect(page.locator('#cl-sel-name')).toHaveText('Circle');
  const panel = page.locator('#props-content');
  await expect(panel).toContainText('ステレオタイプ');
  await expect(panel).not.toContainText('Stereotype');
  await expect(panel).not.toContainText('Notes');
  // クラスを削除はパネルの最後のボタン (属性・メソッド・関係を追加・ノートの後ろ)。
  await expect(panel.locator('button:visible').last()).toHaveText('クラスを削除');
  await expect(page.locator('#cl-delete')).toHaveText('クラスを削除');

  const ST = ['@startuml', 'title Sample State', '[*] --> Idle', 'Idle --> Running : start', 'Running --> Idle : stop', '@enduml'].join(NL);
  await S.typeDsl(page, ST);
  await page.waitForTimeout(1500);
  const label = page.locator('#preview-svg svg text', { hasText: 'start' }).first();
  await expect(label).toBeVisible({ timeout: 10000 });
  const bb = await label.boundingBox();
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.waitForTimeout(400);
  await expect(page.locator('#st-tr-head')).toHaveText('Transition · 4 行目');
  await expect(page.locator('#st-tr-name')).toHaveText('Idle → Running');
});

// BLK-builder-20260924-1320-2 (design 4a「種別 / Kind」): 種別を押したあとも同じクラスを選んだまま続けて直せ、
// enum にしたあとも種別の欄から class に戻せる。
test('手順11 クラスの種別を切り替えても選んだまま、enum からも種別の欄で戻せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  const NL = String.fromCharCode(10);
  const CLS = ['@startuml', 'title Sample Class', 'abstract class Shape {', '+ {abstract} area() : double', '}',
    'class Circle {', '- radius : double', '+ area() : double', '}', 'Shape <|-- Circle', '@enduml'].join(NL);
  await S.typeDsl(page, CLS);
  await page.waitForTimeout(1500);
  const hit = page.locator('#overlay-layer rect.selectable[data-id="Circle"]').first();
  await expect(hit).toBeAttached({ timeout: 10000 });
  const hb = await hit.boundingBox();
  await page.mouse.click(hb.x + hb.width / 2, hb.y + 8);
  await page.waitForTimeout(400);
  await expect(page.locator('#cl-sel-head')).toHaveText('Class · 6 行目');

  await page.locator('.cl-kind-btn[data-kind="interface"]').click();
  await page.waitForTimeout(800);
  expect(await page.locator('#editor').inputValue()).toContain('interface Circle {');
  await expect(page.locator('#cl-sel-head')).toHaveText('Interface · 6 行目');
  await expect(page.locator('#cl-sel-name')).toHaveText('Circle');

  await page.locator('.cl-kind-btn[data-kind="enum"]').click();
  await page.waitForTimeout(800);
  expect(await page.locator('#editor').inputValue()).toContain('enum Circle {');
  await expect(page.locator('#cl-sel-head')).toHaveText('Enum · 6 行目');
  await expect(page.locator('.cl-kind-btn[data-kind="enum"]')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('.cl-kind-btn[data-kind="class"]').click();
  await page.waitForTimeout(800);
  const t = await page.locator('#editor').inputValue();
  expect(t).toContain(['class Circle {', '- radius : double', '+ area() : double', '}'].join(NL));
  await expect(page.locator('#cl-sel-head')).toHaveText('Class · 6 行目');
});

// BLK-builder-20260924-1337-4 (design 7b): タブ列を畳むと、道具に気付く手掛かりは Ctrl+K だけになる。
// 行の左に「確かめる」と出ているのにその語では 0 件だったので、道具の名前を知らない人は引けなかった。
test('手順11 Ctrl+K に分類の語「確かめ」を打つと、確かめるの道具が並ぶ', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR, { foldedTools: true });
  await page.waitForSelector('#preview-svg');
  await page.waitForTimeout(800);
  await page.locator('#editor').click();
  await page.keyboard.press('Control+k');
  await page.waitForSelector('#cp-modal');
  await page.locator('#cp-input').pressSequentially('確かめ');

  const rows = page.locator('#cp-list .cp-item');
  await expect(rows.first()).toBeVisible();
  // 並ぶのは「確かめる」の見出しの道具で、表記揺れの突き合わせ (▦ 突合ボード) も入っている
  // (BLK-owner-20260924-1332-prune: 🔍 名前突合は突合ボードの行に畳んだ)。
  await expect(page.locator('#cp-list .cp-group[data-cp-group="check"]')).toBeVisible();
  await expect(page.locator('#cp-list .cp-item[data-cp-id="check:tab-cross"]')).toBeVisible();
  const kinds = await page.locator('#cp-list .cp-item[data-cp-id^="check:"] .cp-kind').allTextContents();
  expect(kinds.length).toBeGreaterThan(2);
  expect(kinds.every((k) => k === '確かめる')).toBe(true);

  // 行を押すとその道具が開く (分類の語で引いた行も、名前で引いた行と同じに動く)。
  await page.locator('#cp-list .cp-item[data-cp-id="check:tab-cross"]').click();
  await expect(page.locator('#cp-modal')).toBeHidden();
  await expect(page.locator('#ab-modal')).toBeVisible();
});

// BLK-builder-20260924-1341-4 (design 9b): ツール ▾ の右列は小見出しごとにまとまり、同じ小見出しが 2 度出ない。
// 「確かめる」で「まとめて点検」「渡す前に」が 2 回ずつ出て、同じ仲間の道具が離れて並んでいた。
test('手順11 ツール ▾ の「確かめる」は 名前と系統 / まとめて点検 / 渡す前に が 1 回ずつ並ぶ', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR, { foldedTools: true });
  await page.locator('#btn-tab-tools-mini').click();
  await expect(page.locator('#tool-menu')).toBeVisible();
  await page.locator('#tool-menu .tool-menu-cat[data-group="check"]').hover();
  const pane = page.locator('#tool-menu .tool-menu-group[data-group="check"]');
  await expect(pane).toBeVisible();
  await expect(pane.locator('.tool-menu-sub')).toHaveText(['名前と系統', 'まとめて点検', '渡す前に']);
  await expect(pane.locator('.tool-menu-item .tool-menu-label')).toHaveText([
    '系統内の動作名のずれ', '系統マップの崩れ', '状態遷移のトレース漏れ',
    '突合ボード (表記揺れ・宣言なし・メソッドも 1 画面で)', '1 つの観点で全図を棚卸し', '仕様 (design) と現在値の突合',
    '提出前チェック', '引き継ぎチェックリスト', '監査履歴',
  ]);

  // 「書き換える」も まとめて直す が 1 回だけ。
  await page.locator('#tool-menu .tool-menu-cat[data-group="edit"]').hover();
  await expect(page.locator('#tool-menu .tool-menu-group[data-group="edit"] .tool-menu-sub'))
    .toHaveText(['まとめて直す', '表記を揃える']);

  // 並びを変えても押した項目がその道具を開く (仕様突合)。
  await page.locator('#tool-menu .tool-menu-cat[data-group="check"]').hover();
  await pane.locator('.tool-menu-item[data-target="btn-tab-design"]').click();
  await page.waitForSelector('#dc-modal .dc-table');
});

// BLK-builder-20260924-1815-3 (design 9b / 9a): ツール ▾ のパネルは絞り込み欄と 2 段だけ。下端に
// 「タブ列に戻す」「ツール ▾ をタブ列に出す」が常に出て、押すと 9a が外した絵文字の機能ボタンが戻ったり、
// 右端のツール ▾ が ＋ の隣へ動いたりした。既定の人には出さず、既定から外した人には戻す 1 行だけを出す。
test('手順11 既定のツール ▾ のパネルに切り替えの行は出ず、畳みを解いた人には既定へ戻す 1 行だけが出る', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR, { foldedTools: true });
  await page.locator('#btn-tab-tools-mini').click();
  await expect(page.locator('#tool-menu')).toBeVisible();
  await expect(page.locator('#tool-menu .tool-menu-foot')).toHaveCount(0);
  await expect(page.locator('#tool-menu-fold')).toHaveCount(0);
  await expect(page.locator('#tool-menu-quiet')).toHaveCount(0);
  await expect(page.locator('#tool-menu')).not.toContainText('タブ列に戻す');
  await expect(page.locator('#tool-menu')).not.toContainText('ツール ▾ をタブ列に出す');
  await page.keyboard.press('Escape');

  // 以前に自分で畳みを解いた人 (機能ボタンがタブ列に並んでいる)。
  await page.evaluate(() => {
    try { localStorage.setItem('pua.e2e.keep', '1'); localStorage.setItem('plantuml-tools-folded', '0'); } catch (e) {}
  });
  await page.reload();
  await page.waitForSelector('#editor');
  await expect(page.locator('#btn-tab-rename')).toBeVisible();
  await page.locator('#btn-tab-tools').click();
  await expect(page.locator('#tool-menu .tool-menu-foot .tool-menu-item')).toHaveText(['タブ列から畳む']);
  await page.locator('#tool-menu-fold').click();
  // 既定に戻る: 機能ボタンは畳まれ、入口は右端の「ツール ▾」。値は既定と同じ '1' になり、次に開いても既定のまま。
  await expect(page.locator('#btn-tab-rename')).toBeHidden();
  await expect(page.locator('#btn-tab-tools-mini')).toBeVisible();
  await expect(page.locator('#btn-tab-tools')).toBeHidden();
  expect(await page.evaluate(() => [localStorage.getItem('plantuml-tools-folded'), localStorage.getItem('plantuml-tools-quiet')]))
    .toEqual(['1', '1']);
  await page.reload();
  await page.waitForSelector('#editor');
  await expect(page.locator('#btn-tab-rename')).toBeHidden();
  await page.locator('#btn-tab-tools-mini').click();
  await expect(page.locator('#tool-menu .tool-menu-foot')).toHaveCount(0);
});

// BLK-builder-20260924-1416-3 (design 7a / 9a / 10a): ツールの入口は枠付きの「ツール ▾」をタブ列の右端に置く。
// 以前は「他 28 件」という札が ＋ の直後に出て、何の件数か押すまで読めず、図のタブが増えると位置もずれた。
test('手順11 既定のタブ列ではツールの入口が右端の「ツール ▾」で、図のタブが増えても右端に見えている', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR, { foldedTools: true });
  const bar = page.locator('#tab-bar');
  const tools = page.locator('#btn-tab-tools-mini');
  await expect(tools).toBeVisible();
  await expect(tools).toHaveText('ツール ▾');
  // 畳んでいる件数は title で読める。
  await expect(tools).toHaveAttribute('title', /畳んでいるツール \d+ 件/);
  // 枠付き (7a / 9a: ツール ▾ だけを枠付きで)。
  const border = await tools.evaluate((el) => getComputedStyle(el).borderTopStyle);
  expect(border).toBe('solid');

  // 右端: 札の右端がタブ列の右端 (内側の余白ぶん) に揃い、＋ とは離れている。
  const right = async () => {
    const b = await bar.boundingBox();
    const t = await tools.boundingBox();
    return { bar: b, tools: t };
  };
  let r = await right();
  expect(r.bar && r.tools).toBeTruthy();
  expect((r.bar.x + r.bar.width) - (r.tools.x + r.tools.width)).toBeLessThanOrEqual(8);
  const plus = await page.locator('#btn-tab-new').boundingBox();
  expect(r.tools.x - (plus.x + plus.width)).toBeGreaterThan(20);

  // 図のタブを増やしてタブ列が横に流れても、入口は右端に見えたまま押せる。
  for (let i = 0; i < 6; i++) await page.locator('#btn-tab-new').click();
  await expect(page.locator('#tab-bar .tab')).toHaveCount(7);
  r = await right();
  expect((r.bar.x + r.bar.width) - (r.tools.x + r.tools.width)).toBeLessThanOrEqual(8);
  // ＋ も札の左に見えたまま (流れてきたタブにも札にも隠れない。9a: ＋ は図タブの隣)。
  const plusHit = await page.locator('#btn-tab-new').evaluate((el) => {
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  });
  expect(plusHit).toBe(true);
  await tools.click();
  await expect(page.locator('#tool-menu')).toBeVisible();
  await expect(page.locator('#tool-menu .tool-menu-cat .tool-cat-name')).toHaveText([
    '図をつくる', '書き換える', '探す', '確かめる', 'レビュー', '渡す',
  ]);
});

// BLK-builder-20260924-1427-3 (design 7a / 10a): プレビューの見出しは「Rendered · 32ms」。
// 以前は「OK (local)」で、かかった時間が出ず、描画方法が上部バーの「local · 32ms」と 2 か所に出ていた。
test('手順11 プレビューの見出しは「Rendered · N ms」で、数は上部バーと同じ', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR, { foldedTools: true });
  const head = page.locator('#render-status');
  await expect(head).toHaveText(/^Rendered · \d+(ms|(\.\d)?s)$/, { timeout: 25000 });
  const top = (await page.locator('#top-render-status').textContent()) || '';
  const ms = ((await head.textContent()) || '').replace('Rendered · ', '');
  expect(top).toBe('local · ' + ms);
  // 描画方法は見出しの文字には出さず、title で読める。
  await expect(head).not.toContainText('local');
  await expect(head).toHaveAttribute('title', '描画: local');
});

// BLK-builder-20260924-1636-1 (design 7a / 7b / 10a): タブと FILES「開いている図」の行は「spi_init_sequence.puml」と
// 保存されるファイル名で出す。以前は「diagram1」と拡張子なしで、上部バーの「diagram1.puml」と 2 通りの名前が並んでいた。
test('手順11 タブと開いている図の行は上部バーと同じ「名前.puml」で出る', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR, { foldedTools: true });
  const top = page.locator('#top-file-name');
  await expect(top).toHaveText(/\.puml$/);
  const topName = ((await top.textContent()) || '').trim();
  const tab = page.locator('#tab-bar .tab.active');
  await expect(tab.locator('.tab-label')).toHaveText(topName);
  // 名前の受け渡し (data-doc-name) は拡張子なしの図名のまま。
  const docName = await tab.getAttribute('data-doc-name');
  expect(docName + '.puml').toBe(topName);
  const row = page.locator('#files-body-open .files-row[data-file-name="' + docName + '"] .files-row-name');
  await expect(row).toHaveText(topName);

  // 図を足しても、足した図のタブ・行も .puml 付き。
  await page.locator('#btn-tab-new').click();
  await expect(page.locator('#tab-bar .tab')).toHaveCount(2);
  const labels = await page.locator('#tab-bar .tab .tab-label').allTextContents();
  expect(labels.every((t) => /\.puml$/.test(t))).toBe(true);
  const rows = await page.locator('#files-body-open .files-row .files-row-name').allTextContents();
  expect(rows.length).toBe(2);
  expect(rows.every((t) => /\.puml$/.test(t))).toBe(true);
});

// BLK-builder-20260924-1715-1 (design 10a / 9a): 上部バー左は「{保存先} / {部品} / {ファイル名}」のパンくず。
// 以前は保存先の図を開いても上部バーはファイル名だけで、どのフォルダの図か読めなかった。
// フォルダの段を押すと FILES ツリーでそのフォルダを見せる。
test('手順11 保存先の図を開くと上部バーが「保存先 / 部品 / ファイル名」のパンくずになる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR, { foldedTools: true });
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'spi_init_sequence', '@startuml\nApp -> SpiDrv : Spi_Init()\n@enduml');
  await S.putDoc(page, DIR, 'spi_state', '@startuml\n[*] --> Idle\n@enduml');
  await page.reload();
  await page.waitForSelector('html[data-app-ready="1"]', { state: 'attached' });
  const folder = DIR.replace(/[\/]+$/, '').split(/[\/]/).pop();
  const crumbs = page.locator('#top-crumbs .top-crumb');
  // 新規の図 (まだ保存先に無い) は保存先の段だけ。
  await expect(crumbs).toHaveText([folder]);

  const head = page.locator('#files-parts .files-part-head[data-part="spi"]');
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  await page.locator('#files-parts .files-part-file[data-file-name="spi_state"]').click();
  await expect(page.locator('#top-file-name')).toHaveText('spi_state.puml');
  await expect(crumbs).toHaveText([folder, 'SPI']);
  expect(await page.locator('#top-crumbs').innerText()).not.toMatch(/[📁📂🔒]/u);

  // 部品の段を押すと、畳んだ FILES が開き、部品のフォルダが開いてそこへ移る。
  await head.click();
  await page.keyboard.press('Control+b');
  await expect(page.locator('#files-panel')).toHaveClass(/collapsed/);
  await page.locator('#top-crumbs [data-crumb="part"]').click();
  await expect(page.locator('#files-panel')).not.toHaveClass(/collapsed/);
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await expect(head).toBeFocused();
});

// BLK-primary-20260925-0232-design (design 10a / 10b): ツリーから別のフォルダを保存先にする。
// 前は保存先の行の「保存先にする」「読むだけにする」が灰色で、⚙ 設定 → 自動保存 → ファイル → パス → 設定を保存 の 5 手だった。
test('手順11 保存先の行の右クリック「別のフォルダを保存先にする…」で隣のフォルダを選ぶと、保存先・件数・読むだけが替わる', async ({ page }) => {
  const base = DIR + '/change-target';
  const absBase = path.join(S.absDirFor(__filename), 'change-target');
  const mk = (sub, names) => {
    const d = path.join(absBase, sub);
    fs.rmSync(d, { recursive: true, force: true });
    fs.mkdirSync(d, { recursive: true });
    names.forEach((n) => fs.writeFileSync(path.join(d, n + '.puml'), '@startuml\nclass ' + n + '\n@enduml\n'));
  };
  mk('mine', ['Own_Class']);
  mk('senior', ['Spi_Class', 'Spi_Sequence']);
  await S.bootWithSaveDir(page, base + '/mine');
  await expect(page.locator('#top-save-target')).toHaveText('mine', { timeout: 15000 });

  // 保存先の行を右クリック → 「別のフォルダを保存先にする…」
  await page.locator('#top-save-target').click({ button: 'right' });
  const item = page.locator('#files-ctx-menu .files-ctx-item', { hasText: '別のフォルダを保存先にする…' });
  await expect(item).toBeEnabled();
  await item.click();
  const dlg = page.locator('#target-pick');
  await expect(dlg).toBeVisible();
  // 読むだけ節と同じ一覧 (隣の図のあるフォルダ) が並ぶ
  const senior = dlg.locator('.target-pick-dir', { hasText: 'senior' });
  await expect(senior).toBeVisible({ timeout: 10000 });
  await senior.click();
  await expect(dlg).toHaveCount(0);

  // パンくず・見出しの件数が替えた先になり、前の保存先は「読むだけ」に並ぶ
  await expect(page.locator('#top-save-target')).toHaveText('senior');
  await expect(page.locator('#files-count-target')).toHaveText(/2/, { timeout: 10000 });
  const cfg = await page.evaluate(() => window.MA.autoSave.getConfig());
  expect(cfg.fileDir.split(String.fromCharCode(92)).join('/')).toMatch(/change-target.senior$/);
  await page.locator('#files-sec-readonly').click();
  await expect(page.locator('#files-panel .files-ro-folder', { hasText: 'mine' })).toBeVisible({ timeout: 10000 });

  // Ctrl+K も右クリックと同じ名前「別のフォルダを保存先にする…」で同じ窓を開き、パスを入れても替えられる
  // (BLK-owner-20260925-1132-1: 入口の名前を揃えた。前の名前「保存先を変える」は検索語に残す)
  await page.keyboard.press('Control+k');
  await page.keyboard.type('保存先を変える');
  await expect(page.locator('#cp-list .cp-item').first()).toContainText('別のフォルダを保存先にする…');
  await page.keyboard.press('Enter');
  await expect(dlg).toBeVisible();
  await expect(page.locator('#target-pick-path')).toBeFocused();
  await page.keyboard.type(base + '/mine');
  await page.keyboard.press('Enter');
  await expect(dlg).toHaveCount(0);
  await expect(page.locator('#top-save-target')).toHaveText('mine');
  await expect(page.locator('#files-count-target')).toHaveText(/1/, { timeout: 10000 });
});

// BLK-human-20260925-1150 / BLK-owner-20260925-1132-1: 保存先を替えても、開いているタブは開いたときのファイルを指し続ける。
// 前は替えた途端にタブの書き先が新しいフォルダへ付け替わり、元のファイルは直らず、新しいフォルダの同じ名前の別の図を上書きした。
test('手順11 保存先を替えたあと前のフォルダのタブを直して保存すると、そのファイルだけが変わり新しい保存先には何も増えない', async ({ page }) => {
  const base = DIR + '/keep-tab-file';
  const absBase = path.join(S.absDirFor(__filename), 'keep-tab-file');
  const mk = (sub, files) => {
    const d = path.join(absBase, sub);
    fs.rmSync(d, { recursive: true, force: true });
    fs.mkdirSync(d, { recursive: true });
    Object.keys(files).forEach((n) => fs.writeFileSync(path.join(d, n + '.puml'), files[n]));
  };
  const IN_B = '@startuml\nclass Other_In_B\n@enduml\n';
  mk('first', { Same_Class: '@startuml\nclass In_First\n@enduml\n', Only_First: '@startuml\nclass Only_First\n@enduml\n' });
  mk('second', { Same_Class: IN_B });
  await S.bootWithSaveDir(page, base + '/first');
  await expect(page.locator('#top-save-target')).toHaveText('first', { timeout: 15000 });

  // first の Same_Class を開く (タブに固定する)
  await S.openFolderItem(page, 'Same_Class', { pin: true });
  await S.closeFolderList(page);
  await expect(page.locator('#editor')).toHaveValue(/In_First/);

  // 保存先を second に替える (保存先の右クリック →「別のフォルダを保存先にする…」)
  await page.locator('#top-save-target').click({ button: 'right' });
  await page.locator('#files-ctx-menu .files-ctx-item', { hasText: '別のフォルダを保存先にする…' }).click();
  const dlg = page.locator('#target-pick');
  await expect(dlg).toContainText('開いているタブは開いたファイルに保存します');
  await dlg.locator('.target-pick-dir', { hasText: 'second' }).click({ timeout: 10000 });
  await expect(dlg).toHaveCount(0);
  const cfg = await page.evaluate(() => window.MA.autoSave.getConfig());
  expect(cfg.fileDir.split(String.fromCharCode(92)).join('/')).toMatch(/keep-tab-file.second$/);

  // 上部バーのパンくずは開いたファイルのフォルダのまま (今の保存先ではないことを添える)。FILES の保存先の行は second
  const crumb = page.locator('#top-crumbs [data-crumb="target"]');
  await expect(crumb).toHaveText('first');
  await expect(crumb).toHaveAttribute('data-held', '1');
  await expect(page.locator('#top-file-name')).toContainText('Same_Class');
  await expect(page.locator('#top-save-target')).toHaveText('second');

  // 1 行足して Ctrl+S。開いたファイルを書き換えるかの問いは、first のファイルだと名指しする
  await page.locator('#editor').click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('End');
  await page.keyboard.type('\nclass Added_Line');
  await page.keyboard.press('Control+s');
  const ask = page.locator('#source-lock-modal');
  await expect(ask).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#source-lock-body')).toContainText(/keep-tab-file.first の中/);
  await page.locator('#source-lock-overwrite').click();
  await expect(ask).toHaveCount(0);
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(1500);
  // 答えた後に同じ問いがもう一度出ない (打った時点の返事待ちが答えた後に届いても聞き直さない)
  await expect(ask).toHaveCount(0);

  // 開いたファイル (first) だけが変わり、second の同じ名前の図は元のまま、second に何も増えない
  await expect.poll(async () => S.readDoc(page, base + '/first', 'Same_Class')).toContain('Added_Line');
  expect(await S.readDoc(page, base + '/second', 'Same_Class')).toBe(IN_B);
  expect((await S.listDir(page, base + '/second')).sort()).toEqual(['Same_Class']);
  expect(fs.readdirSync(path.join(absBase, 'second')).filter((n) => /\.puml$/.test(n))).toEqual(['Same_Class.puml']);
  // 上書き保存の行き先も first
  await expect(page.locator('#top-save')).toHaveAttribute('title', /keep-tab-file.first.Same_Class\.puml/);

  // 替えた後に second から開いた図は second に書く (留めるのは替える前に開いていたタブだけ)
  await S.putDoc(page, base + '/second', 'New_In_Second', '@startuml\nclass New_In_Second\n@enduml\n');
  await S.openFolderItem(page, 'New_In_Second', { pin: true });
  await S.closeFolderList(page);
  await expect(crumb).toHaveText('second');
  await expect(crumb).not.toHaveAttribute('data-held', '1');
});
