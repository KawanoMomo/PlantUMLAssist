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
