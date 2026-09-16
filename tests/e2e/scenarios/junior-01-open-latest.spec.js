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

  // BLK-junior-20260914-1206-wish: 指摘.md には「対象図種・部品・対応要否」が
  // 構造化されていないので、junior は指摘の無い図でも自分と先輩の両方を開いて
  // 突き合わせ、「対応不要」を自分で判定していた (8 周目は 5 図種のうち 4 図種が
  // 指摘なしで、その 4 回ぶんが丸ごと無駄だった)。📂一覧が開く前に
  // 対象外 / ⚠未確認 / ✅対応済み を出すことを到達条件にする。
  test('📂一覧が、開く前に「対象外 / ⚠未確認」を図ごとに出す', async ({ page }) => {
    // 指摘.md に名前の出ない図を 1 枚足す (今回の GPIO コンポーネント図に当たる)。
    await S1.putDoc(page, NOTE_MINE, 'gpio_component',
      ['@startuml', 'component Gpio_Driver', '@enduml'].join('\n'));
    await page.reload();
    await page.waitForSelector('#btn-tab-folder');

    await page.locator('#btn-tab-folder').click();
    await page.waitForSelector('#folder-panel.open #folder-note-summary[data-note-ready="1"]');

    // 到達条件その1: 指摘.md に名前の挙がらない図は「対象外」。開かずに次へ進める。
    const off = page.locator('.folder-note-badge[data-note-of="gpio_component"]');
    await expect(off).toHaveAttribute('data-note-status', 'off');
    await expect(off).toHaveText('対象外');

    // 到達条件その2: 指摘があり、古い綴り (Gpio) が残っている図は ⚠未確認。
    const todo = page.locator('.folder-note-badge[data-note-of="gpio_init_sequence"]');
    await expect(todo).toHaveAttribute('data-note-status', 'todo');
    await expect(todo).toHaveText('⚠未確認');
    expect(await todo.getAttribute('title')).toContain('部品名不一致');

    // 到達条件その3: 見出しが、今日開かなくてよい枚数を先に言う。
    await expect(page.locator('#folder-note-summary')).toContainText('対象外');
  });

  test('指摘どおり直すと、一覧のバッジが ✅対応済み に変わる', async ({ page }) => {
    // 指摘: junior 側の `Gpio` を先輩に合わせて `Gpio_Driver` に統一する。
    await S1.putDoc(page, NOTE_MINE, 'gpio_init_sequence',
      ['@startuml', 'title GPIO 初期化シーケンス',
        'participant Gpio_Driver', 'participant Hw_Ctrl',
        'Gpio_Driver -> Hw_Ctrl : Gpio_Init', '@enduml'].join('\n'));
    await page.reload();
    await page.waitForSelector('#btn-tab-folder');

    await page.locator('#btn-tab-folder').click();
    await page.waitForSelector('#folder-panel.open #folder-note-summary[data-note-ready="1"]');

    const done = page.locator('.folder-note-badge[data-note-of="gpio_init_sequence"]');
    await expect(done).toHaveAttribute('data-note-status', 'done');
    await expect(done).toHaveText('✅対応済み');
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
    await expect(page.locator('#peek-focus')).toBeHidden();
  });

  // BLK-junior-20260915-0506-wish: 切り出しは「その部品だけの別の 1 枚」を作るので、
  // 相乗り図のどこに自分の部品が居て何と線でつながっているかという元の絵は失われる。
  // 手順 1 でしたいのは新しい図を作ることではなく、先輩の 1 枚を絞って眺めること。
  // 部品を 1 回押せば、1 枚のまま自部品の所だけが浮き、他が淡色 (または非表示) に
  // なることを到達条件にする。
  test('相乗り図を 1 枚のまま部品で絞ると、自部品のクラス・関連だけが浮かぶ', async ({ page }) => {
    await page.locator('#btn-tab-peek').click();
    await page.waitForSelector('#peek-modal');
    await page.locator('#peek-files .peek-file[data-file-name="driver_common_class"]').click();

    // 到達条件その1: 押す前に「何部品の相乗りか」が読める。
    await page.waitForSelector('#peek-focus .peek-focus-chip');
    await expect(page.locator('#peek-focus-head')).toContainText('4 部品の相乗り');

    // 到達条件その2: 1 回押すと、残る所と落ちる所が数で言われる。
    await page.locator('#peek-focus .peek-focus-chip[data-focus-part="Spi_Driver"]').click();
    await expect(page.locator('#peek-focus-label')).toContainText('Spi_Driver');
    await expect(page.locator('#peek-focus-label')).toContainText('3 クラス');
    await expect(page.locator('#peek-focus-label')).toContainText('淡色');

    // 到達条件その3: 図は 1 枚のまま。関係しない部品も絵に残り (位置が分かる)、
    // 淡色が実際に描画まで届いている。
    await page.waitForSelector('#peek-svg[data-focus="Spi_Driver:dim"] svg');
    const svg = await page.locator('#peek-svg').innerHTML();
    expect(svg).toContain('Can_Driver');
    expect(svg).toContain('Gpio_Driver');
    expect(svg.toUpperCase()).toContain('#DDDDDD');

    // 到達条件その4: 本文も同じ絞りで読める (打ち写す側で行が見分けられる)。
    const kept = await page.locator('#peek-dsl .peek-dsl-keep').allInnerTexts();
    expect(kept.join('\n')).toContain('Spi_Init');
    const dimmed = await page.locator('#peek-dsl .peek-dsl-dim').allInnerTexts();
    expect(dimmed.join('\n')).toContain('Can_Init');

    // 到達条件その5: 非表示に切り替えると、関係しない所は本文からも消える。
    await page.locator('#peek-focus .peek-focus-mode[data-focus-mode="hide"]').click();
    await expect(page.locator('#peek-focus-label')).toContainText('非表示');
    await expect(page.locator('#peek-dsl')).not.toContainText('Can_Init');
    await expect(page.locator('#peek-dsl')).toContainText('Spi_Init');

    // 到達条件その6: 解除すれば元の 1 枚に戻る (先輩の本文は書き換わっていない)。
    await page.locator('#peek-focus-clear').click();
    await expect(page.locator('#peek-dsl')).toContainText('Can_Init');
    await expect(page.locator('#peek-focus-label')).toHaveText('');
  });
});

// BLK-junior-20260914-1106-wish: 指摘.md には「対象は本番用か資料用か」まで書いて
// あるのに、開く側は図種単位でしか見分けず、同じ図種の枠に並ぶ (資料用) を
// ボタンの文字で読み比べて選んでいた。読み比べは図種数 × 同居ファイル数で増える。
// 指摘 1 件を選べば、その指摘が指す図種・版が名指しされ、📂一覧のその行が光り、
// 並べて見る画面もその版で開くことを到達条件にする。
const VAR_ROOT = DIR + '-variant';
const VAR_MINE = VAR_ROOT + '/junior';
const VAR_SENIOR = VAR_ROOT + '/primary';
const VAR_REVIEWER = VAR_ROOT + '/reviewer';

const VAR_PLAIN = 'GPIOドライバ初期化アクティビティ';
const VAR_MATERIAL = 'GPIOドライバ初期化アクティビティ(資料用)';

const VAR_NOTE = [
  '# junior への指摘',
  '',
  '## 【最重要】GPIOドライバ初期化アクティビティ の分岐が足りません',
  '対象は資料用です。本番用の方は直さなくて構いません。',
  'エラー時の分岐が 1 本も書かれていません。',
].join('\n');

const ACT_PLAIN = ['@startuml', 'start', ':GPIO を初期化する;', 'stop', '@enduml'].join('\n');
const ACT_MATERIAL = ['@startuml', 'start', ':GPIO を初期化する（資料用）;', 'stop', '@enduml'].join('\n');

test.describe('junior 手順 1: 指摘が指す版が名指しで開く', () => {
  test.beforeEach(async ({ page }) => {
    await S1.bootWithSaveDir(page, VAR_MINE);
    await S1.clearDir(page, VAR_MINE);
    await S1.clearDir(page, VAR_SENIOR);
    await S1.putDoc(page, VAR_MINE, VAR_PLAIN, ACT_PLAIN);
    await S1.putDoc(page, VAR_MINE, VAR_MATERIAL, ACT_MATERIAL);
    await S1.putDoc(page, VAR_SENIOR, VAR_PLAIN, ACT_PLAIN);
    await S1.putDoc(page, VAR_SENIOR, VAR_MATERIAL, ACT_MATERIAL);
    fs.mkdirSync(absOf(VAR_REVIEWER), { recursive: true });
    fs.writeFileSync(nodePath.join(absOf(VAR_REVIEWER), '指摘.md'), VAR_NOTE, 'utf-8');
    await page.reload();
    await page.waitForSelector('#btn-tab-peek');
  });

  test('指摘 1 件が指す図種・版が、押す前に 1 行で読める', async ({ page }) => {
    await page.locator('#btn-tab-peek').click();
    await page.waitForSelector('#peek-modal');
    await page.locator('#peek-note-toggle').click();
    await page.waitForSelector('#peek-note .note-finding');

    // 到達条件その1: 対象の図種・版・図名が、指摘の行のすぐ下に出る。
    const target = page.locator('#peek-note .note-target-row').first();
    await expect(target).toHaveAttribute('data-note-target-name', VAR_MATERIAL);
    await expect(target).toHaveAttribute('data-note-target-variant', 'material');
    await expect(target).toHaveAttribute('data-note-target-kind', 'アクティビティ図');
    // 指摘文から読んだ版であることが読める (既定で本番用にしたのではない)。
    await expect(target).toHaveAttribute('data-note-target-by', 'text');
    await expect(target).toContainText('資料用');
  });

  test('押すと、その版が自分 ⇔ 先輩で並ぶ (本番用の方ではない)', async ({ page }) => {
    await page.locator('#btn-tab-peek').click();
    await page.waitForSelector('#peek-modal');
    await page.locator('#peek-note-toggle').click();
    await page.waitForSelector('#peek-note .note-finding');
    await page.locator('#peek-note .note-finding').first().click();

    await expect(page.locator('#note-summary')).toContainText(VAR_MATERIAL);
    await page.waitForSelector('#sbs-grid');
    const grid = await page.locator('#sbs-grid').innerText();
    expect(grid).toContain('資料用');
  });

  test('📂 一覧は版を 1 文字で言い、指摘が指す版の行を光らせる', async ({ page }) => {
    await page.locator('#btn-tab-peek').click();
    await page.waitForSelector('#peek-modal');
    await page.locator('#peek-note-toggle').click();
    await page.waitForSelector('#peek-note .note-finding');
    await page.locator('#peek-note .note-finding').first().click();
    await page.waitForTimeout(400);
    await page.locator('#peek-close').click();

    await S1.openFolder(page);
    // 到達条件その2: 版は名前の末尾を読まなくても行の印で分かる。
    await expect(page.locator('#folder-panel [data-variant-of="' + VAR_MATERIAL + '"]'))
      .toHaveText('資');
    await expect(page.locator('#folder-panel [data-variant-of="' + VAR_PLAIN + '"]')).toHaveCount(0);
    // 到達条件その3: 今回の対象の行だけが光り、同じ図の別の版は「同じ図の版」止まり。
    const rows = page.locator('#folder-panel .folder-row[data-note-hit]');
    await expect(rows.filter({ has: page.locator('[data-file-name="' + VAR_MATERIAL + '"]') }))
      .toHaveAttribute('data-note-hit', 'target');
    await expect(rows.filter({ has: page.locator('[data-file-name="' + VAR_PLAIN + '"]') }))
      .toHaveAttribute('data-note-hit', 'family');
  });

  test('図種の枠に版が 2 つ並んでも、開くべき 1 枚が光っている', async ({ page }) => {
    await page.locator('#btn-tab-peek').click();
    await page.waitForSelector('#peek-modal');
    await page.locator('#peek-note-toggle').click();
    await page.waitForSelector('#peek-note .note-finding');
    await page.locator('#peek-note .note-finding').first().click();
    await page.waitForTimeout(400);
    await page.locator('#peek-close').click();

    await S1.openFolder(page);
    await page.selectOption('#folder-inv-pick', { index: 1 });
    const row = page.locator('#folder-panel .folder-inv-row[data-inv-kind="アクティビティ図"]');
    await expect(row).toHaveAttribute('data-note-kind-hit', '1');
    await expect(row.locator('[data-inv-file="' + VAR_MATERIAL + '"]'))
      .toHaveAttribute('data-note-hit', 'target');
    await expect(row.locator('[data-inv-file="' + VAR_PLAIN + '"]'))
      .toHaveAttribute('data-note-hit', 'family');
  });
});

// BLK-junior-20260914-1306-wish: 9 周目の場面は「先輩の図の変更を自分の図に取り込む」。
// 手順 1〜2 で要るのは「先輩のどの 1 枚が前回保存から変わったか」だが、👀他フォルダは
// 名前・図種・SVG の印しか出さないので、複合図 (driver_common_class) を丸ごと開いて
// 目で差分を探し、変わっていない図まで開いて見比べていた。
// 一覧の行が ＋部品 −関係 を言い、変更のある図だけに絞れることを到達条件にする。
const CHG_ROOT = DIR + '-changes';
const CHG_MINE = CHG_ROOT + '/junior';
const CHG_SENIOR = CHG_ROOT + '/primary';

const COMP_V1 = [
  '@startuml', 'title Driver_Common_Class',
  'class Driver_Common {', '  + Init() : void', '}',
  'class Gpio_Driver {', '  + Gpio_Init() : void', '}',
  'class IRQCtrl {', '  + EnableIrq() : void', '}',
  'Gpio_Driver --|> Driver_Common', '@enduml',
].join('\n');
// 先輩が足したもの: 部品 Port_Drv 1 つと、関係 1 本。
const COMP_V2 = [
  '@startuml', 'title Driver_Common_Class',
  'class Driver_Common {', '  + Init() : void', '}',
  'class Gpio_Driver {', '  + Gpio_Init() : void', '}',
  'class IRQCtrl {', '  + EnableIrq() : void', '}',
  'class Port_Drv {', '  + Port_SetMode() : void', '}',
  'Gpio_Driver --|> Driver_Common', 'Gpio_Driver --> Port_Drv', '@enduml',
].join('\n');

const SEQ_V1 = ['@startuml', 'title gpio init',
  'participant Gpio_Driver', 'participant Hw_Ctrl',
  'Gpio_Driver -> Hw_Ctrl : Gpio_Init', '@enduml'].join('\n');
// 題を直しただけ。取り込む中身は無いので「変更あり」と名指ししてはいけない。
const SEQ_V2 = SEQ_V1.replace('title gpio init', 'title GPIO 初期化シーケンス');

// 一度しか保存されていない図。比べる前回が無い。
const STATE_ONLY = ['@startuml', 'title can state', '[*] --> Uninit',
  'Uninit --> Ready : Can_Init', '@enduml'].join('\n');

test.describe('junior 手順 1: 先輩の図が前回保存からどこを変えたかを開く前に知る', () => {
  test.beforeEach(async ({ page }) => {
    await S1.bootWithSaveDir(page, CHG_MINE);
    await S1.clearDir(page, CHG_MINE);
    await S1.clearDir(page, CHG_SENIOR);
    await S1.putDoc(page, CHG_MINE, 'GpioDrv派生クラス図', COMP_V1);
    // 先輩のフォルダ: 2 枚は上書きされている (= 前回保存の控えがある)。
    await S1.putDoc(page, CHG_SENIOR, 'driver_common_class', COMP_V1);
    await S1.putDoc(page, CHG_SENIOR, 'gpio_init_sequence', SEQ_V1);
    await page.waitForTimeout(1100);   // 刻印は秒まで。同じ秒に重ねない
    await S1.putDoc(page, CHG_SENIOR, 'driver_common_class', COMP_V2);
    await S1.putDoc(page, CHG_SENIOR, 'gpio_init_sequence', SEQ_V2);
    await S1.putDoc(page, CHG_SENIOR, 'can_state', STATE_ONLY);
    await page.reload();
    await page.waitForSelector('#btn-tab-peek');
  });

  test.afterEach(async ({ page }) => {
    await S1.clearDir(page, CHG_SENIOR).catch(() => {});
    await S1.clearDir(page, CHG_MINE).catch(() => {});
  });

  async function openPeek(page) {
    await page.locator('#btn-tab-peek').click();
    await page.waitForSelector('#peek-modal');
    await page.waitForSelector('#peek-change-summary');
  }

  test('一覧の見出しが「何枚開けば済むか」を言う', async ({ page }) => {
    await openPeek(page);
    const sum = page.locator('#peek-change-summary');
    await expect(sum).toContainText('3 枚中 1 枚が前回保存から変わっています');
    await expect(sum).toContainText('変更なし 1');
    await expect(sum).toContainText('前回保存なし 1');
  });

  test('行の印が ＋部品 −関係 の数まで言う (「差分あり」で終わらせない)', async ({ page }) => {
    await openPeek(page);
    const changed = page.locator('#peek-files [data-change-of="driver_common_class"]');
    await expect(changed).toHaveAttribute('data-change', 'changed');
    await expect(changed).toHaveText('＋2');
    await expect(changed).toHaveAttribute('title', /部品 ＋1/);
    await expect(changed).toHaveAttribute('title', /関係 ＋1/);

    // 題だけ直した図は「変更なし」。開く必要が無い。
    await expect(page.locator('#peek-files [data-change-of="gpio_init_sequence"]'))
      .toHaveAttribute('data-change', 'same');
    // 控えが無い図を「変更なし」と言わない。
    await expect(page.locator('#peek-files [data-change-of="can_state"]'))
      .toHaveAttribute('data-change', 'no-prev');
  });

  test('変更のある図が一覧の先頭に来て、そのまま開いている', async ({ page }) => {
    await openPeek(page);
    await expect(page.locator('#peek-files .peek-file').first())
      .toHaveAttribute('data-file-name', 'driver_common_class');
    await expect(page.locator('#peek-title')).toContainText('driver_common_class');
  });

  test('開いた 1 枚の内訳が、本文を読まずに ＋ − の行で出る', async ({ page }) => {
    await openPeek(page);
    await page.locator('#peek-files .peek-file[data-file-name="driver_common_class"]').click();
    await page.waitForSelector('#peek-change-notice');
    await expect(page.locator('#peek-change-notice')).toContainText('部品 ＋1');
    const adds = page.locator('#peek-changes .peek-change-line[data-change-sign="+"]');
    await expect(adds).toHaveCount(2);
    await expect(adds.filter({ hasText: 'class Port_Drv' })).toHaveCount(1);
    await expect(adds.filter({ hasText: 'Gpio_Driver --> Port_Drv' })).toHaveCount(1);
  });

  test('絞り込むと変更のある図だけが残り、解くと全部戻る (手順 1〜2 の往復が消える)', async ({ page }) => {
    await openPeek(page);
    await expect(page.locator('#peek-files .peek-file')).toHaveCount(3);

    // クリック 1 回で、開くべき 1 枚だけの一覧になる。
    await page.locator('#peek-change-filter').click();
    await expect(page.locator('#peek-files .peek-file')).toHaveCount(1);
    await expect(page.locator('#peek-files .peek-file').first())
      .toHaveAttribute('data-file-name', 'driver_common_class');
    await expect(page.locator('#peek-change-filter')).toHaveText('全部の図を出す（3 枚）');

    await page.locator('#peek-change-filter').click();
    await expect(page.locator('#peek-files .peek-file')).toHaveCount(3);
    await expect(page.locator('#peek-change-filter')).toHaveText('変更のある図だけ（1 枚）');
  });
});

// BLK-junior-20260914-1706-wish: 「先輩の変更を取り込む」場面で、先輩にその図種が
// 1 枚も無ければ取り込む変更は存在しない。ところが「この図種は先輩に実体が無いので
// 今回は対応不要だった」という結論は自分の記憶と run ログにしか残らず、次に同じ図を
// 担当するたびに 👀他フォルダ → 図種バッジの確認をゼロからやり直していた。
// 確認した時点の結論を自分の図に控えられ、次に開いたときそのまま見えることを到達条件にする。
test.describe('junior 手順 1〜2: 先輩に実体が無い図種の結論を控える', () => {
  test.beforeEach(async ({ page }) => {
    await S1.bootWithSaveDir(page, NOTE_MINE);
    await S1.clearDir(page, NOTE_MINE);
    await S1.clearDir(page, NOTE_SENIOR);
    await S1.putDoc(page, NOTE_MINE, 'gpio_state', S1.GPIO_STATE);
    // 先輩にはシーケンス図しか無い (アクティビティ図は 1 枚も無い)。
    await S1.putDoc(page, NOTE_SENIOR, 'gpio_init_sequence', SENIOR_SEQ);
    // 「手本なしで確定」はフォルダの持ち物で clearDir では消えない。下ごしらえで外す。
    await clearPeekSettled(page, NOTE_MINE);
    await page.reload();
    await page.waitForSelector('#btn-tab-peek');
  });

  test('先輩に 0 枚の図種は「対応不要」を自分の図に控えられ、次に開いても見える', async ({ page }) => {
    await S1.openFolderItem(page, 'gpio_state');
    const lock = page.locator('#source-lock-modal');
    if (await lock.isVisible().catch(() => false)) {
      await page.locator('#source-lock-overwrite').click();
      await page.waitForTimeout(600);
    }
    await page.locator('#btn-tab-peek').click();
    await page.waitForSelector('#peek-modal');
    await page.locator('#peek-dirs .peek-dir[data-dir-name="primary"]').click();
    await page.waitForTimeout(1200);

    // 到達条件 1: 先輩に 0 枚の図種が名指しされ、控えるかどうかを聞かれる。
    const row = page.locator('[data-peek-verdict="アクティビティ"]');
    await row.waitFor({ timeout: 10000 });
    await expect(row).toContainText('0 枚です');
    // 先輩に実体のある図種は聞かれない (取り込む変更があるので対応不要にならない)。
    expect(await page.locator('[data-peek-verdict="シーケンス"]').count()).toBe(0);

    // 到達条件 2: 1 押しで、確認の結論が自分の図の中に残る。
    await page.locator('[data-peek-verdict-keep="アクティビティ"]').click();
    await page.waitForTimeout(1200);
    const text = await page.locator('#editor').inputValue();
    expect(text).toContain("' @peek アクティビティ|primary|0");

    // 到達条件 3: 控えた後は「👀手本なし」として見え、確認をやり直さずに済む。
    await expect(page.locator('[data-peek-verdict="アクティビティ"]')).toContainText('👀手本なし');

    // 到達条件 4: 控えは図の本文なので、保存すれば保存フォルダのファイルにも残る。
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.locator('#top-save').click();
    await page.waitForTimeout(1200);
    const lock2 = page.locator('#source-lock-modal');
    if (await lock2.isVisible().catch(() => false)) {
      await page.locator('#source-lock-overwrite').click();
      await page.waitForTimeout(900);
    }
    await page.waitForTimeout(1200);
    expect(await S1.readDoc(page, NOTE_MINE, 'gpio_state') || '').toContain("' @peek アクティビティ");
  });
});

async function clearPeekSettled(page, dir) {
  await page.evaluate(async (d) => {
    await fetch('/peek-settled', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir: d, clear: true }) });
  }, dir);
}

async function openPeekPrimary(page, name) {
  await S1.openFolderItem(page, name);
  const lock = page.locator('#source-lock-modal');
  if (await lock.isVisible().catch(() => false)) {
    await page.locator('#source-lock-overwrite').click();
    await page.waitForTimeout(600);
  }
  await page.locator('#btn-tab-peek').click();
  await page.waitForSelector('#peek-modal');
  await page.locator('#peek-dirs .peek-dir[data-dir-name="primary"]').click();
  await page.waitForTimeout(1200);
}

// BLK-junior-20260916-2314-wish: 控えは開いていた 1 枚の図の中にしか残らず、次の周に別の図を開くと
// 「primary に ○○ は 0 枚です」を図種の数だけ聞き直していた。一度確定した (相手 × 図種) は
// 保存フォルダに残り、どの図を開いても・再読み込みしても聞かれず、確定リストから外せば また聞かれる。
test.describe('junior 手順 1: 手本なしで確定した図種は二度と聞かれない', () => {
  test.beforeEach(async ({ page }) => {
    await S1.bootWithSaveDir(page, NOTE_MINE);
    await S1.clearDir(page, NOTE_MINE);
    await S1.clearDir(page, NOTE_SENIOR);
    await S1.putDoc(page, NOTE_MINE, 'gpio_state', S1.GPIO_STATE);
    await S1.putDoc(page, NOTE_MINE, 'timer_state', S1.GPIO_STATE.replace(/Gpio/g, 'Timer'));
    await S1.putDoc(page, NOTE_SENIOR, 'gpio_init_sequence', SENIOR_SEQ);
    await clearPeekSettled(page, NOTE_MINE);
    await page.reload();
    await page.waitForSelector('#btn-tab-peek');
  });

  test('1 回確定すると別の図・次の周でも聞かれず、✕ で外すとまた聞かれる', async ({ page }) => {
    await openPeekPrimary(page, 'gpio_state');
    await expect(page.locator('[data-peek-verdict="アクティビティ"]')).toContainText('0 枚です');
    await page.locator('[data-peek-verdict-keep="アクティビティ"]').click();
    await page.waitForTimeout(1200);

    // 次の周: 再読み込み (ブラウザの記憶は消える) して、控えを書いていない別の図を開く。
    // localStorage は起動時に消える (init script)。残るのは保存フォルダ側だけ。
    await page.reload();
    await page.waitForSelector('#btn-tab-peek');
    await openPeekPrimary(page, 'timer_state');

    // 確定した図種は聞かれない (質問の行も「控える」ボタンも出ない)。
    await expect(page.locator('#peek-settled-text')).toContainText('primary は手本なしで確定: アクティビティ');
    await expect(page.locator('[data-peek-verdict="アクティビティ"]')).toHaveCount(0);
    await expect(page.locator('[data-peek-verdict-keep="アクティビティ"]')).toHaveCount(0);
    // 確定していない図種はこれまでどおり聞かれる。
    await expect(page.locator('[data-peek-verdict-keep="ユースケース"]')).toHaveCount(1);

    // 答えを変えたくなったら確定リストから外す → また聞かれる。
    await page.locator('[data-peek-settled-clear="アクティビティ"]').click();
    await expect(page.locator('[data-peek-verdict-keep="アクティビティ"]')).toHaveCount(1);
    await expect(page.locator('#peek-settled')).toHaveCount(0);
    const left = await page.evaluate(async (d) => (await (await fetch('/peek-settled?dir=' + encodeURIComponent(d))).json()).entries, NOTE_MINE);
    expect(left.length).toBe(0);
  });
});

// BLK-junior-20260914-1806-wish: 手順 1〜2 の「対応要否の確認」は、図種を 1 つずつ担当する
// 進め方だと 6 周にまたがって 1 枚ずつになる (GPIO だけで 9 周目の今も 3 図種目)。
// 題材を選べば 6 図種ぶんの結論がその場で並び、残りの図種も周を待たずに分かる。
const MTX_ROOT = SLICE_ROOT + '-matrix';
const MTX_MINE = MTX_ROOT + '/junior';
const MTX_SENIOR = MTX_ROOT + '/primary';

const MTX_SEQ = ['@startuml', 'participant Gpio_Driver', 'participant Hw_Ctrl',
  'Gpio_Driver -> Hw_Ctrl : Gpio_Init', '@enduml'].join('\n');
const MTX_STATE = ['@startuml', '[*] --> Ready', 'Ready --> Busy : Gpio_Init', '@enduml'].join('\n');
const MTX_CLASS = ['@startuml', 'class Gpio_Driver {', '  + Gpio_Init() : void', '}', '@enduml'].join('\n');
const MTX_COMPONENT = ['@startuml', 'component Gpio_Driver', 'component Hw_Ctrl', '@enduml'].join('\n');

test.describe('junior 手順 1〜2: 題材ごとに 6 図種の対応要否を 1 画面で見る', () => {
  test.beforeEach(async ({ page }) => {
    await S1.bootWithSaveDir(page, MTX_MINE);
    await S1.clearDir(page, MTX_MINE);
    await S1.clearDir(page, MTX_SENIOR);
    // 自分: シーケンス・状態遷移・クラスの 3 枚 (コンポーネントはまだ無い)。
    await S1.putDoc(page, MTX_MINE, 'gpio_init_sequence', MTX_SEQ);
    await S1.putDoc(page, MTX_MINE, 'gpio_state', MTX_STATE);
    await S1.putDoc(page, MTX_MINE, 'gpio_class', MTX_CLASS);
    // 先輩: 状態遷移・クラス・コンポーネントの 3 枚 (シーケンスは持っていない)。
    await S1.putDoc(page, MTX_SENIOR, 'gpio_state', MTX_STATE);
    await S1.putDoc(page, MTX_SENIOR, 'gpio_class', MTX_CLASS);
    await S1.putDoc(page, MTX_SENIOR, 'gpio_component', MTX_COMPONENT);
    await page.reload();
    await page.waitForSelector('#btn-tab-peek');
  });

  test('題材を選ぶと 6 図種すべての対応要否がその場で並ぶ', async ({ page }) => {
    await page.locator('#btn-tab-peek').click();
    await page.waitForSelector('#peek-modal');
    await page.waitForSelector('#peek-matrix .pkm-row');

    // 題材を選ぶ (台本の「GPIO を選ぶと」に当たる 1 操作)。
    await page.locator('#peek-subject').selectOption('gpio');
    await page.waitForTimeout(300);

    // 到達条件その1: 6 図種ぶんの行が必ず出る (自分にも先輩にも無い図種を落とさない)。
    expect(await page.locator('#peek-matrix .pkm-row').count()).toBe(6);
    await expect(page.locator('#peek-subject')).toHaveValue('gpio');

    // 到達条件その2: 図種ごとに、この周ですることが向きごとに分かる。
    await expect(page.locator('#peek-matrix .pkm-row[data-kind="state"]'))
      .toHaveAttribute('data-state', 'check');
    await expect(page.locator('#peek-matrix .pkm-row[data-kind="component"]'))
      .toHaveAttribute('data-state', 'mine-missing');
    await expect(page.locator('#peek-matrix .pkm-row[data-kind="usecase"]'))
      .toHaveAttribute('data-state', 'no-model');

    // 到達条件その3: 残りが何図種あるかを見出しが先に言う (周が来るまで待たない)。
    await expect(page.locator('#peek-matrix-summary')).toContainText('GPIO: 6 図種のうち');
    await expect(page.locator('#peek-matrix-summary')).toContainText('未確認 2');
    await expect(page.locator('#peek-matrix-summary')).toContainText('自分に無し 1');

    // 到達条件その4: その行から先輩の 1 枚をそのまま開ける (一覧を目で探し直さない)。
    await page.locator('#peek-matrix .pkm-row[data-kind="component"] .pkm-open').click();
    await page.waitForTimeout(1200);
    await expect(page.locator('#peek-title')).toContainText('gpio_component');
  });

  // BLK-junior-20260914-1906-wish: 担当は GPIO だけではない (UART / CAN / TIMER)。
  // 題材を選び直して 6 図種ずつ確かめる周回をやめ、部品 × 図種を 1 枚の表で出す。
  test('すべての部品を選ぶと、部品 × 図種の表が 1 枚で出る', async ({ page }) => {
    // UART は自分に 1 枚も無く、先輩に 2 枚ある (GPIO より残りが多い部品)。
    await S1.putDoc(page, MTX_SENIOR, 'uart_state', MTX_STATE);
    await S1.putDoc(page, MTX_SENIOR, 'uart_class', MTX_CLASS);
    await S1.putDoc(page, MTX_MINE, 'uart_init_sequence', MTX_SEQ);
    await page.reload();
    await page.waitForSelector('#btn-tab-peek');
    await page.locator('#btn-tab-peek').click();
    await page.waitForSelector('#peek-modal');
    await page.waitForSelector('#peek-matrix .pkm-head');

    // 選ぶのは 1 回だけ (部品ごとに選び直さない)。
    await page.locator('#peek-subject').selectOption('*');
    await page.waitForSelector('#peek-matrix-grid');

    // 到達条件その1: 担当している部品が全部行になり、横に 6 図種が並ぶ。
    const rows = page.locator('#peek-matrix-grid .pkm-grow');
    await expect(page.locator('.pkm-grow[data-subject="gpio"]')).toHaveCount(1);
    await expect(page.locator('.pkm-grow[data-subject="uart"]')).toHaveCount(1);
    await expect(page.locator('#peek-matrix-grid th[data-kind]')).toHaveCount(6);
    await expect(page.locator('.pkm-grow[data-subject="gpio"] .pkm-cell')).toHaveCount(6);

    // 到達条件その2: 残りの多い部品が上に来る (次に着手する順に並ぶ)。
    await expect(rows.first()).toHaveAttribute('data-subject', 'gpio');
    await expect(rows.first()).toHaveAttribute('data-todo', '3');

    // 到達条件その3: セルがその組の対応要否を言う。
    await expect(page.locator('.pkm-grow[data-subject="gpio"] .pkm-cell[data-kind="component"]'))
      .toHaveAttribute('data-state', 'mine-missing');
    await expect(page.locator('.pkm-grow[data-subject="uart"] .pkm-cell[data-kind="state"]'))
      .toHaveAttribute('data-state', 'mine-missing');
    await expect(page.locator('#peek-matrix-summary')).toContainText('図種: 残り');
    await expect(page.locator('#peek-matrix-next')).toContainText('GPIO');
    await expect(page.locator('#peek-matrix-legend')).toContainText('自分に無し');

    // 到達条件その4: 表のセルから先輩の 1 枚をそのまま開ける (部品を選び直さない)。
    await page.locator('.pkm-grow[data-subject="uart"] .pkm-cell[data-kind="class"]').click();
    await page.waitForTimeout(1200);
    await expect(page.locator('#peek-title')).toContainText('uart_class');
  });

  test('部品名を押せば、その部品だけの 6 行に戻れる', async ({ page }) => {
    await page.locator('#btn-tab-peek').click();
    await page.waitForSelector('#peek-modal');
    await page.waitForSelector('#peek-matrix .pkm-head');
    await page.locator('#peek-subject').selectOption('*');
    await page.waitForSelector('#peek-matrix-grid');
    await page.locator('.pkm-grow[data-subject="gpio"] .pkm-gname').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#peek-subject')).toHaveValue('gpio');
    expect(await page.locator('#peek-matrix .pkm-row').count()).toBe(6);
  });
});

// BLK-junior-20260914-1406: 手順 1 の「先輩の該当図を開いて見る」を、⇡継承元の登録で
// 済ませようとすると詰まっていた。部品名の付け方を先輩と揃えているので自分の図も
// 先輩の図も gpio_init_sequence で、継承元の候補が名前だけで自分と同一視され、
// フォルダを先輩の保存先に変えても候補から消えていた。
const LG_ROOT = DIR + '-lineage';
const LG_MINE = LG_ROOT + '/junior';
const LG_SENIOR = LG_ROOT + '/primary';
const SAME = 'gpio_init_sequence';

test.describe('junior 手順 1: 同名の先輩の図を継承元にする', () => {
  test('フォルダを先輩の保存先に変えれば、自分と同名の図でも継承元にできる', async ({ page }) => {
    await S1.bootWithSaveDir(page, LG_MINE);
    await S1.clearDir(page, LG_MINE);
    await S1.clearDir(page, LG_SENIOR);
    await S1.putDoc(page, LG_MINE, SAME, MINE_SEQ);
    await S1.putDoc(page, LG_SENIOR, SAME, SENIOR_SEQ);
    await page.reload();
    await page.waitForSelector('#btn-tab-lineage');
    await page.evaluate(() => window.MA.lineage.reset());
    // 自分の図 (先輩と同じ名前) を開いている状態にする。
    await page.evaluate((n) => {
      window.MA.workspace.rename(window.MA.workspace.getActiveId(), n);
    }, SAME);
    await S1.typeDsl(page, MINE_SEQ);

    await page.locator('#btn-tab-lineage').click();
    await expect(page.locator('#lg-modal')).toBeVisible();
    await page.locator('#lg-dir').fill(LG_SENIOR);
    await page.locator('#lg-dir').dispatchEvent('change');
    await page.waitForTimeout(600);

    // 到達条件その1: 先輩のフォルダに切り替えれば、自分と同名の図が候補に出る。
    const opts = await page.locator('#lg-parent option').allTextContents();
    expect(opts).toContain(SAME);

    // 到達条件その2: 登録できる (同名でもフォルダが違えば別の図)。
    await page.locator('#lg-parent').selectOption(SAME);
    await page.locator('#lg-set').click();
    await page.waitForTimeout(600);
    await expect(page.locator('#lg-note')).toContainText('継承元にしました');
    // どちらの gpio_init_sequence かがフォルダまで出る (自分自身と読めない)。
    await expect(page.locator('#lg-summary')).toContainText(LG_SENIOR);

    // 到達条件その3: 先輩が直せば、差分の行数がそのまま出る (手で書き写さない)。
    await S1.putDoc(page, LG_SENIOR, SAME, SENIOR_SEQ.replace('@enduml', 'Nvic --> Gpio_Driver : Gpio_IrqReady\n@enduml'));
    await page.locator('#lg-close').click();
    await page.locator('#btn-tab-lineage').click();
    await expect(page.locator('#lg-summary')).toContainText('継承元 ' + SAME + ' (' + LG_SENIOR + ')');
    await expect(page.locator('#lg-summary')).toContainText('差分 1 行');
    await expect(page.locator('#lg-diff')).toContainText('Gpio_IrqReady');
  });

  test('同じフォルダの自分自身は継承元にできないままで、理由が出る', async ({ page }) => {
    await S1.bootWithSaveDir(page, LG_MINE);
    await S1.clearDir(page, LG_MINE);
    await S1.putDoc(page, LG_MINE, SAME, MINE_SEQ);
    await page.reload();
    await page.waitForSelector('#btn-tab-lineage');
    await page.evaluate(() => window.MA.lineage.reset());
    await page.evaluate((n) => {
      window.MA.workspace.rename(window.MA.workspace.getActiveId(), n);
    }, SAME);
    await S1.typeDsl(page, MINE_SEQ);

    await page.locator('#btn-tab-lineage').click();
    await expect(page.locator('#lg-modal')).toBeVisible();
    // 自分の保存先のままなら、自分と同じ名前は候補に出ない。
    const opts = await page.locator('#lg-parent option').allTextContents();
    expect(opts).not.toContain(SAME);
  });
});

// BLK-junior-20260914-1306: 手順 1 で、図名も図種も書かれていない指摘だけは
// 一覧が件数しか言わず、自分宛かどうかを確かめるのに GUI の外で指摘.md の全文を
// 読む用が毎回残っていた。宛先を言い、本文をその場で開けるようにした。
const UA_ROOT = DIR + '-unaddr';
const UA_MINE = UA_ROOT + '/junior';
const UA_SENIOR = UA_ROOT + '/primary';
const UA_REVIEWER = UA_ROOT + '/reviewer';

const UA_NOTE = [
  '# 指摘',
  '',
  '## 【継続】gpio_init_sequence の部品名不一致',
  'junior 側 `Gpio` / primary 側 `Gpio_Driver`。',
  '',
  '## 命名の略語の大文字化が揃っていない',
  'junior は IRQCtrl、他は Irq_Ctrl。どちらかに寄せてください。',
  '',
  '## 編集中ファイルの整理',
  'primary の保存先に `-編集中` が 3 つ残っています。',
  '',
  '## 粒度の目安について',
  '1 操作 1 メッセージを基本にしたいという話です。',
].join('\n');

test.describe('junior 手順 1: 宛先の書かれていない指摘を GUI の中で片付ける', () => {
  test('一覧が宛先まで言い、自分宛の本文をその場で読める', async ({ page }) => {
    await S1.bootWithSaveDir(page, UA_MINE);
    await S1.clearDir(page, UA_MINE);
    await S1.clearDir(page, UA_SENIOR);
    await S1.putDoc(page, UA_MINE, 'gpio_init_sequence', MINE_SEQ);
    await S1.putDoc(page, UA_SENIOR, 'gpio_init_sequence', SENIOR_SEQ);
    fs.mkdirSync(absOf(UA_REVIEWER), { recursive: true });
    fs.writeFileSync(nodePath.join(absOf(UA_REVIEWER), '指摘.md'), UA_NOTE, 'utf-8');
    await page.reload();
    await page.waitForSelector('#btn-tab-folder');

    await S1.openFolder(page);
    await page.waitForTimeout(1500);

    // 到達条件その1: 見出しが、割り当てられない件の宛先の内訳まで言う。
    await expect(page.locator('#folder-note-summary')).toContainText('自分宛 1 件');

    // 到達条件その2: その 3 件が行として並び、自分宛が見分けられる。
    const sec = page.locator('#folder-unaddr');
    await expect(sec).toHaveAttribute('data-unaddr-count', '3');
    const mine = sec.locator('.folder-unaddr-row[data-unaddr-to="mine"]');
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText('略語の大文字化');
    await expect(sec.locator('.folder-unaddr-row[data-unaddr-to="other"]')).toHaveCount(1);
    await expect(sec.locator('.folder-unaddr-row[data-unaddr-to="unknown"]')).toHaveCount(1);

    // 到達条件その3: 押せば本文がその場に出る (指摘.md をテキストエディタで開かない)。
    await mine.locator('.folder-unaddr-head').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#folder-unaddr-body')).toContainText('IRQCtrl');
  });
});


// BLK-junior-20260914-1406-wish: 手順1 は「先輩の該当図を開いて詳細を見る」から始まり、
// 手順2 の「自分の図に反映」との往復になる。👀 他フォルダはモーダルなので自分の図を
// 書く間は閉じることになり、保存先設定を行き来して開き直していた。
// ⇔ 先輩の図 は据え置きの 2 枠目で、図を切り替えると相手も自動で入れ替わる。
const SENIOR_DIR = DIR + '-senior';
// 先輩のクラス図は部品ごとに分かれておらず、全ドライバが 1 枚に載る
// (persona-data/primary/driver_common_class.puml と同じ形)。
const COMMON_CLASS = [
  '@startuml',
  'title Driver_Common_Class',
  'class Driver_Common {',
  '  + Init() : void',
  '}',
  'class Spi_Driver {',
  '  + Spi_Init() : void',
  '}',
  'class Timer_Driver {',
  '  + Timer_Init() : void',
  '  + Timer_Start() : void',
  '}',
  'class Uart_Driver {',
  '  + Uart_Init() : void',
  '}',
  'class IRQCtrl {',
  '  + EnableIrq() : void',
  '}',
  'Spi_Driver --|> Driver_Common',
  'Timer_Driver --|> Driver_Common',
  'Uart_Driver --|> Driver_Common',
  'Timer_Driver --> IRQCtrl',
  '@enduml',
].join(String.fromCharCode(10));
const SENIOR_BASE = SENIOR_DIR.slice(SENIOR_DIR.lastIndexOf('/') + 1).toLowerCase();

// 自分の図を開く。復元で同名のタブが既にあるならそれへ切り替える
// (rename にすると名前が `-2` に逃げ、同名判定の話にならない)。
async function openMine(page, name) {
  await page.evaluate((n) => {
    const ws = window.MA.workspace;
    const base = (s) => String(s || '').replace(/\.(puml|plantuml)$/i, '');
    const hit = ws.list().filter((d) => base(d.name) === n)[0];
    if (hit) switchToDoc(hit.id); else ws.rename(ws.getActiveId(), n);
    renderTabs();
  }, name);
  await page.waitForTimeout(300);
}

async function clearSenior(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, SENIOR_DIR);
  await page.waitForTimeout(200);
}

async function putIn(page, dir, name) {
  await page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl: DSL, dir });
}

test.describe('junior 手順 1〜2: 先輩の図を横に置いたまま自分の図を直す', () => {
  test.beforeEach(async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await clearSenior(page);
    // 自分と先輩に、フォルダ違いの同名図を 1 枚ずつ置く。継承元が「自分自身」と
    // みなして使えなかったのがこの形。前の test の置き土産が残っていると
    // 同じ名前が `-2` に逃げて同名判定が消えるので、先に空にする。
    // 自分側はタブの名前だけで足りる。同じ名前のファイルを自分の保存先にも
    // 置くと、タブの名前が `-2` に逃げて「フォルダ違いの同名」の話にならない。
    await putIn(page, SENIOR_DIR, 'gpio_init_sequence');
    await putIn(page, SENIOR_DIR, 'gpio_state');
    await page.waitForTimeout(400);
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
    await clearSenior(page).catch(() => {});
  });

  async function openSenior(page) {
    // 入口はタブ列に出ている。ツールの折りたたみを開かずに 1 クリックで届く。
    await page.locator('#btn-tab-senior').click();
    await page.waitForSelector('#senior-pane:not([hidden])');
    // 並びに出るのは server が返す実パスなので、末尾で見つけて選ぶ。
    // フォルダの一覧は開いたあとに取りに行くので、並ぶまで待つ。
    await page.waitForFunction((base) => {
      const sel = document.getElementById('senior-dir');
      return !!sel && Array.prototype.slice.call(sel.options).some(function(o) {
        return o.value.toLowerCase().split(String.fromCharCode(92)).join('/').indexOf(base) >= 0;
      });
    }, SENIOR_BASE);
    const value = await seniorOptionValue(page);
    await page.selectOption('#senior-dir', value);
    await page.waitForTimeout(800);
    return value;
  }

  async function seniorOptionValue(page) {
    return page.evaluate((base) => {
      const sel = document.getElementById('senior-dir');
      const hit = Array.prototype.slice.call(sel.options).filter(function(o) {
        var v = o.value.toLowerCase().split(String.fromCharCode(92)).join('/');
        return v.indexOf(base) >= 0;
      })[0];
      return hit ? hit.value : '';
    }, SENIOR_BASE);
  }

  test('先輩のフォルダを選ぶと、いま開いている図の相手が横に出たままになる', async ({ page }) => {
    await openMine(page, 'gpio_init_sequence');
    await openSenior(page);

    // 同名でもフォルダが違えば自分自身ではない (継承元が使えなかった所)。
    await expect(page.locator('#senior-notice')).toContainText('gpio_init_sequence');
    await expect(page.locator('#senior-notice')).toContainText('読むだけ');
    // 自分の図は左でそのまま編集できる (モーダルで覆わない)。
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#senior-dsl')).not.toHaveText('');
  });

  test('自分の図を切り替えると、先輩側も同じ図に入れ替わる (保存先は動かさない)', async ({ page }) => {
    await openMine(page, 'gpio_init_sequence');
    await openSenior(page);

    const before = await page.locator('#senior-notice').textContent();
    expect(before).toContain('gpio_init_sequence');

    await openMine(page, 'gpio_state');
    await page.waitForTimeout(800);
    await expect(page.locator('#senior-notice')).toContainText('gpio_state');

    // 保存先は先輩を見ている間も自分のまま (ここが切り替わると手順3 が壊れる)。
    const dir = await page.evaluate(() => window.MA.autoSave.getConfig().fileDir);
    expect(dir).toBe(DIR);
  });

  test('相手のいない図では、先頭の 1 枚を黙って出さずに「無い」と言う', async ({ page }) => {
    await openMine(page, 'adc_state');
    await openSenior(page);
    await expect(page.locator('#senior-notice')).toContainText('当たる先輩の図はありません');
    await expect(page.locator('#senior-dsl')).toHaveText('');
  });

  test('開いたままにした枠とフォルダは次に開いたときも残る', async ({ page }) => {
    await openMine(page, 'gpio_init_sequence');
    await openSenior(page);

    const chosen = await seniorOptionValue(page);
    await page.locator('#senior-close').click();
    await expect(page.locator('#senior-pane')).toHaveAttribute('hidden', '');

    // 開き直しても、フォルダを選ぶところからやり直さない。
    await page.locator('#btn-tab-senior').click();
    await page.waitForSelector('#senior-pane:not([hidden])');
    await page.waitForTimeout(800);
    await expect(page.locator('#senior-dir')).toHaveValue(chosen);
    await expect(page.locator('#senior-notice')).toContainText('gpio_init_sequence');
  });

  // BLK-junior-20260908-1103: 先輩の図を見る入口が 🧰 ツールの折りたたみの奥にあり、
  // 図種ごとの初回は毎回そこを通っていた (1 つの確認に 5 クリック)。常に見えている
  // 下端の「👀 先輩」から 1 クリックで着けることを到達条件にする。
  test('下端の「👀 先輩」から、折りたたみを通らずに 1 クリックで先輩の図に着く', async ({ page }) => {
    // まず 1 回だけフォルダを決める (以後この回答は覚えている)。
    await openSenior(page);
    await openMine(page, 'gpio_state');
    await page.waitForTimeout(800);
    await page.locator('#senior-close').click();
    await expect(page.locator('#senior-pane')).toHaveAttribute('hidden', '');

    // 到達条件その1: 枠を閉じていても、下端に「いま横に出る先輩の図」が出ている
    // (押す前に、目当ての図かどうかが読める)。
    const status = page.locator('#status-senior');
    await expect(status).toBeVisible();
    await expect(status).toHaveText(/gpio_state/, { timeout: 10000 });
    await expect(status).toHaveAttribute('data-count', '1');

    // 到達条件その2: その 1 クリックだけで先輩の図が横に出る
    // (🧰 ツール → 一覧 → 他の保存フォルダを覗く、を通らない)。
    await status.click();
    await page.waitForSelector('#senior-pane:not([hidden])');
    await expect(page.locator('#senior-notice')).toContainText('gpio_state');
    await expect(page.locator('#senior-dsl')).not.toHaveText('');
    await expect(status).toHaveAttribute('aria-pressed', 'true');

    // 到達条件その3: 図を切り替えれば下端の相手も入れ替わる
    // (閉じていても、次に押したときに出る図が下端で分かる)。
    await status.click();
    await expect(page.locator('#senior-pane')).toHaveAttribute('hidden', '');
    await openMine(page, 'gpio_init_sequence');
    await expect(status).toHaveText(/gpio_init_sequence/, { timeout: 10000 });
  });

  // BLK-junior-20260914-2206-wish: 手順1 で先輩の粒度に合わせたいのはクラス図も同じだが、
  // 先輩のクラス図は全ドライバ共通の 1 枚 (driver_common_class) で、部品名で 1:1 に
  // 引けないため「👀 先輩」は常に「−」だった。共通図から自分の部品の所だけを抜き出す。
  test('先輩の共通クラス図から、自分の部品の所だけが横に出る', async ({ page }) => {
    await page.evaluate(async (a) => {
      await fetch('/autosave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'driver_common_class', dir: a.dir, dsl: a.dsl }),
      });
    }, { dir: SENIOR_DIR, dsl: COMMON_CLASS });
    await page.waitForTimeout(300);

    await openMine(page, 'TimerDrv派生クラス図');
    await openSenior(page);

    // 到達条件その1: 「−」ではなく、共通図のどの部分が出るかが読める。
    await expect(page.locator('#senior-notice')).toContainText('driver_common_class');
    await expect(page.locator('#senior-notice')).toContainText('timer');

    // 到達条件その2: 自分の部品と、その継承元・繋がる相手だけが出ている。
    const dsl = page.locator('#senior-dsl');
    await expect(dsl).toContainText('Timer_Driver');
    await expect(dsl).toContainText('Driver_Common');
    await expect(dsl).not.toContainText('Spi_Driver');
    await expect(dsl).not.toContainText('Uart_Driver');
    // 先輩のメソッドはそのまま残る (粒度・命名を合わせるのが手順1 の的)。
    await expect(dsl).toContainText('Timer_Start');

    // 到達条件その3: 部品名を打ち替えれば、その部品の所が浮かぶ。
    await page.fill('#senior-slice-key', 'spi');
    await page.waitForTimeout(800);
    await expect(dsl).toContainText('Spi_Driver');
    await expect(dsl).not.toContainText('Timer_Driver');

    // 到達条件その4: 共通図の全体にも戻せる (抜き出しで隠れた所を確かめられる)。
    await page.locator('#senior-slice-mode').click();
    await page.waitForTimeout(800);
    await expect(dsl).toContainText('Timer_Driver');
    await expect(dsl).toContainText('Uart_Driver');

    // 先輩のファイルは読むだけ (抜き出しても元は変わらない)。
    const raw = await page.evaluate(async (a) => {
      const r = await fetch('/autosave?dir=' + encodeURIComponent(a.dir)
        + '&type=' + encodeURIComponent('driver_common_class'));
      return await r.text();
    }, { dir: SENIOR_DIR });
    expect(raw).toContain('Uart_Driver');
  });
});


// BLK-junior-20260915-0007-wish: 先輩 (primary) が 1 枚も持たない図種がある
// (アクティビティ図)。先輩の枠は 4 段のどれにも当たらず「当たる先輩の図は
// ありません」で止まり、手順 1 の「粒度と命名の手本を見る」相手が絶えていた。
// junior 自身は GPIO/UART/CAN で同じ図種を作り終えているので、その 1 枚を
// 見本として代わりに横に出す。
test.describe('junior 手順 1: 先輩が持たない図種では自分の他部品を見本にする', () => {
  // 自分の保存フォルダ。他部品の完成形 (GPIO/CAN のアクティビティ図) が並ぶ。
  const MINE_ACT = 'TIMERドライバ初期化アクティビティ図';
  const PEERS = ['GPIOドライバ初期化アクティビティ図', 'CANドライバ初期化アクティビティ図'];
  // 写し (資料用) は見本に出さない。同じ図が 2 枚並ぶだけになる。
  const COPY = 'GPIOドライバ初期化アクティビティ図(資料用)';

  test.beforeEach(async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await clearSenior(page);
    // 先輩はシーケンスと状態遷移しか持たない (アクティビティ図が無い)。
    await putIn(page, SENIOR_DIR, 'gpio_init_sequence');
    await putIn(page, SENIOR_DIR, 'gpio_state');
    for (const n of PEERS) await putIn(page, DIR, n);
    await putIn(page, DIR, COPY);
    // 自分のフォルダの並びは開いた時点の物を使うので、置いてから開き直す。
    await page.reload();
    await page.waitForTimeout(600);
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
    await clearSenior(page).catch(() => {});
  });

  // 先輩の枠を開いて先輩フォルダを選ぶ (上の describe と同じ手順)。
  async function pickSeniorValue(page) {
    return page.evaluate((base) => {
      const sel = document.getElementById('senior-dir');
      const hit = Array.prototype.slice.call(sel.options).filter(function(o) {
        var v = o.value.toLowerCase().split(String.fromCharCode(92)).join('/');
        return v.indexOf(base) >= 0;
      })[0];
      return hit ? hit.value : '';
    }, SENIOR_BASE);
  }

  async function openSenior(page) {
    await page.locator('#btn-tab-senior').click();
    await page.waitForSelector('#senior-pane:not([hidden])');
    await page.waitForFunction((base) => {
      const sel = document.getElementById('senior-dir');
      return !!sel && Array.prototype.slice.call(sel.options).some(function(o) {
        return o.value.toLowerCase().split(String.fromCharCode(92)).join('/').indexOf(base) >= 0;
      });
    }, SENIOR_BASE);
    await page.selectOption('#senior-dir', await pickSeniorValue(page));
    await page.waitForTimeout(800);
  }

  test('先輩にその図種が無ければ、自分の他部品の同じ図種が見本として横に出る', async ({ page }) => {
    await openMine(page, MINE_ACT);
    await openSenior(page);
    await page.waitForTimeout(600);

    const notice = page.locator('#senior-notice');
    // 先輩がいないことを隠さない (横の図を先輩の図と読み違えない)。
    await expect(notice).toContainText('当たる先輩の図はありません');
    await expect(notice).toContainText('見本');
    await expect(notice).toContainText('読むだけ');
    // 出るのは自分の他部品 (TIMER ではない) の同じ図種。
    // 前半には自分の図の名前が出る (先輩がいない理由) ので、後半だけを見る。
    const shown = (await notice.textContent()).split('代わりに自分の')[1] || '';
    expect(shown).toContain('ドライバ初期化アクティビティ図');
    expect(shown).not.toContain('TIMER');
    // 本文が空のまま「見本」と言わない (読める中身が横に出ている)。
    await expect(page.locator('#senior-dsl')).not.toHaveText('');
    await expect(page.locator('#senior-dsl')).toContainText('@startuml');
  });

  test('写し (資料用) は見本にしない。部品ごとに 1 枚だけ候補に並ぶ', async ({ page }) => {
    await openMine(page, MINE_ACT);
    await openSenior(page);
    await page.waitForTimeout(600);

    const names = await page.evaluate(() => {
      return Array.prototype.slice.call(document.querySelectorAll('#senior-candidates button'))
        .map((b) => b.textContent);
    });
    expect(names.length).toBe(2);           // GPIO と CAN の 2 部品
    expect(names.join('|')).not.toContain('資料用');
  });

  test('下端の「👀」は、開く前から見本が出ることを言う', async ({ page }) => {
    await openMine(page, MINE_ACT);
    await openSenior(page);
    await page.waitForTimeout(600);
    await expect(page.locator('#status-senior')).toContainText('見本');
  });

  test('見本では、共通図用の「部品」欄を出さない (押しても効かない欄になる)', async ({ page }) => {
    await openMine(page, MINE_ACT);
    await openSenior(page);
    await page.waitForTimeout(600);
    await expect(page.locator('#senior-slice')).toBeHidden();
  });

  test('先輩に相手がいる図種では、見本ではなく先輩の図を出す', async ({ page }) => {
    await openMine(page, 'gpio_state');
    await openSenior(page);
    await page.waitForTimeout(600);
    const notice = page.locator('#senior-notice');
    await expect(notice).toContainText('gpio_state');
    await expect(notice).not.toContainText('見本');
  });
});

// ── BLK-junior-20260915-0307-wish ───────────────────────────────────────
// 16 周目の手順 2 は「下書きは汎用ひな形なので、中身を消して先輩の対応図を手本に
// 打ち直す」。SPI を起こすと 6 図種とも決まった汎用 DSL で埋まるが、先輩 (primary) は
// SPI のシーケンス図を既に持っていて、参加者も並びも汎用ひな形とは違う。
// 手本のある図種は、開いた時点で先輩の実図が入っていることを到達条件にする
// (手順 2 が「打ち直す」から「差分だけ直す」に変わる)。
const REF_ROOT = DIR + '-ref';
const REF_MINE = REF_ROOT + '/junior';
const REF_SENIOR = REF_ROOT + '/primary';

const SENIOR_SPI_SEQ = ['@startuml', 'title SPIREF ドライバ 初期化シーケンス',
  'participant "SPIREF_Driver" as Spi', 'participant "ClockCtrl" as Clk',
  'participant "IRQCtrl" as Irq',
  'Spi -> Clk : EnableClock()', 'Clk --> Spi : Ack',
  'Spi -> Irq : Register()', 'Irq --> Spi : Ack', '@enduml'].join('\n');

test.describe('junior 手順 2: 先輩の実図を手本に新部品を起こす', () => {
  test.beforeEach(async ({ page }) => {
    await S1.bootWithSaveDir(page, REF_MINE);
    await S1.clearDir(page, REF_MINE);
    await S1.clearDir(page, REF_SENIOR);
    await S1.putDoc(page, REF_SENIOR, 'spiref_init_sequence', SENIOR_SPI_SEQ);
    await page.reload();
    await page.waitForSelector('#btn-tab-part');
  });

  test.afterEach(async ({ page }) => {
    await S1.clearDir(page, REF_MINE).catch(() => {});
    await S1.clearDir(page, REF_SENIOR).catch(() => {});
  });

  test('先輩に同じ部品名の実図がある図種は、下書きがその実図で開く', async ({ page }) => {
    await page.locator('#btn-tab-part').click();
    await page.waitForSelector('#part-subject');
    await page.fill('#part-subject', 'SPIREF');

    // 到達条件 1: 押す前に「どの図種が先輩の実図で、どれがひな形か」が読める。
    const srcSeq = page.locator('#part-sheets [data-part-src="sequence"]');
    await expect(srcSeq).toContainText('primary / spiref_init_sequence');
    await expect(page.locator('#part-summary')).toContainText('1 図種は先輩の実図を写します');
    await expect(page.locator('#part-sheets [data-part-src="state"]')).toHaveText('');

    // 到達条件 2: 開いた下書きの中身が先輩の実図そのもの (打ち直しが要らない)。
    await page.locator('#btn-part-create').click();
    await page.waitForTimeout(900);
    const opened = await page.evaluate(() => window.MA.workspace.list()
      .map((d) => ({ name: d.name, dsl: d.dsl })));
    const seq = opened.find((d) => d.name === 'spiref_sequence');
    expect(seq).toBeTruthy();
    expect(seq.dsl).toContain('ClockCtrl');
    expect(seq.dsl).toContain('IRQCtrl');
    expect(seq.dsl).toContain('Ack');
    // 汎用ひな形の並びは入っていない (消してから打ち直す工程が消える)。
    expect(seq.dsl).not.toContain('SPIREF_IrqNotify');

    // 到達条件 3: 手本の無い図種は今までどおりひな形で開く (欠けない)。
    const state = opened.find((d) => d.name === 'spiref_state');
    expect(state).toBeTruthy();
    expect(state.dsl).toContain('SPIREF_Init');

    // 名前は自分の名前のまま。先輩のファイル名にはならない。
    expect(opened.some((d) => d.name === 'spiref_init_sequence')).toBe(false);
  });
});

// BLK-junior-20260916-0546 (friction): 手順 1 で先輩の driver_common_class を
// 📂 一覧で探したが出てこない。一覧は保存先フォルダだけを見せるので「無い」としか
// 読めず、見るには「保存先」チップから保存先ごと先輩のフォルダに切り替えるしかない。
// だが保存先を動かすと次の「保存」が先輩のフォルダに書き込まれるので、上書き事故を
// 恐れて見るのを諦めていた。到達条件は「保存先を動かさずに、探しているその場から
// 先輩の 1 枚に届く」こと。
const PEEK_ROOT = DIR + '-peekentry';
const PEEK_MINE = PEEK_ROOT + '/junior';
const PEEK_SENIOR = PEEK_ROOT + '/primary';

const PE_MINE_CLASS = ['@startuml', 'class TimerDrv', '@enduml'].join('\n');
const PE_SENIOR_CLASS = [
  '@startuml', 'class Driver_Common', 'class Timer_Driver',
  'Timer_Driver --|> Driver_Common', '@enduml',
].join('\n');

test.describe('junior 手順 1: 保存先を動かさずに先輩の図を読むだけで開く', () => {
  test.beforeEach(async ({ page }) => {
    await S1.bootWithSaveDir(page, PEEK_MINE);
    await S1.clearDir(page, PEEK_MINE);
    await S1.clearDir(page, PEEK_SENIOR);
    await S1.putDoc(page, PEEK_MINE, 'TimerDrv派生クラス図', PE_MINE_CLASS);
    await S1.putDoc(page, PEEK_SENIOR, 'driver_common_class', PE_SENIOR_CLASS);
    await page.reload();
    await page.waitForSelector('#btn-tab-folder');
  });

  test('一覧で見つからないとき、その場が「読むだけの入口」を名指しする', async ({ page }) => {
    await page.locator('#btn-tab-folder').click();
    await page.waitForSelector('#folder-filter');
    // 一覧は開いた後に描き直して絞り込みを白紙に戻すので、行が出揃うのを待つ。
    await page.waitForSelector('#folder-panel [data-file-name]');
    await page.waitForTimeout(800);

    // 何も打っていないうちから、この一覧が何を見せているかが読める。
    await expect(page.locator('#folder-peek-hint')).toContainText('保存先フォルダだけ');
    await expect(page.locator('#folder-peek-open')).toBeVisible();

    await page.locator('#folder-filter').fill('driver_common');
    await page.waitForTimeout(300);
    // 到達条件その1: 「無い」で終わらせず、保存先を動かさずに探せると言う。
    await expect(page.locator('#folder-filter-state')).toContainText('当たる図はありません');
    await expect(page.locator('#folder-peek-hint')).toContainText('driver_common');
    await expect(page.locator('#folder-peek-hint')).toContainText('保存先は変わりません');
    await expect(page.locator('#folder-peek-open')).toHaveClass(/urged/);
  });

  test('打った名前を持ち越して先輩の 1 枚が開く。保存先は動かない', async ({ page }) => {
    const targetBefore = await page.locator('#top-save-target').innerText();

    await page.locator('#btn-tab-folder').click();
    await page.waitForSelector('#folder-filter');
    // 一覧は開いた後に描き直して絞り込みを白紙に戻すので、行が出揃うのを待つ。
    await page.waitForSelector('#folder-panel [data-file-name]');
    await page.waitForTimeout(800);
    await page.locator('#folder-filter').fill('driver_common');
    await page.waitForTimeout(300);
    await page.locator('#folder-peek-open').click();
    await page.waitForSelector('#peek-modal');
    await page.waitForTimeout(800);

    // 到達条件その2: 向こうで打ち直さない。持ち越した名前で絞れていると言う。
    await expect(page.locator('#peek-query-text')).toContainText('driver_common');
    await expect(page.locator('#peek-files .peek-file')).toHaveCount(1);

    await page.locator('#peek-files .peek-file[data-file-name="driver_common_class"]').click();
    await page.waitForTimeout(1200);
    await expect(page.locator('#peek-title')).toContainText('driver_common_class');

    // 到達条件その3: 保存先チップは 1 文字も動かない (これを恐れて諦めた手順)。
    expect(await page.locator('#top-save-target').innerText()).toBe(targetBefore);
    const dir = await page.evaluate(() => {
      const cfg = JSON.parse(window.localStorage.getItem('plantuml-autosave-config') || '{}');
      return cfg.fileDir;
    });
    expect(dir).toBe(PEEK_MINE);

    // 絞り込みは外せる (先輩のフォルダの全枚も見られる)。
    await page.locator('#peek-query-clear').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#peek-query')).toHaveCount(0);
  });

  test('探し始めから先輩の図が出るまで、クリック 10 以下・キー入力 50 以下', async ({ page }) => {
    let clicks = 0;
    let keys = 0;
    const click = async (sel) => { clicks++; await page.locator(sel).click(); };
    const type = async (sel, text) => { keys += text.length; await page.locator(sel).fill(text); };

    await click('#btn-tab-folder');
    await page.waitForSelector('#folder-filter');
    // 一覧は開いた後に描き直して絞り込みを白紙に戻すので、行が出揃うのを待つ。
    await page.waitForSelector('#folder-panel [data-file-name]');
    await page.waitForTimeout(800);
    await type('#folder-filter', 'driver_common');
    await page.waitForTimeout(300);
    await click('#folder-peek-open');
    await page.waitForSelector('#peek-modal');
    await page.waitForTimeout(800);
    await click('#peek-files .peek-file[data-file-name="driver_common_class"]');
    await page.waitForTimeout(1200);

    await expect(page.locator('#peek-title')).toContainText('driver_common_class');
    expect(clicks).toBeLessThanOrEqual(10);
    expect(keys).toBeLessThanOrEqual(50);
    // 実測: クリック 3 / キー入力 13。
    expect(clicks).toBe(3);
    expect(keys).toBe(13);
  });
});

// BLK-junior-20260916-2314: 📂 一覧の絞り込みは部分一致なので、フルネームを打っても同じ接頭辞の
// 「…(資料用)」が一緒に残り、並び次第で資料用を開いてしまう。到達条件は「フルネームを打つと
// 本体が完全一致の印付きで先頭に出て、そのまま押せば本体が開く」こと。
const EXACT_DIR = PEEK_ROOT + '/exact';
const EXACT_BODY = 'TIMERドライバ初期化アクティビティ図';
const EXACT_DOC = EXACT_BODY + '(資料用)';

test.describe('junior 手順 1: フルネームで絞ると本体が資料用より先に出る', () => {
  test.beforeEach(async ({ page }) => {
    await S1.bootWithSaveDir(page, EXACT_DIR);
    await S1.clearDir(page, EXACT_DIR);
    // 資料用を先に置く (名前順・更新順のどちらでも資料用が上に来うる状態)。
    await S1.putDoc(page, EXACT_DIR, EXACT_DOC, '@startuml\nstart\n:資料用;\nstop\n@enduml');
    await S1.putDoc(page, EXACT_DIR, EXACT_BODY, '@startuml\nstart\n:本体;\nstop\n@enduml');
    await page.reload();
    await page.waitForSelector('#btn-tab-folder');
  });

  test('フルネームを打つと完全一致の本体が先頭に印付きで出て、押すと本体が開く (クリック 10 以下・キー入力 50 以下)', async ({ page }) => {
    let clicks = 0;
    let keys = 0;
    await page.locator('#btn-tab-folder').click(); clicks++;
    await page.waitForSelector('#folder-filter');
    await page.waitForSelector('#folder-panel [data-file-name]');
    await page.waitForTimeout(800);
    await page.locator('#folder-filter').fill(EXACT_BODY); keys += EXACT_BODY.length;
    await page.waitForTimeout(300);

    // 2 枚とも残る (部分一致の行は消さない) が、見えている先頭の行が本体で、完全一致の印が付く。
    const visible = await page.evaluate(() => Array.prototype.filter.call(
      document.querySelectorAll('#folder-panel .folder-item[data-file-name]'),
      (b) => b.offsetParent !== null
    ).map((b) => b.getAttribute('data-file-name')));
    expect(visible.length).toBe(2);
    expect(visible[0].replace(/\.puml$/, '')).toBe(EXACT_BODY);
    expect(visible[1].replace(/\.puml$/, '')).toBe(EXACT_DOC);
    await expect(page.locator('#folder-panel [data-exact="1"]')).toHaveCount(1);

    // 先頭の行を押すと本体が開く。
    await page.locator('#folder-panel [data-exact="1"] .folder-item, #folder-panel .folder-item[data-exact="1"]').first().click(); clicks++;
    await expect.poll(() => getEditorText(page)).toContain(':本体;');
    expect(clicks).toBeLessThanOrEqual(10);
    expect(keys).toBeLessThanOrEqual(50);

    // 絞り込みを外すと、元の並びに戻る (完全一致の印も消える)。
    await page.locator('#btn-tab-folder').click();
    await page.waitForSelector('#folder-filter');
    await page.locator('#folder-filter').fill('');
    await page.waitForTimeout(300);
    await expect(page.locator('#folder-panel [data-exact="1"]')).toHaveCount(0);
  });
});
