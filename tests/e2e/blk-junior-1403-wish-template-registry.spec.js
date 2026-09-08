// @ts-check
// BLK-junior-20260908-1403-wish: 雛形は 1 回だけ登録して呼び名で選ぶ。
// 以降は「🧩 相手のフォルダ」に絶対パスを打ち直さず、2 枚目のタブも要らない。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const UART = [
  '@startuml',
  'start',
  ':UARTクロックを有効化;',
  ':UART_Configureを呼ぶ;',
  ':UART割込みを有効化;',
  'stop',
  '@enduml',
].join('\n');

const CAN = UART.split('UART').join('CAN');
const CAN_PLUS = CAN.replace(':CAN割込みを有効化;', ':CAN割込みを有効化;\n:CANビットレートを設定;');

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(1200);
}

async function openCompare(page) {
  await page.locator('#btn-tab-compare').click();
  await expect(page.locator('#compare-pane')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // 登録が「開き直しても残る」ことを見たいので、消すのはタブの 1 回目だけにする
  // (addInitScript は reload のたびに走るため、無条件に消すと登録も消えてしまう)。
  await page.addInitScript(() => {
    try {
      if (!window.sessionStorage.getItem('e2e-cleared')) {
        window.localStorage.clear();
        window.sessionStorage.setItem('e2e-cleared', '1');
      }
    } catch (e) {}
  });
});

test('雛形を 1 回登録すれば、2 枚目のタブなしで呼び名を選んで比べられる', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, UART);
  await openCompare(page);

  await page.locator('#tr-label').fill('GPIO系初期化');
  await page.locator('#btn-tr-add').click();
  await expect(page.locator('#tr-note')).toContainText('登録しました');
  await expect(page.locator('#tr-pick option')).toHaveCount(2);

  // 別の図に書き換えても登録は残り、そのまま比べられる (相手のパスは打たない)
  await typeDsl(page, CAN);
  await page.locator('#tr-pick').selectOption({ label: 'GPIO系初期化' });
  await page.locator('#btn-td-run').click();
  await expect(page.locator('#td-list')).toBeVisible();
  await expect(page.locator('#td-summary')).toContainText('雛形どおり');
});

test('登録した雛形に無い行だけが「この図だけ」で出る', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, UART);
  await openCompare(page);
  await page.locator('#tr-label').fill('GPIO系初期化');
  await page.locator('#btn-tr-add').click();

  await typeDsl(page, CAN_PLUS);
  await page.locator('#tr-pick').selectOption({ label: 'GPIO系初期化' });
  await page.locator('#btn-td-run').click();
  await expect(page.locator('#td-summary')).toContainText('追加 1');
  const first = page.locator('.td-row').first();
  await expect(first).toHaveAttribute('data-td-kind', 'added');
  await expect(first).toContainText(':CANビットレートを設定;');
});

test('登録はページを開き直しても残る', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, UART);
  await openCompare(page);
  await page.locator('#tr-label').fill('GPIO系初期化');
  await page.locator('#btn-tr-add').click();
  await expect(page.locator('#tr-note')).toContainText('登録しました');

  await page.reload();
  await page.waitForTimeout(1200);
  await openCompare(page);
  await expect(page.locator('#tr-pick option')).toContainText(['参照図を雛形にする', 'GPIO系初期化']);
  // 残っているだけでなく、そのまま比べられる (これが登録の値打ち)
  await typeDsl(page, CAN);
  await page.locator('#tr-pick').selectOption({ label: 'GPIO系初期化' });
  await expect(page.locator('#tr-note')).toContainText('雛形「GPIO系初期化」');
  await page.locator('#btn-td-run').click();
  await expect(page.locator('#td-summary')).toContainText('雛形どおり');
});

test('選んだ雛形の出どころ (どの図のいつの登録か) が画面に出る', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, UART);
  await openCompare(page);
  await page.locator('#tr-label').fill('GPIO系初期化');
  await page.locator('#btn-tr-add').click();
  await page.locator('#tr-pick').selectOption({ label: 'GPIO系初期化' });
  await expect(page.locator('#tr-note')).toContainText('雛形「GPIO系初期化」');
});

test('登録を消せば一覧から消え、参照図に戻る', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, UART);
  await openCompare(page);
  await page.locator('#tr-label').fill('GPIO系初期化');
  await page.locator('#btn-tr-add').click();
  await expect(page.locator('#tr-pick option')).toHaveCount(2);

  await page.locator('#tr-pick').selectOption({ label: 'GPIO系初期化' });
  await page.locator('#btn-tr-del').click();
  await expect(page.locator('#tr-note')).toContainText('登録を消しました');
  await expect(page.locator('#tr-pick option')).toHaveCount(1);
});

test('雛形も参照図も無ければ、登録すれば比べられると言う', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, UART);
  await openCompare(page);
  await page.locator('#btn-td-run').click();
  await expect(page.locator('#td-summary')).toContainText('雛形に登録');
});
