// @ts-check
// junior 台本 手順 1「persona-data\junior の自分の GPIO 図(前周までの最新版)を開く」。
//
// BLK-junior-20260908-2003-wish: 資料化の周は「前周に作った状態遷移図を開く」から
// 始まるのに、その図が実データに残っていないことがある。一覧はファイル名を並べる
// だけなので「GPIO の 8 図種のうち状態遷移だけ無い」は名前を読み比べないと言えず、
// 手順 1 で初めて詰まっていた。棚卸しが、開く前に欠けを名指しすることを確かめる。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor, getEditorText } = require('../helpers');

const DIR = saveDirFor(__filename);
const DSL = '@startuml\nstart\n:初期化する;\nstop\n@enduml';

// junior の保存フォルダの並び。状態遷移図と配置図が無いのが今回の詰まり。
const GPIO = [
  'GPIOドライバユースケース',
  'GPIOドライバコンポーネント構成',
  'GPIOドライバ派生クラス',
  'GPIOドライバ設定オブジェクト',
  'GPIOドライバ初期化シーケンス',
  'GPIOドライバ初期化アクティビティ',
];
const OTHER = ['CANドライバ状態遷移', 'diagram1'];

async function bootWithDir(page) {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
  await gotoApp(page);
}

async function putFile(page, name) {
  await page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl: DSL, dir: DIR });
}

async function clearDir(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

// 提出物庫は「図を全部消す」では消えない (それが庫の役目)。
// 前の周の積み残しがテストに混ざらないよう、下ごしらえでだけ明示的に空にする。
async function clearVault(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?vault=1&dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

async function openFolder(page) {
  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open #folder-inv-summary');
}

async function pickComponent(page, name) {
  await page.selectOption('#folder-inv-pick', name);
  await page.waitForSelector('#folder-panel.open #folder-inv-summary[data-inv-component="' + name + '"]');
}

test.describe('junior 手順 1: 前周までの最新版を開く', () => {
  test.beforeEach(async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await clearVault(page);
    for (const n of GPIO.concat(OTHER)) await putFile(page, n);
    await page.waitForTimeout(400);
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
  });

  test('一覧を開くと、部品ごとの図種の棚卸しが出る', async ({ page }) => {
    await openFolder(page);
    const opts = await page.locator('#folder-inv-pick option').allTextContents();
    expect(opts.some((t) => t.indexOf('GPIOドライバ') >= 0)).toBe(true);
  });

  test('GPIO を選ぶと「状態遷移図が無い」が見出しで名指しされる', async ({ page }) => {
    await openFolder(page);
    await pickComponent(page, 'GPIOドライバ');
    const line = page.locator('#folder-inv-summary');
    await expect(line).toHaveClass(/inv-short/);
    const text = await line.textContent();
    expect(text).toContain('8 図種中 6 種あり');
    expect(text).toContain('状態遷移図');
    expect(text).toContain('配置図');
  });

  test('図種ごとの行に「あり / なし」が並び、なしの行にはファイル名が無い', async ({ page }) => {
    await openFolder(page);
    await pickComponent(page, 'GPIOドライバ');
    const rows = page.locator('#folder-panel .folder-inv-row');
    await expect(rows).toHaveCount(8);

    const state = page.locator('.folder-inv-row[data-inv-kind="状態遷移図"]');
    await expect(state).toHaveAttribute('data-inv-present', '0');
    await expect(state.locator('.folder-inv-mark')).toHaveText('なし');
    await expect(state.locator('button.folder-inv-file')).toHaveCount(0);

    const seq = page.locator('.folder-inv-row[data-inv-kind="シーケンス図"]');
    await expect(seq).toHaveAttribute('data-inv-present', '1');
    await expect(seq.locator('button.folder-inv-file'))
      .toHaveText('GPIOドライバ初期化シーケンス');
  });

  test('「あり」の行のファイル名を押すとその図が開く（手順 1 が完了する）', async ({ page }) => {
    await openFolder(page);
    await pickComponent(page, 'GPIOドライバ');
    await page.locator('.folder-inv-row[data-inv-kind="シーケンス図"] button.folder-inv-file').click();
    await page.waitForTimeout(600);
    const name = await page.evaluate(() => {
      const doc = window.MA.workspace.getActive();
      return doc ? doc.name : '';
    });
    expect(name).toContain('GPIOドライバ初期化シーケンス');
  });

  // BLK-junior-20260914-1106: 同じ図種に「本番用 / 資料用」が同居すると、行の見出しの
  // 「あり」だけではどちらが今回の対象か分からず、ボタンの文字を読み比べていた。
  test('同じ図種に版が並ぶと、行の見出しが版を名指しする', async ({ page }) => {
    await putFile(page, 'GPIOドライバ初期化アクティビティ(資料用)');
    await page.waitForTimeout(300);
    await openFolder(page);
    await pickComponent(page, 'GPIOドライバ');

    const act = page.locator('.folder-inv-row[data-inv-kind="アクティビティ図"]');
    await expect(act).toHaveAttribute('data-inv-files', '2');
    await expect(act.locator('.folder-inv-mark')).toHaveText('あり: 本番用 / 資料用');

    // 版が並ぶ行のボタンは版そのもの。長い共通部分を読み比べない。
    const btns = act.locator('button.folder-inv-file');
    await expect(btns).toHaveCount(2);
    await expect(btns.nth(0)).toHaveText('本番用');
    await expect(btns.nth(1)).toHaveText('資料用');

    // 版が 1 つだけの行は今までどおり (「あり」+ ファイル名)。
    const seq = page.locator('.folder-inv-row[data-inv-kind="シーケンス図"]');
    await expect(seq.locator('.folder-inv-mark')).toHaveText('あり');
    await expect(seq.locator('button.folder-inv-file')).toHaveText('GPIOドライバ初期化シーケンス');

    // 到達条件: 資料用の版をその場で開ける (手順 1 が完了する)。
    await btns.nth(1).click();
    await page.waitForTimeout(600);
    const name = await page.evaluate(() => {
      const doc = window.MA.workspace.getActive();
      return doc ? doc.name : '';
    });
    expect(name).toContain('(資料用)');
  });

  test('欠けを埋めたら棚卸しが「欠けはありません」に変わる', async ({ page }) => {
    await putFile(page, 'GPIOドライバ状態遷移');
    await putFile(page, 'GPIOドライバ配置');
    await page.waitForTimeout(300);
    await openFolder(page);
    await pickComponent(page, 'GPIOドライバ');
    const line = page.locator('#folder-inv-summary');
    await expect(line).toHaveClass(/inv-ok/);
    await expect(line).toContainText('欠けはありません');
    await expect(page.locator('.folder-inv-row[data-inv-kind="状態遷移図"]'))
      .toHaveAttribute('data-inv-present', '1');
  });

  // BLK-junior-20260908-2203-wish: 前の周に完走して画像を出した図は、次の周が
  // 同じファイル名で保存すれば作業ファイルからは消える。庫に積んであれば
  // 棚卸しは「あり」のままで、手順 1 はそこから前回分を開くだけで済む。
  test('画像を書き出すと提出物庫に積まれ、作業ファイルが無くても棚卸しが「あり」になる', async ({ page }) => {
    // 前の周: GPIO 状態遷移図を書いて SVG で書き出す (= 完走の区切り)。
    await page.evaluate(() => {
      const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      ed.value = '@startuml\ntitle GPIOドライバ状態遷移\n[*] --> Uninit\nUninit --> Ready : Gpio_Init\n@enduml';
      ed.dispatchEvent(new Event('input'));
    });
    await page.waitForTimeout(900);
    await page.locator('#btn-export').click();
    await page.waitForSelector('#export-menu', { state: 'visible' });
    const dl = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    await page.locator('#exp-svg').click();
    expect(await dl).not.toBeNull();
    await page.waitForTimeout(900);

    // 到達条件その1: 庫に積まれている (ファイル名ではなく図種と部品名で引ける)。
    const entries = await page.evaluate(async (d) => {
      const r = await fetch('/vault?dir=' + encodeURIComponent(d));
      return r.ok ? (await r.json()).entries : [];
    }, DIR);
    expect(entries.length).toBe(1);
    expect(entries[0].kind).toBe('状態遷移図');
    expect(entries[0].subject).toBe('GPIOドライバ');

    // 到達条件その2: 保存フォルダに GPIO の状態遷移図は 1 枚も無いのに、
    // 棚卸しは「あり」で、その行から庫を開ける。
    await openFolder(page);
    await pickComponent(page, 'GPIOドライバ');
    const state = page.locator('.folder-inv-row[data-inv-kind="状態遷移図"]');
    await expect(state).toHaveAttribute('data-inv-present', '1');
    await expect(state).toHaveAttribute('data-inv-source', 'vault');
    await expect(state.locator('button.folder-inv-file')).toHaveCount(0);
    await state.locator('button.folder-inv-vault').click();

    // 到達条件その3: 部品 × 図種で絞られた庫が開き、その版を開ける (手順 1 の完了)。
    await page.waitForSelector('#vault-modal', { state: 'visible' });
    await page.waitForTimeout(500);
    const rows = page.locator('#vault-body tr.vault-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('data-kind', '状態遷移図');
    await expect(page.locator('#vault-body tr.vault-row td.vault-back').first()).toHaveText('最新');
    await rows.first().locator('button.vault-open').click();
    await page.waitForTimeout(900);
    const opened = await page.evaluate(() => {
      const doc = window.MA.workspace.getActive();
      return doc ? { name: doc.name, dsl: doc.dsl } : null;
    });
    expect(opened.name).toContain('GPIOドライバ状態遷移@');
    expect(opened.dsl).toContain('Uninit --> Ready');
  });

  test('提出物庫は「図を全部消す」では消えない（上書きから守るための庫）', async ({ page }) => {
    await page.evaluate(() => {
      const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      ed.value = '@startuml\ntitle GPIOドライバ状態遷移\n[*] --> Uninit\n@enduml';
      ed.dispatchEvent(new Event('input'));
    });
    await page.waitForTimeout(900);
    await page.locator('#btn-export').click();
    await page.waitForSelector('#export-menu', { state: 'visible' });
    const dl = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    await page.locator('#exp-svg').click();
    await dl;
    await page.waitForTimeout(700);

    await clearDir(page);
    const entries = await page.evaluate(async (d) => {
      const r = await fetch('/vault?dir=' + encodeURIComponent(d));
      return r.ok ? (await r.json()).entries : [];
    }, DIR);
    expect(entries.length).toBe(1);
  });

  test('図種が名前から分からない図は「なし」に数えず別に出す', async ({ page }) => {
    await openFolder(page);
    await pickComponent(page, 'GPIOドライバ');
    // diagram1 は GPIO の欠けとして数えられていない (GPIO は 6/8 のまま)。
    await expect(page.locator('#folder-inv-summary')).toHaveAttribute('data-inv-have', '6');
    await page.selectOption('#folder-inv-pick', { index: 0 });
    await expect(page.locator('#folder-inv-summary')).toContainText('部品を選ぶ');
  });
});

// BLK-junior-20260909-0303: 開こうとした図が実データにも先輩側にも無いときは、
// 新規タブのサンプル (WebApp / IAuth) から書き起こすことになる。その付け替えを
// 要素ごとに「選択 → Alias/Label → 変更を反映 → 関連に追従」で繰り返すと
// クリックが要素数に比例して増えていた (実測 14、基準 10 超)。
// 無選択の右ペインの表で全要素を一度に付け替えられることを確かめる。
test.describe('junior 手順 1: 実体が無くサンプルから起こす', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-component');
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      ed.value = '@startuml\ncomponent WebApp\ninterface IAuth\nWebApp -() IAuth\n@enduml';
      ed.dispatchEvent(new Event('input'));
    });
    await page.waitForTimeout(600);
  });

  test('サンプルの 2 要素が表に並び、まとめて反映 1 回で関連ごと付け替わる', async ({ page }) => {
    const rows = page.locator('#co-rename-list .co-rename-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator('.co-rename-id')).toHaveValue('WebApp');
    await expect(rows.nth(1).locator('.co-rename-id')).toHaveValue('IAuth');

    // クリックは「まとめて反映」の 1 回だけ。欄の移動は Tab で済む。
    await rows.nth(0).locator('.co-rename-id').fill('GpioDrv');
    await rows.nth(0).locator('.co-rename-label').fill('GPIO ドライバ');
    await rows.nth(1).locator('.co-rename-id').fill('IGpio');
    await rows.nth(1).locator('.co-rename-label').fill('GPIO API');
    await page.locator('#co-rename-apply').click();
    await page.waitForTimeout(500);

    const dsl = await getEditorText(page);
    expect(dsl).toContain('component "GPIO ドライバ" as GpioDrv');
    expect(dsl).toContain('interface "GPIO API" as IGpio');
    // Alias 変更が関連 Relation にも追従している (別ボタンを押さなくてよい)。
    expect(dsl).toContain('GpioDrv -() IGpio');
    expect(dsl).not.toContain('WebApp');
  });

  test('付け替えたあとの表は新しい名前で並び直す', async ({ page }) => {
    const rows = page.locator('#co-rename-list .co-rename-row');
    await rows.nth(0).locator('.co-rename-id').fill('GpioDrv');
    await page.locator('#co-rename-apply').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#co-rename-list .co-rename-row').nth(0).locator('.co-rename-id'))
      .toHaveValue('GpioDrv');
  });
});

// BLK-junior-20260909-0403-wish: ユースケース図を起こす周。コンポーネント図には
// 「実際の呼び出し」候補が出るのに、ユースケース図の「末尾に追加」には候補が無く、
// 誰が使うか (アクター) も何をするか (ユースケース) も白紙から考えて一括入力欄に
// 打つしかなかった。同じ部品のシーケンス図から候補が出て、選ぶだけで
// アクター・ユースケース・関連が図に入ることを確かめる。
test.describe('junior 手順 1: シーケンス図からユースケース図を起こす', () => {
  const GPIO_SEQ = [
    '@startuml',
    'actor "開発者" as A1',
    'participant GpioDrv',
    'participant Port_Drv',
    'participant RTOS',
    'A1 -> GpioDrv : Gpio_Init(cfg)',
    'A1 -> GpioDrv : Gpio_WritePin(id, level)',
    'RTOS -> GpioDrv : Gpio_EnableIrq()',
    'GpioDrv -> Port_Drv : Port_SetMode()',
    '@enduml',
  ].join('\n');

  async function typeDsl(page, text) {
    await page.evaluate((t) => {
      const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      ed.value = t;
      ed.dispatchEvent(new Event('input'));
    }, text);
    await page.waitForTimeout(500);
  }

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
    await gotoApp(page);
    // 先輩の gpio シーケンス図を 1 枚開いておく。
    await page.locator('#diagram-type').selectOption('plantuml-sequence');
    await page.waitForTimeout(500);
    await typeDsl(page, GPIO_SEQ);
    await page.evaluate(() => {
      const ws = window.MA.workspace;
      ws.rename(ws.getActiveId(), 'gpio_init_sequence');
    });
    // 白紙のユースケース図のタブへ。
    await page.locator('#btn-tab-new').click();
    await page.locator('#diagram-type').selectOption('plantuml-usecase');
    await page.waitForTimeout(500);
    await typeDsl(page, '@startuml\n@enduml');
  });

  test('シーケンス図から拾ったアクター・ユースケース候補が理由付きで並ぶ', async ({ page }) => {
    const summary = page.locator('#uc-src-summary');
    await expect(summary).toContainText('アクター候補');
    await expect(summary).toContainText('ユースケース候補');

    const actors = page.locator('#uc-src-actors .uc-src-row');
    await expect(actors.filter({ hasText: '開発者' })).toHaveCount(1);
    await expect(actors.filter({ hasText: 'RTOS' })).toHaveCount(1);
    // 部品自身はアクターにならない。
    await expect(actors.filter({ hasText: 'GpioDrv' })).toHaveCount(0);
    // どの図から来た候補かが出るので、先輩の図を開き直さずに確かめられる。
    await expect(actors.filter({ hasText: '開発者' })).toContainText('gpio_init_sequence');

    const ucs = page.locator('#uc-src-usecases .uc-src-row');
    await expect(ucs.filter({ hasText: 'Gpio_Init()' })).toHaveCount(1);
    await expect(ucs.filter({ hasText: 'Gpio_EnableIrq()' })).toHaveCount(1);
    // 公開 API が先。上から押していける。
    await expect(ucs.first()).toHaveAttribute('data-src-kind', 'usecase');
    await expect(ucs.filter({ hasText: 'Gpio_EnableIrq()' })).toContainText('RTOS');
  });

  test('選んだ候補がアクター・ユースケース・関連になって図に入る', async ({ page }) => {
    await page.locator('#uc-src-actors .uc-src-row').filter({ hasText: 'RTOS' })
      .locator('input').check();
    await page.locator('#uc-src-usecases .uc-src-row').filter({ hasText: 'Gpio_EnableIrq()' })
      .locator('input').check();
    await page.locator('#uc-src-add').click();

    await expect.poll(async () => await getEditorText(page)).toContain('actor RTOS');
    const dsl = await getEditorText(page);
    expect(dsl).toContain('Gpio_EnableIrq()');
    // 呼び出し元も一緒に選んだので関連の線まで引かれる (from/to を選び直さない)。
    expect(dsl).toMatch(/RTOS\s+-->\s+U\d/);

    // 足した分は候補から消える。
    await expect(page.locator('#uc-src-actors .uc-src-row').filter({ hasText: 'RTOS' }))
      .toHaveCount(0);
  });

  test('起点の部品を替えると候補も替わる', async ({ page }) => {
    await expect(page.locator('#uc-src-subject')).toHaveValue('gpio');
    const opts = await page.locator('#uc-src-subject option').allTextContents();
    expect(opts.some((t) => t.indexOf('gpio') >= 0)).toBe(true);
  });
});

// ── BLK-junior-20260913-0206-wish ───────────────────────────────────────
// 新部品を起こす周 (TIMER) の手順 1〜2 は、シーケンス → 状態遷移 → クラス →
// アクティビティ → コンポーネント → ユースケースの 6 図種を、その都度別のタブを
// 新規に開いて別々にやり直していた。下書きを作る機能が図種ごとに別々なので、
// 図種を移るたびにどの機能を使うかを思い出し、部品名を打ち直すことになる。
// 部品名を 1 回打てば 6 図種が同じ名前で揃って開くことを到達条件にする。
test.describe('junior 手順 1〜2: 手本の無い部品を 1 回の入力で起こす', () => {
  test.beforeEach(async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await clearVault(page);
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
  });

  test('部品名を 1 回打つと、6 図種の下書きが同じ名前で別タブに開く', async ({ page }) => {
    await page.locator('#btn-tab-part').click();
    await page.waitForSelector('#part-subject');
    await page.fill('#part-subject', 'TIMER');

    // 到達条件 1: 押す前に、何が何の名前で開くかが 6 行で読める。
    const rows = page.locator('#part-sheets [data-part-row]');
    await expect(rows).toHaveCount(6);
    await expect(page.locator('#part-summary')).toContainText('TIMER_Driver');
    await expect(page.locator('#part-summary')).toContainText('6 図種');
    const names = await page.locator('#part-sheets [data-part-name]').allTextContents();
    expect(names).toEqual(['timer_sequence', 'timer_state', 'timer_class',
      'timer_activity', 'timer_component', 'timer_usecase']);

    // 到達条件 2: 1 回押すだけで 6 図種ぶんのタブが開く (図種ごとのやり直しが無い)。
    await page.locator('#btn-part-create').click();
    await page.waitForTimeout(900);
    const opened = await page.evaluate(() => window.MA.workspace.list()
      .map((d) => ({ name: d.name, type: d.diagramType, dsl: d.dsl })));
    const mine = opened.filter((d) => d.name.indexOf('timer_') === 0);
    expect(mine.map((d) => d.name)).toEqual(['timer_sequence', 'timer_state',
      'timer_class', 'timer_activity', 'timer_component', 'timer_usecase']);
    expect(mine.map((d) => d.type)).toEqual(['plantuml-sequence', 'plantuml-state',
      'plantuml-class', 'plantuml-activity', 'plantuml-component', 'plantuml-usecase']);

    // 到達条件 3: 図種を跨いだ綴りの食い違いが起きない (打ったのは 1 回だから)。
    for (const d of mine) {
      expect(d.dsl).toContain('TIMER');
      expect(d.dsl).not.toContain('Timer');
    }

    // 到達条件 4: どれも白紙ではなく、そのまま描ける DSL になっている。
    const codes = await page.evaluate(async (dsls) => {
      const out = [];
      for (const t of dsls) {
        const r = await fetch('/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: t, mode: 'local' }),
        });
        out.push(r.status);
      }
      return out;
    }, mine.map((d) => d.dsl));
    expect(codes).toEqual([200, 200, 200, 200, 200, 200]);
  });

  // 同じ部品の図を既に開いているタブがあれば、その図種は既定で外す
  // (押し間違えて書きかけを別タブで二重に持つと、どちらを直したか分からなくなる)。
  test('既に開いた図種は 2 度目には開かない側に寄り、選べば作り直せる', async ({ page }) => {
    await page.locator('#btn-tab-part').click();
    await page.waitForSelector('#part-subject');
    await page.fill('#part-subject', 'TIMER');
    await page.locator('#btn-part-create').click();
    await page.waitForTimeout(900);

    // 2 度目。6 図種とも「既にあります」になり、何も開かない状態から始まる。
    await page.locator('#btn-tab-part').click();
    await page.waitForSelector('#part-subject');
    await page.fill('#part-subject', 'TIMER');
    const had = page.locator('#part-sheets [data-part-had]');
    await expect(had.first()).toContainText('既にあります');
    const boxes = page.locator('#part-sheets input[data-part-kind]');
    expect(await boxes.count()).toBe(6);
    for (let i = 0; i < 6; i++) await expect(boxes.nth(i)).not.toBeChecked();
    await expect(page.locator('#part-summary')).toContainText('6 図種は既にある');
    await expect(page.locator('#btn-part-create')).toBeDisabled();

    // 作り直したければその場で選べる (勝手に外して終わりにしない)。
    await page.locator('#part-sheets [data-part-row="state"] input[data-part-kind]').check();
    await expect(page.locator('#btn-part-create')).toHaveText('1 図種の下書きを開く');
    await expect(page.locator('#btn-part-create')).toBeEnabled();
  });
});

// BLK-junior-20260913-0306-wish: 8 周目の手順 1 は「persona-data\reviewer\指摘.md を
// 開き、自分宛の指摘を確認する。併せて persona-data\primary の該当図を開いて先輩側の
// 詳細を見る」。指摘.md は GUI の外のテキストなので、junior は指摘文から図名を目で拾い、
// 覗き機能で自分と先輩のフォルダから同じ名前を探し当ててから見比べていた。
// 指摘 1 件を押せば、その図が junior ⇔ primary で並んだ状態で出ることを到達条件にする。
const fs = require('fs');
const nodePath = require('path');
const S1 = require('./_scenario');

const NOTE_ROOT = DIR + '-note';
const NOTE_MINE = NOTE_ROOT + '/junior';
const NOTE_SENIOR = NOTE_ROOT + '/primary';
const NOTE_REVIEWER = NOTE_ROOT + '/reviewer';

function absOf(rel) {
  return nodePath.join(__dirname, '..', '..', '..', rel.replace(/^\.\//, ''));
}

// reviewer が実際に書いている形 (自由文、見出しに【】、図名は本文に混ざる)。
const REVIEW_NOTE = [
  '# junior への指摘',
  '自分宛の分だけ読んでください。',
  '',
  '## 【継続】gpio_init_sequence の部品名不一致',
  'junior 側 `Gpio`(2行のみ)/ primary 側 `Gpio_Driver` 詳細化、のまますり合わせ未反映。',
  'md5: 70bc06fa662e369d0b8da6a0596f766a',
  '',
  '## 【参考】gpio_state は問題なし',
  'そのままで構いません。',
].join('\n');

const MINE_SEQ = ['@startuml', 'title GPIO 初期化シーケンス',
  'participant Gpio', 'participant Hw_Ctrl',
  'Gpio -> Hw_Ctrl : Gpio_Init', '@enduml'].join('\n');
const SENIOR_SEQ = ['@startuml', 'title GPIO 初期化シーケンス',
  'participant Gpio_Driver', 'participant Hw_Ctrl', 'participant Nvic',
  'Gpio_Driver -> Hw_Ctrl : Gpio_Init',
  'Gpio_Driver -> Nvic : Gpio_EnableIrq', '@enduml'].join('\n');

test.describe('junior 手順 1: 指摘.md の 1 件から先輩の図と並べて見る', () => {
  test.beforeEach(async ({ page }) => {
    await S1.bootWithSaveDir(page, NOTE_MINE);
    await S1.clearDir(page, NOTE_MINE);
    await S1.clearDir(page, NOTE_SENIOR);
    await S1.putDoc(page, NOTE_MINE, 'gpio_init_sequence', MINE_SEQ);
    await S1.putDoc(page, NOTE_MINE, 'gpio_state', S1.GPIO_STATE);
    await S1.putDoc(page, NOTE_SENIOR, 'gpio_init_sequence', SENIOR_SEQ);
    // 指摘.md は図ではないので GUI からは置けない (reviewer が置くファイル)。
    fs.mkdirSync(absOf(NOTE_REVIEWER), { recursive: true });
    fs.writeFileSync(nodePath.join(absOf(NOTE_REVIEWER), '指摘.md'), REVIEW_NOTE, 'utf-8');
    await page.reload();
    await page.waitForSelector('#btn-tab-peek');
  });

  test('指摘 1 件を押すと、その図が自分 ⇔ 先輩で並んで出る', async ({ page }) => {
    // 到達条件その1: 指摘.md の件が、押す前に「何が出るか」つきで並ぶ。
    await page.locator('#btn-tab-peek').click();
    await page.waitForSelector('#peek-modal');
    await page.locator('#peek-note-toggle').click();
    await page.waitForSelector('#peek-note .note-finding');
    const first = page.locator('#peek-note .note-finding').first();
    await expect(first).toContainText('継続');
    await expect(first).toContainText('gpio_init_sequence (junior ⇔ primary) を並べる');
    await expect(page.locator('#note-summary')).toContainText('1 件はクリック 1 回で');

    // 到達条件その2: 押すだけで、本文が左右に並んだ状態になる (図名を自分で
    // 拾って探し当てる工程が要らない)。
    await first.click();
    await page.waitForSelector('#sbs-grid');
    await expect(page.locator('#sbs-head')).toContainText('gpio_init_sequence');
    await expect(page.locator('#sbs-head')).toContainText('junior');
    await expect(page.locator('#sbs-head')).toContainText('primary');

    // 到達条件その3: 指摘された食い違い (Gpio / Gpio_Driver) がその場で光る。
    await expect(page.locator('#sbs-summary')).toContainText('Gpio');
    expect(await page.locator('#sbs-grid .sbs-mark').count()).toBeGreaterThan(0);

    // 到達条件その4: 並べた図が指摘.md のどの件に当たるかが、その画面で読める。
    await expect(page.locator('#sbs-note-status')).toContainText('部品名不一致');
    await expect(page.locator('#sbs-note-status')).toHaveAttribute('data-note-clear', '0');
  });

  // 追記 (junior run 20260914-0906): 指摘.md に名前の挙がらない図を開いたとき、
  // 「本当に指摘が無いか」を確かめるのに指摘.md を全文読み直していた。
  test('指摘に挙がっていない図は「指摘はありません」と注記つきで言い切る', async ({ page }) => {
    // 指摘.md に名前の出ない図。先輩側には別ドメインと決めた注記が残っている。
    const TIMER = ['@startuml', 'state Uninit', 'Uninit --> Ready : Timer_Init', '@enduml'].join('\n');
    await S1.putDoc(page, NOTE_MINE, 'timer_state', TIMER);
    await S1.putDoc(page, NOTE_SENIOR, 'timer_state',
      ['@startuml', "' domain-verdict: separate timer vs junior",
        'state Uninit', 'Uninit --> Ready : Timer_Init', '@enduml'].join('\n'));
    await page.reload();
    await page.waitForSelector('#btn-tab-peek');

    await page.locator('#btn-tab-peek').click();
    await page.waitForSelector('#peek-modal');
    await page.locator('#peek-sbs-toggle').click();
    await page.waitForSelector('#peek-dirs .sbs-pair[data-sbs-pair="timer_state"]');
    await page.locator('#peek-dirs .sbs-pair[data-sbs-pair="timer_state"]').click();
    await page.waitForSelector('#sbs-note-status');
    await expect(page.locator('#sbs-note-status')).toContainText('指摘はありません');
    await expect(page.locator('#sbs-note-status')).toContainText('domain-verdict: separate');
  });

  test('並べる相手がいない指摘は、押しても理由が出るだけで済む', async ({ page }) => {
    await page.locator('#btn-tab-peek').click();
    await page.waitForSelector('#peek-modal');
    await page.locator('#peek-note-toggle').click();
    await page.waitForSelector('#peek-note .note-finding');
    const second = page.locator('#peek-note .note-finding').nth(1);
    await expect(second).toHaveAttribute('data-note-ready', '0');
    await second.click();
    await expect(page.locator('#note-summary')).toContainText('にしかありません');
  });
});

// BLK-junior-20260914-0906: 一覧から自分の図を開き直すだけの手順 1 で、
// 「開いたファイルを上書きしますか」が毎回割り込んでいた (過去 run が残した
// -編集中 の控えがあるため錠が ask のまま、開いた直後の自動保存がその問いに当たる)。
// 読むだけの回は聞かれず、本文を変えたときだけ聞かれることを到達条件にする。
const LOCK_DIR = DIR + '-lock';
const LOCK_DOC = 'GPIOドライバ状態遷移(資料用)';
const LOCK_DSL = ['@startuml', 'title GPIOドライバ状態遷移',
  '[*] --> Uninit', 'Uninit --> Ready : Gpio_Init', '@enduml'].join('\n');

test.describe('junior 手順 1: 開き直すだけの回は錠に止められない', () => {
  test.beforeEach(async ({ page }) => {
    await S1.bootWithSaveDir(page, LOCK_DIR);
    await S1.clearDir(page, LOCK_DIR);
    await S1.putDoc(page, LOCK_DIR, LOCK_DOC, LOCK_DSL);
    // 過去 run のツールが残した控え。これがあると錠は「聞く」のまま残る。
    await S1.putDoc(page, LOCK_DIR, LOCK_DOC + '-編集中', LOCK_DSL);
    await page.reload();
    await page.waitForSelector('#editor');
  });

  test('一覧から開いて眺めるだけなら、上書きの確認は出ない', async ({ page }) => {
    await S1.openFolderItem(page, LOCK_DOC);
    await page.waitForTimeout(1500);
    // 到達条件その1: 開いた本文が出ていて、確認は割り込まない。
    expect(await page.locator('#editor').inputValue()).toContain('Gpio_Init');
    await expect(page.locator('#source-lock-modal')).toHaveCount(0);
    // 到達条件その2: 錠はかかったままで、何も書かないことが読める。
    await expect(page.locator('#top-source-lock')).toBeVisible();
    expect(await page.locator('#top-source-lock').getAttribute('title'))
      .toContain('読むだけなら何も書きません');
  });

  test('本文を変えたときだけ、今までどおり一度だけ聞かれる', async ({ page }) => {
    await S1.openFolderItem(page, LOCK_DOC);
    await page.waitForTimeout(1200);
    await expect(page.locator('#source-lock-modal')).toHaveCount(0);

    const opened = await page.locator('#editor').inputValue();
    await S1.typeDsl(page, opened.replace('Gpio_Init', 'Gpio_Init2'));
    await page.waitForTimeout(1200);
    const modal = page.locator('#source-lock-modal');
    await expect(modal).toBeVisible();
    // 到達条件その3: なぜ今聞かれるかと、古い控えが図に入らないことを本文が言う。
    await expect(page.locator('#source-lock-body')).toContainText('開いたときから本文が変わった');
    await expect(page.locator('#source-lock-body')).toContainText('古い控えの中身が図に入ることはありません');
  });
});

// BLK-junior-20260914-1006-wish: 手順 1 の「先輩の該当図を開いて先輩側の詳細を見る」で、
// 先輩は GPIO 単独のクラス図を持たず driver_common_class.puml (共通基底 + 6 ドライバ) に
// まとめている。並べて見る機能はファイル名で対をなすため、名前の違うこの組は自動で並ばず、
// 複合図を開いて Gpio_Driver を目で探すしかなかった (部品が増えるほど探索も増える)。
// 部品名を 1 つ押せば、その所だけが切り出されて自分の図の隣に出ることを到達条件にする。
const SLICE_ROOT = DIR + '-slice';
const SLICE_MINE = SLICE_ROOT + '/junior';
const SLICE_SENIOR = SLICE_ROOT + '/primary';

const SENIOR_COMPOSITE = [
  '@startuml', 'title Driver_Common_Class',
  'class Driver_Common {', '  + Init() : void', '  + DeInit() : void', '}',
  'class Spi_Driver {', '  + Spi_Init() : void', '  + Spi_TransmitDma() : void', '}',
  'class Can_Driver {', '  + Can_Init() : void', '}',
  'class Gpio_Driver {', '  + Gpio_Init() : void', '  + Gpio_Reset() : StatusType',
  '  + Gpio_SetHigh() : void', '  + Gpio_SetLow() : void', '}',
  'class Uart_Driver {', '  + Uart_Init() : void', '}',
  'class IRQCtrl {', '  + EnableIrq() : void', '  + Irq_Init() : void',
  '  + Spi_Ack() : void', '}',
  'Spi_Driver --|> Driver_Common', 'Can_Driver --|> Driver_Common',
  'Gpio_Driver --|> Driver_Common', 'Uart_Driver --|> Driver_Common',
  'Spi_Driver --> IRQCtrl', 'Gpio_Driver --> IRQCtrl', '@enduml',
].join('\n');

// junior 側は GPIO 単独。ファイル名は先輩と対をなさない。
const MINE_CLASS = [
  '@startuml', 'title GpioDrv派生クラス図(資料用)',
  'class Driver_Common {', '  + Init() : void', '  + DeInit() : void', '}',
  'class Gpio {', '  + Gpio_Init() : void', '  + Gpio_Reset() : StatusType', '}',
  'Gpio --|> Driver_Common', '@enduml',
].join('\n');

const SENIOR_SEQ2 = ['@startuml', 'participant Gpio_Driver', 'participant Hw_Ctrl',
  'Gpio_Driver -> Hw_Ctrl : Gpio_Init', '@enduml'].join('\n');

test.describe('junior 手順 1: 先輩の複合図から部品を切り出して自分の図と並べる', () => {
  test.beforeEach(async ({ page }) => {
    await S1.bootWithSaveDir(page, SLICE_MINE);
    await S1.clearDir(page, SLICE_MINE);
    await S1.clearDir(page, SLICE_SENIOR);
    await S1.putDoc(page, SLICE_MINE, 'GpioDrv派生クラス図(資料用)', MINE_CLASS);
    await S1.putDoc(page, SLICE_SENIOR, 'driver_common_class', SENIOR_COMPOSITE);
    await S1.putDoc(page, SLICE_SENIOR, 'gpio_init_sequence', SENIOR_SEQ2);
    await page.reload();
    await page.waitForSelector('#btn-tab-peek');
  });

  test('複合図を開くと部品が並び、押した部品の所だけが自分の図と並ぶ', async ({ page }) => {
    await page.locator('#btn-tab-peek').click();
    await page.waitForSelector('#peek-modal');
    await page.locator('#peek-files .peek-file[data-file-name="driver_common_class"]').click();

    // 到達条件その1: 開いた図が複合図であることと、中の部品が押す前に並ぶ。
    await page.waitForSelector('#peek-parts .peek-part-chip');
    await expect(page.locator('#peek-parts-head')).toContainText('4 部品の複合図');
    await expect(page.locator('#peek-parts .peek-part-chip[data-part="Gpio_Driver"]')).toContainText('4');

    // 到達条件その2: 部品を 1 回押すだけで、切り出しが自分の図の隣に出る
    // (ファイル名が対をなしていなくても並ぶ)。
    await page.locator('#peek-parts .peek-part-chip[data-part="Gpio_Driver"]').click();
    await page.waitForSelector('#sbs-grid');
    await expect(page.locator('#sbs-head')).toContainText('Gpio_Driver');
    await expect(page.locator('#sbs-head')).toContainText('junior');
    await expect(page.locator('#sbs-head')).toContainText('primary');
    await expect(page.locator('#sbs-summary')).toContainText('GpioDrv派生クラス図(資料用)');
    await expect(page.locator('#sbs-summary')).toContainText('3 クラス');

    // 到達条件その3: 他の部品は切り出しに出ない (目で探す所が残らない)。
    const grid = await page.locator('#sbs-grid').innerText();
    expect(grid).toContain('Gpio_SetHigh');
    expect(grid).toContain('Gpio_Driver --|> Driver_Common');
    expect(grid).not.toContain('Spi_Driver');
    expect(grid).not.toContain('Can_Driver');
    expect(grid).not.toContain('Spi_Ack');

    // 到達条件その4: 粒度の違い (junior の Gpio / 先輩の Gpio_Driver) がその場で光る。
    expect(await page.locator('#sbs-grid .sbs-mark').count()).toBeGreaterThan(0);
  });

  // BLK-junior-20260914-1006 (friction): 見るべき先輩の図がどれかは、覗き一覧の
  // ファイル名からは決まらない (名前が対をなさない)。複合図を開いて中に
  // Gpio_Driver があるかを目で確かめていた。自分の図の部品名で引けることを
  // 到達条件にし、そこまでのクリック数を実測する。
  test('自分の図の部品名で、先輩のどの図に載っているかを名指しできる', async ({ page }) => {
    let clicks = 0;
    const click = async (sel) => { clicks++; await page.locator(sel).click(); };

    // 自分の図を開いてから覗く (junior の実際の順)。
    await click('#btn-tab-folder');
    await page.waitForSelector('#folder-panel.open');
    await click('#folder-panel .folder-item[data-file-name="GpioDrv派生クラス図(資料用)"]');
    await page.waitForTimeout(800);

    await click('#btn-tab-peek');
    await page.waitForSelector('#peek-modal');
    await click('#peek-find-part');

    // 到達条件その1: 載っている図が名指しされる (複合図であることも読める)。
    await page.waitForSelector('#peek-find-head[data-find-hits]');
    await expect(page.locator('#peek-find-head')).toContainText('1 枚');
    const hit = page.locator('#peek-parts [data-find-file="driver_common_class"]');
    await expect(hit).toContainText('複合図');
    await expect(hit).toHaveAttribute('data-find-part', 'Gpio_Driver');

    // 到達条件その2: 押せばその部品の切り出しまで一気に出る。
    await click('#peek-parts [data-find-file="driver_common_class"]');
    await page.waitForSelector('#sbs-grid');
    await expect(page.locator('#sbs-head')).toContainText('Gpio_Driver');
    const grid = await page.locator('#sbs-grid').innerText();
    expect(grid).toContain('Gpio_SetHigh');
    expect(grid).not.toContain('Spi_Driver');

    // 到達条件その3: ここまでキー入力 0、クリックは 10 以下。
    expect(clicks).toBeLessThanOrEqual(10);
  });

  test('複合図でない図では部品の帯を出さない (押す所を増やさない)', async ({ page }) => {
    await page.locator('#btn-tab-peek').click();
    await page.waitForSelector('#peek-modal');
    await page.locator('#peek-files .peek-file[data-file-name="gpio_init_sequence"]').click();
    await page.waitForTimeout(600);
    await expect(page.locator('#peek-parts')).toBeHidden();
  });
});
