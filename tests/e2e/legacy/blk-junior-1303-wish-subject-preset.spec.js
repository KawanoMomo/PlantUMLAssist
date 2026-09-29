// @ts-check
// BLK-junior-20260907-1303-wish: 題材プリセット。
// 周回のたびに「先輩の図を開く → セットを選ぶ → 置換元と置換先を打つ」を繰り返していた
// 手順が、1 度登録すれば「プリセットを選ぶ → 題材名を打つ → 生成」で済むことを実機で見る。
// 4 周目 (I2C) は元の図がタブに 1 枚も無い状態から始められることが肝。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

// この spec の自動保存先を専用フォルダにする。既定のままだと成果物リポジトリ直下の
// autosave/ を他の spec と共有し、先に走った spec が残した図が reload のときに
// 復元されて「1 枚多い」状態から始まる (BLK-builder-20260908-1123-4 で発覚)。
const DIR = saveDirFor(__filename);

test.beforeEach(async ({ page }) => {
  await page.addInitScript((d) => {
    try {
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
  await page.request.delete('/autosave?dir=' + encodeURIComponent(DIR)).catch(() => {});
});


const SET = [
  {
    name: 'Gpio-sequence', type: 'plantuml-sequence', dsl: [
      '@startuml', 'title Gpio 初期化', 'actor App', 'participant GpioDrv', 'participant GpioHal',
      'App -> GpioDrv : Gpio_Init()', 'GpioDrv -> GpioHal : Gpio_HalInit()', '@enduml',
    ].join('\n'),
  },
  {
    name: 'Gpio-state', type: 'plantuml-state', dsl: [
      '@startuml', 'title Gpio 状態遷移', '[*] --> Gpio_Idle',
      'Gpio_Idle --> Gpio_Busy : Gpio_Start', 'Gpio_Busy --> Gpio_Idle : Gpio_Done', '@enduml',
    ].join('\n'),
  },
  {
    name: 'Gpio-class', type: 'plantuml-class', dsl: [
      '@startuml', 'title Gpio クラス構成', 'class GpioDriver {', '  +Gpio_Init()', '}',
      'class GpioHal {', '  +Gpio_HalInit()', '}', 'GpioDriver --> GpioHal', '@enduml',
    ].join('\n'),
  },
];

async function seedSet(page) {
  await gotoApp(page);
  await page.evaluate((set) => {
    window.localStorage.removeItem('ma.subjectPresets');
    window.MA.workspace.reset();
    set.forEach((d) => window.MA.workspace.open({ name: d.name, dsl: d.dsl, diagramType: d.type }));
  }, SET);
  await page.reload();
  await page.waitForSelector('#preview-svg');
  await page.waitForTimeout(1500);
}

async function openSetModal(page) {
  // BLK-owner-20260924-2337-prune: 入口は「既存の図や雛形から新しい図を起こす…」1 つ。窓の上端で「同じ系統の図ぜんぶ」を選ぶ。
  await page.locator('#btn-tab-template').click();
  await page.locator('#tpl-kinds .tpl-kind[data-kind="family"]').click();
  await page.waitForTimeout(700);
}

// 先輩の図から 1 度だけプリセットを登録する (これが「登録の周」)。
async function registerPreset(page, name = 'ドライバ一式') {
  page.once('dialog', (d) => d.accept(name));
  await page.locator('#btn-fc-save-preset').click();
  await page.waitForTimeout(600);
}

test.describe('BLK-junior-20260907-1303-wish: 題材プリセット', () => {

  test('プリセットが無いうちは、登録の仕方が画面に出ている', async ({ page }) => {
    await seedSet(page);
    await openSetModal(page);
    await expect(page.locator('#sp-empty')).toContainText('まだプリセットがありません');
    await expect(page.locator('#btn-fc-save-preset')).toBeVisible();
  });

  test('セットを 1 度登録すると、枚数と置換元付きで選べるようになる', async ({ page }) => {
    await seedSet(page);
    await openSetModal(page);
    await registerPreset(page);
    await expect(page.locator('#sp-preset')).toContainText('ドライバ一式');
    await expect(page.locator('#sp-preset')).toContainText('3 枚');
    await expect(page.locator('#sp-preset')).toContainText('置換元: Gpio');
  });

  test('題材名を打つだけで、作られる 3 枚の名前が出る', async ({ page }) => {
    await seedSet(page);
    await openSetModal(page);
    await registerPreset(page);
    await page.locator('#sp-subject').fill('Uart');
    await page.waitForTimeout(500);
    await expect(page.locator('#sp-plan')).toHaveAttribute('data-docs', '3');
    await expect(page.locator('#sp-plan')).toContainText('Uart-sequence');
    await expect(page.locator('#sp-summary')).toHaveAttribute('data-ready', '1');
  });

  test('題材名が空のうちは作らせない', async ({ page }) => {
    await seedSet(page);
    await openSetModal(page);
    await registerPreset(page);
    await expect(page.locator('#btn-sp-create')).toBeDisabled();
  });

  test('元の図が 1 枚も無くても、プリセットを選んで題材名を打つだけで一式が揃う', async ({ page }) => {
    await seedSet(page);
    await openSetModal(page);
    await registerPreset(page);
    // 4 周目の始まり。先輩の図も前の題材の図もタブから消す。
    await page.evaluate(() => window.MA.workspace.reset());
    await page.reload();
    await page.waitForSelector('#preview-svg');
    await page.waitForTimeout(1200);
    await openSetModal(page);

    await page.locator('#sp-preset').selectOption('ドライバ一式');
    await page.locator('#sp-subject').fill('I2c');
    await page.waitForTimeout(500);
    await page.locator('#btn-sp-create').click();
    await page.waitForTimeout(2500);

    const made = await page.evaluate(() => window.MA.workspace.list()
      .map((d) => ({ name: d.name, dsl: d.dsl, type: d.diagramType }))
      .filter((d) => d.name.indexOf('I2c') === 0 || d.name.indexOf('I2C') === 0));
    expect(made.length).toBe(3);
    const seq = made.filter((d) => d.name.indexOf('sequence') >= 0)[0];
    expect(seq.dsl).toContain('participant I2cDrv');
    expect(seq.dsl).toContain('I2c_Init()');
    expect(seq.dsl).not.toContain('Gpio');
    expect(seq.type).toBe('plantuml-sequence');
    expect(made.filter((d) => d.type === 'plantuml-state').length).toBe(1);
  });

  test('作った図はそのまま描ける (図種が引き継がれている)', async ({ page }) => {
    await seedSet(page);
    await openSetModal(page);
    await registerPreset(page);
    await page.locator('#sp-subject').fill('Uart');
    await page.waitForTimeout(500);
    await page.locator('#btn-sp-create').click();
    await page.waitForTimeout(3000);
    await expect(page.locator('#render-status')).not.toContainText('ERROR');
    await expect(page.locator('#editor')).toHaveValue(/Uart/);
  });

  test('同じ題材をもう一度打つと、既にあることを名指しで知らせる', async ({ page }) => {
    await seedSet(page);
    await openSetModal(page);
    await registerPreset(page);
    await page.locator('#sp-subject').fill('Gpio');
    await page.waitForTimeout(500);
    await expect(page.locator('#sp-renamed')).toContainText('既にあります');
    await expect(page.locator('#sp-renamed')).toContainText('Gpio-sequence');
  });

  test('プリセットはページを開き直しても残る', async ({ page }) => {
    await seedSet(page);
    await openSetModal(page);
    await registerPreset(page);
    await page.reload();
    await page.waitForSelector('#preview-svg');
    await page.waitForTimeout(1200);
    await openSetModal(page);
    await expect(page.locator('#sp-preset')).toContainText('ドライバ一式');
  });

  test('削除すると選択肢から消える', async ({ page }) => {
    await seedSet(page);
    await openSetModal(page);
    await registerPreset(page);
    page.once('dialog', (d) => d.accept());
    await page.locator('#btn-sp-delete').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#sp-empty')).toContainText('まだプリセットがありません');
  });

  test('登録から生成まで、クリック 10 以下・キー入力 50 以下で済む', async ({ page }) => {
    await seedSet(page);
    // ① セットのモーダルを開く
    await openSetModal(page);
    // ② 登録 (プロンプトで名前。以降の周では不要)
    await registerPreset(page);
    // ここからが 2 周目以降の手順。③ 題材名を打つ ④ 生成を押す
    await page.locator('#sp-subject').fill('Uart');   // キー入力 4
    await page.waitForTimeout(500);
    await page.locator('#btn-sp-create').click();
    await page.waitForTimeout(2500);
    const made = await page.evaluate(() => window.MA.workspace.list()
      .filter((d) => d.name.indexOf('Uart') === 0).length);
    expect(made).toBe(3);
    // クリック: モーダルを開く 1 + 登録 1 + 題材欄 1 + 生成 1 = 4
    // キー入力: プリセット名 6 + 題材名 4 = 10
  });
});
