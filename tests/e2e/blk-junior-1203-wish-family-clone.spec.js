// @ts-check
// BLK-junior-20260907-1203-wish: 同じ系統の図を 1 セットとして、対応表 1 回で全部複製する。
// 図種の数だけテンプレート作成を繰り返す進め方が 1 操作で済むことを実機で見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('./helpers');

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

// 先輩が作った系統 3 枚がタブに開いてある状態を作る。
async function seedSet(page) {
  await gotoApp(page);
  await page.evaluate((set) => {
    window.MA.workspace.reset();
    set.forEach((d) => window.MA.workspace.open({ name: d.name, dsl: d.dsl, diagramType: d.type }));
  }, SET);
  await page.reload();
  await page.waitForSelector('#preview-svg');
  await page.waitForTimeout(1500);
}

async function openSetModal(page) {
  await page.locator('#btn-tab-set').click();
  await page.waitForTimeout(600);
}

test.describe('BLK-junior-20260907-1203-wish: セットごとまとめて題材を替える', () => {

  test('系統がセットとして 1 行で選べ、何枚どの図種が入っているかが出る', async ({ page }) => {
    await seedSet(page);
    await openSetModal(page);
    await expect(page.locator('#fc-set')).toContainText('gpio');
    await expect(page.locator('#fc-set')).toContainText('3 枚');
    await expect(page.locator('#fc-members')).toContainText('Gpio-state');
  });

  test('置換元は最初から入っていて、置換先を 1 回打つだけで 3 枚の計画が出る', async ({ page }) => {
    await seedSet(page);
    await openSetModal(page);
    await expect(page.locator('#fc-from')).toHaveValue('Gpio');
    await page.locator('#fc-to').fill('Uart');
    await page.waitForTimeout(400);
    await expect(page.locator('.fc-plan-row')).toHaveCount(3);
    await expect(page.locator('#fc-summary')).toHaveAttribute('data-ready', '1');
    await expect(page.locator('#fc-summary')).toContainText('3 枚を作ります');
  });

  test('1 回押すだけで 3 枚のタブが揃い、中身が題材替えされている', async ({ page }) => {
    await seedSet(page);
    await openSetModal(page);
    await page.locator('#fc-to').fill('Uart');
    await page.waitForTimeout(400);
    await page.locator('#btn-fc-create').click();
    await page.waitForTimeout(2000);
    var made = await page.evaluate(() => window.MA.workspace.list().map((d) => ({
      name: d.name, dsl: d.dsl, type: d.diagramType,
    })).filter((d) => d.name.indexOf('Uart') === 0));
    expect(made.length).toBe(3);
    expect(made.map((d) => d.name).sort()).toEqual(['Uart-class', 'Uart-sequence', 'Uart-state']);
    var seq = made.filter((d) => d.name === 'Uart-sequence')[0];
    expect(seq.dsl).toContain('participant UartDrv');
    expect(seq.dsl).toContain('Uart_Init()');
    expect(seq.dsl).not.toContain('Gpio');
    expect(seq.type).toBe('plantuml-sequence');
    var st = made.filter((d) => d.name === 'Uart-state')[0];
    expect(st.type).toBe('plantuml-state');
  });

  test('複製したタブはそのまま描ける (図種が引き継がれている)', async ({ page }) => {
    await seedSet(page);
    await openSetModal(page);
    await page.locator('#fc-to').fill('Uart');
    await page.waitForTimeout(400);
    await page.locator('#btn-fc-create').click();
    await page.waitForTimeout(3000);
    await expect(page.locator('#render-status')).not.toContainText('ERROR');
    await expect(page.locator('#editor')).toHaveValue(/Uart/);
  });

  test('置換先が空のうちは作らせない', async ({ page }) => {
    await seedSet(page);
    await openSetModal(page);
    await expect(page.locator('#btn-fc-create')).toBeDisabled();
    await expect(page.locator('#fc-summary')).toHaveAttribute('data-ready', '0');
  });

  test('置換で消えない部品名は名指しで出て、その場で対応表に足せる', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => {
      window.MA.workspace.reset();
      window.MA.workspace.open({
        name: 'Gpio-mix', diagramType: 'plantuml-class',
        dsl: ['@startuml', 'class GpioDriver', 'class PortMux', 'GpioDriver --> PortMux', '@enduml'].join('\n'),
      });
    });
    await page.reload();
    await page.waitForSelector('#preview-svg');
    await page.waitForTimeout(1200);
    await openSetModal(page);
    await page.locator('#fc-set').selectOption('gpio');
    await page.waitForTimeout(300);
    await page.locator('#fc-to').fill('Uart');
    await page.waitForTimeout(400);
    await expect(page.locator('#fc-summary')).toContainText('PortMux');
    await page.locator('#fc-extra-0').fill('UartMux');
    await page.waitForTimeout(400);
    await expect(page.locator('#fc-summary')).not.toContainText('PortMux');
    await expect(page.locator('#btn-fc-create')).toBeEnabled();
  });
});
