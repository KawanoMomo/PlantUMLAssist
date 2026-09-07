// @ts-check
// BLK-reviewer-20260907-2003-wish: シーケンス図が「どの状態遷移を担当するか」を
// 図の中に宣言する。宣言のある系統では、宣言外の遷移は突き合わせの対象外になり、
// 「初期化専用シーケンス vs フル状態遷移」の粒度差を語彙一致率で推測しなくてよくなる。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const GPIO_STATE = '@startuml\n[*] --> Idle\nIdle --> Configured : Gpio_Init\n'
  + 'Configured --> Sampling : StartConv\nSampling --> Configured : Complete\n'
  + 'Configured --> Idle : Gpio_Reset\n@enduml';
const GPIO_SEQ = '@startuml\nparticipant App\nparticipant Gpio\n'
  + 'App -> Gpio : Gpio_Init\n@enduml';

async function freshWorkspace(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'localStorage', fileDir: './autosave' }));
    } catch (e) {}
  });
}

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(150);
}

async function renameActive(page, name) {
  await page.evaluate((n) => {
    const ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), n);
  }, name);
}

async function setupDocs(page) {
  await gotoApp(page);
  await typeDsl(page, GPIO_STATE);
  await renameActive(page, 'gpio_state');
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, GPIO_SEQ);
  await renameActive(page, 'gpio_init_sequence');
  await expect(page.locator('#tab-bar .tab')).toHaveCount(2);
}

async function openTrace(page) {
  await page.locator('#btn-tab-trace').click();
  await expect(page.locator('#tc-modal')).toBeVisible();
}

test.describe('BLK-reviewer-2003-wish シーケンス図の担当範囲を宣言する', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  // BLK-reviewer-20260907-2003 で、宣言が無い系統にも粒度差の除外を入れた。
  // 宣言前の期待は「初期化後の遷移が全部漏れ」から「粒度違いとして見ていない」に
  // 変わる (宣言はその推測を意図で置き換えるものなので、宣言後の振る舞いは変えていない)。
  test('宣言前は初期化専用シーケンスとの粒度差として外れる', async ({ page }) => {
    await setupDocs(page);
    await openTrace(page);
    await expect(page.locator('#tc-summary')).toHaveAttribute('data-missing', '0');
    await expect(page.locator('#tc-summary')).toContainText('粒度が違うため突き合わせていません');
    await expect(page.locator('#tc-table .tc-missing')).toHaveCount(0);
    // 外した遷移は宣言欄に並ぶので、その場で意図を書ける
    await expect(page.locator('.tc-scope-cb')).toHaveCount(4);
  });

  test('担当する遷移をチェックして保存すると、宣言外は突き合わせなくなる', async ({ page }) => {
    await setupDocs(page);
    await openTrace(page);
    await page.locator('.tc-scope-cb[data-from="Idle"][data-to="Configured"]').check();
    await page.locator('#tc-scope-save').click();

    await expect(page.locator('#tc-summary')).toHaveAttribute('data-missing', '0');
    await expect(page.locator('#tc-summary')).toContainText('宣言対象外 3 件は見ていません');
    await expect(page.locator('#tc-scope-note')).toContainText('gpio_init_sequence');
    await expect(page.locator('#tc-scope-out')).toContainText('Configured → Sampling');
    // 宣言は図の中 (PlantUML のコメント) に残る = 保存すれば一緒に持ち回れる。
    const dsl = await page.evaluate(() => {
      const ws = window.MA.workspace;
      const d = ws.list().filter((x) => x.name === 'gpio_init_sequence')[0];
      return d.dsl;
    });
    expect(dsl).toContain("' @covers Idle -> Configured");
  });

  test('宣言しても、宣言した遷移の書き漏らしは漏れとして出続ける', async ({ page }) => {
    await setupDocs(page);
    await openTrace(page);
    await page.locator('.tc-scope-cb[data-from="Configured"][data-to="Idle"]').check();
    await page.locator('#tc-scope-save').click();
    await expect(page.locator('#tc-summary')).toHaveAttribute('data-missing', '1');
    await expect(page.locator('#tc-table .tc-missing')).toContainText('Gpio_Reset');
  });

  test('「宣言を消す」で全遷移を突き合わせる状態に戻せる', async ({ page }) => {
    await setupDocs(page);
    await openTrace(page);
    await page.locator('#tc-scope-all').click();
    await expect(page.locator('#tc-summary')).toHaveAttribute('data-missing', '3');
    await expect(page.locator('#tc-scope-note')).toContainText('宣言あり');
    await page.locator('#tc-scope-clear').click();
    await expect(page.locator('#tc-scope-note')).toContainText('宣言なし');
    // 宣言を消すと推測に戻る。この系統は初期化専用シーケンスしか無いので
    // 粒度差として外れる (BLK-reviewer-20260907-2003)。
    await expect(page.locator('#tc-summary')).toHaveAttribute('data-missing', '0');
    await expect(page.locator('#tc-summary')).toContainText('粒度が違うため');
  });

  test('宣言はチェックの状態として開き直しても残る', async ({ page }) => {
    await setupDocs(page);
    await openTrace(page);
    await page.locator('.tc-scope-cb[data-from="Idle"][data-to="Configured"]').check();
    await page.locator('#tc-scope-save').click();
    await page.locator('#tc-close').click();
    await openTrace(page);
    await expect(page.locator('#tc-scope-list')).toHaveAttribute('data-count', '1');
    await expect(page.locator('.tc-scope-cb[data-from="Idle"][data-to="Configured"]')).toBeChecked();
    await expect(page.locator('.tc-scope-cb[data-from="Configured"][data-to="Sampling"]')).not.toBeChecked();
    await expect(page.locator('#tc-scope-doc option').first()).toContainText('(宣言あり)');
  });
});
