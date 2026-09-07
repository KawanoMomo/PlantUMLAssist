// @ts-check
const { test, expect } = require('@playwright/test');
const { getEditorText } = require('./helpers');

// BLK-junior-20260907-0803 (friction):
//   ・枝ごとに 3 欄をクリックして回るのをやめ、1 行 1 枝でまとめて打てるようにする
//   ・分岐の置き換え元 (同じ遷移元・同じトリガーの直接遷移) を残さない
async function openStateDiagram(page) {
  await page.goto('/');
  await page.waitForSelector('#preview-svg', { timeout: 5000 });
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(500);
}

async function setDsl(page, dsl) {
  await page.evaluate((t) => {
    var ed = document.getElementById('editor');
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, dsl);
  await page.waitForTimeout(500);
}

async function selectState(page, id) {
  // overlay クリックは描画待ちになるので、選択そのものを API から立てる
  // (実機ではここが図形クリック 1 回にあたる)。
  await page.evaluate((sid) => {
    window.MA.selection.setSelected([{ type: 'state', id: sid }]);
  }, id);
  await page.waitForTimeout(300);
}

// state を明示宣言する (遷移だけで書くと states が空になり、
// 図形を選んでも state の Properties が出ないため)。
const UART = [
  '@startuml',
  'state Idle',
  'state Busy',
  'state Error',
  '[*] --> Idle',
  'Idle --> Busy : Start',
  'Busy --> Error : Fault',
  'Busy --> Idle : Done',
  '@enduml',
].join('\n');

test.describe('BLK-junior-0803: 分岐の枝を 1 行 1 枝で入れる', () => {
  test('一括入力欄に打つと枝の行がその場で並び、確定で分岐一式が入る', async ({ page }) => {
    await openStateDiagram(page);
    await page.locator('#st-branch-open').click();
    await expect(page.locator('#st-br-modal')).toBeVisible();
    await page.locator('#st-br-id').fill('AnomalyCheck');
    await page.locator('#st-br-bulk').fill('重大 -> Error / notify\n軽微 -> Idle\n-> Retry');
    await page.waitForTimeout(200);

    await expect(page.locator('#st-br-rows .st-br-row')).toHaveCount(3);
    const preview = await page.locator('#st-br-preview').textContent();
    expect(preview).toContain('AnomalyCheck --> Error : [重大] / notify');
    expect(preview).toContain('AnomalyCheck --> Idle : [軽微]');
    expect(preview).toContain('AnomalyCheck --> Retry');

    await page.locator('#st-br-confirm').click();
    await page.waitForTimeout(300);
    const t = await getEditorText(page);
    expect(t).toContain('state AnomalyCheck <<choice>>');
    expect(t).toContain('AnomalyCheck --> Error : [重大] / notify');
    expect(t).toContain('AnomalyCheck --> Retry');
  });

  test('下の枝の欄を触ると一括入力欄が追随する', async ({ page }) => {
    await openStateDiagram(page);
    await page.locator('#st-branch-open').click();
    await page.locator('#st-br-id').fill('C1');
    await page.locator('#st-br-guard-0').fill('重大');
    await page.locator('#st-br-to-0').fill('Error');
    await page.waitForTimeout(200);
    expect(await page.locator('#st-br-bulk').inputValue()).toContain('重大 -> Error');
  });

  test('確定すると置き換え元の直接遷移が消え、経路が二重にならない', async ({ page }) => {
    await openStateDiagram(page);
    await setDsl(page, UART);
    await selectState(page, 'Busy');
    await page.locator('#st-add-branch').click();
    await page.locator('#st-br-id').fill('AnomalyCheck');
    await page.locator('#st-br-trigger').fill('Fault');
    await page.locator('#st-br-bulk').fill('重大 -> Error\n軽微 -> Idle');
    await page.waitForTimeout(200);

    // 黙って消さず、消える行を先に見せる
    await expect(page.locator('#st-br-replaced')).toContainText('Busy --> Error : Fault');

    await page.locator('#st-br-confirm').click();
    await page.waitForTimeout(300);
    const t = await getEditorText(page);
    expect(t).not.toContain('Busy --> Error : Fault');
    expect(t).toContain('Busy --> AnomalyCheck : Fault');
    expect(t).toContain('AnomalyCheck --> Error : [重大]');
    // 別のトリガーの遷移は残る
    expect(t).toContain('Busy --> Idle : Done');
  });

  test('遷移元を選んでいなければ何も消さない', async ({ page }) => {
    await openStateDiagram(page);
    await setDsl(page, UART);
    await page.locator('#st-branch-open').click();
    await page.locator('#st-br-id').fill('C2');
    await page.locator('#st-br-bulk').fill('重大 -> Error\n軽微 -> Idle');
    await page.waitForTimeout(200);
    await expect(page.locator('#st-br-replaced')).toHaveText('');
    await page.locator('#st-br-confirm').click();
    await page.waitForTimeout(300);
    expect(await getEditorText(page)).toContain('Busy --> Error : Fault');
  });

  test('効果測定: 分岐 (choice) 追加が クリック 10 以下 / キー 50 以下 で終わる', async ({ page }) => {
    await openStateDiagram(page);
    await setDsl(page, UART);
    await page.evaluate(() => {
      window.__m = { clicks: 0, keys: 0 };
      document.addEventListener('click', function() { window.__m.clicks++; }, true);
      document.addEventListener('keydown', function() { window.__m.keys++; }, true);
    });

    // 起票された手順そのまま: Busy の Fault で「重大 / 軽微」に分ける。
    // 図形の選択 (実機では図をクリック 1 回) は描画待ちを避けて API から立て、
    // その 1 回を見込んで上限を 9 で測る。
    await selectState(page, 'Busy');
    await page.locator('#st-add-branch').click();
    await page.locator('#st-br-id').click();
    await page.keyboard.type('AnomalyCheck');
    await page.locator('#st-br-trigger').click();
    await page.keyboard.type('Fault');
    await page.locator('#st-br-bulk').click();
    await page.keyboard.type('重大 -> Error\n軽微 -> Idle');
    await page.waitForTimeout(200);
    await page.locator('#st-br-confirm').click();
    await page.waitForTimeout(300);

    const t = await getEditorText(page);
    expect(t).toContain('state AnomalyCheck <<choice>>');
    expect(t).toContain('Busy --> AnomalyCheck : Fault');
    expect(t).not.toContain('Busy --> Error : Fault');

    const m = await page.evaluate(() => window.__m);
    console.log('BLK-junior-0803 実測: クリック ' + m.clicks + ' / キー ' + m.keys);
    expect(m.clicks).toBeLessThanOrEqual(9);   // + 図形の選択 1 回 = 10 以下
    expect(m.keys).toBeLessThanOrEqual(50);
  });
});
