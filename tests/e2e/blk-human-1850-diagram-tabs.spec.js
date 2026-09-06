// @ts-check
// BLK-human-20260906-1850: 複数の図をタブで開いて行き来する。
// 業務では SPI / CAN のように部品ごとに複数の図を持ち、それらを往復しながら
// 名前を揃える。DSL を消して貼り直さずに切り替えられることを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const SPI_SEQ = '@startuml\nparticipant SpiDrv\nparticipant SpiHw\nSpiDrv -> SpiHw: transfer\n@enduml';
const CAN_SEQ = '@startuml\nparticipant CanDrv\nparticipant CanHw\nCanDrv -> CanHw: send\n@enduml';

async function freshWorkspace(page) {
  await page.addInitScript(() => {
    try {
      // reload をまたぐテストがあるので、初回ロードのときだけ掃除する
      if (!window.sessionStorage.getItem('__tabs_spec_init')) {
        window.sessionStorage.setItem('__tabs_spec_init', '1');
        window.localStorage.clear();
      }
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
  await page.waitForTimeout(200);
}

test.describe('BLK-human-1850 複数の図をタブで扱う', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('タブが1枚で始まり、＋で増える', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('#tab-bar .tab')).toHaveCount(1);
    await page.locator('#btn-tab-new').click();
    await expect(page.locator('#tab-bar .tab')).toHaveCount(2);
    await expect(page.locator('#tab-bar .tab.active')).toHaveCount(1);
  });

  test('別の図に移っても前の図の DSL が残っている', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, SPI_SEQ);
    await page.locator('#btn-tab-new').click();
    await typeDsl(page, CAN_SEQ);
    expect(await getEditorText(page)).toContain('CanDrv');

    // 1枚目へ戻る
    await page.locator('#tab-bar .tab').first().click();
    await page.waitForTimeout(300);
    expect(await getEditorText(page)).toContain('SpiDrv');

    // 2枚目へ戻る
    await page.locator('#tab-bar .tab').nth(1).click();
    await page.waitForTimeout(300);
    expect(await getEditorText(page)).toContain('CanDrv');
  });

  test('タブごとに図の種類を持てる', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, SPI_SEQ);
    await page.locator('#btn-tab-new').click();
    await page.selectOption('#diagram-type', 'plantuml-state');
    await page.waitForTimeout(300);
    expect(await page.locator('#diagram-type').inputValue()).toBe('plantuml-state');

    await page.locator('#tab-bar .tab').first().click();
    await page.waitForTimeout(300);
    expect(await page.locator('#diagram-type').inputValue()).toBe('plantuml-sequence');
    expect(await getEditorText(page)).toContain('SpiDrv');
  });

  test('リロードしてもタブ構成と内容が残る', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, SPI_SEQ);
    await page.locator('#btn-tab-new').click();
    await typeDsl(page, CAN_SEQ);
    await page.waitForTimeout(300);

    await page.reload();
    await page.waitForSelector('#tab-bar .tab');
    await expect(page.locator('#tab-bar .tab')).toHaveCount(2);
    expect(await getEditorText(page)).toContain('CanDrv');
    await page.locator('#tab-bar .tab').first().click();
    await page.waitForTimeout(300);
    expect(await getEditorText(page)).toContain('SpiDrv');
  });

  test('タブを閉じると隣のタブに移る', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, SPI_SEQ);
    await page.locator('#btn-tab-new').click();
    await typeDsl(page, CAN_SEQ);
    await page.locator('#tab-bar .tab').nth(1).locator('.tab-close').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#tab-bar .tab')).toHaveCount(1);
    expect(await getEditorText(page)).toContain('SpiDrv');
  });

});

test.describe('BLK-human-1850 保存フォルダ一覧', () => {
  test('フォルダに保存した図を一覧から新しいタブとして開ける', async ({ page }) => {
    const dir = './autosave-e2e-tabs';
    await page.addInitScript((d) => {
      try {
        window.localStorage.clear();
        window.localStorage.setItem('plantuml-autosave-config',
          JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
      } catch (e) {}
    }, dir);
    await gotoApp(page);
    // サーバの保存フォルダに CAN_state を直接置く
    await page.evaluate(async (d) => {
      await fetch('/autosave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'CAN_state', dir: d, dsl: '@startuml\n[*] --> CanIdle\nCanIdle --> CanBusy\n@enduml' }),
      });
    }, dir);

    await page.locator('#btn-tab-folder').click();
    await page.waitForSelector('#folder-panel.open .folder-item');
    await page.locator('#folder-panel .folder-item[data-file-name="CAN_state"]').click();
    await page.waitForTimeout(500);

    expect(await getEditorText(page)).toContain('CanIdle');
    await expect(page.locator('#tab-bar .tab[data-doc-name="CAN_state"]')).toHaveCount(1);
    expect(await page.locator('#diagram-type').inputValue()).toBe('plantuml-state');
  });
});
