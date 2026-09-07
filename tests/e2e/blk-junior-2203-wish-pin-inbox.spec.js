// @ts-check
// BLK-junior-20260907-2203-wish: 指摘は 1 図ずつにしか付かず、未対応がどこに残っているかは
// 図を 1 枚ずつ開いて 📌 のバッジを見て回るしかなかった。
// 保存フォルダ全体の未対応を 1 画面に出し、行を押すとその図の該当行へ飛ぶ、を実機で見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('./helpers');

const DIR = saveDirFor(__filename);

function pin(id, state, author, text, anchor) {
  return "' @pin " + [id, state, author, '2026-09-07T22:23', anchor, text].join('|');
}

// adc: reviewer の未読 1・primary の既読 1、spi: primary の未読 2、
// uart: 自分 (junior) の未読 1、gpio: 指摘なし。
const FILES = {
  J2203_adc_state: [
    '@startuml', '[*] --> Idle', 'Idle --> Busy : Adc_Start',
    pin('1', 'open', 'reviewer', '対応する method が無い', 'Idle --> Busy : Adc_Start'),
    pin('2', 'read', 'primary', '初期状態の名前', '[*] --> Idle'),
    '@enduml',
  ].join('\n'),
  J2203_spi_state: [
    '@startuml', '[*] --> Ready', 'Ready --> Send : Spi_Tx', 'Send --> Ready : Spi_Ack',
    pin('1', 'open', 'primary', 'Fault 遷移が無い', 'Ready --> Send : Spi_Tx'),
    pin('2', 'open', 'primary', 'Ack の綴り', 'Send --> Ready : Spi_Ack'),
    '@enduml',
  ].join('\n'),
  J2203_uart_state: [
    '@startuml', '[*] --> Off', 'Off --> On : Uart_Open',
    pin('1', 'open', 'junior', '自分のメモ', 'Off --> On : Uart_Open'),
    '@enduml',
  ].join('\n'),
  J2203_gpio_state: ['@startuml', '[*] --> Low', 'Low --> High : Gpio_Set', '@enduml'].join('\n'),
};

async function boot(page) {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
  await gotoApp(page);
}

async function clearDir(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

async function putFiles(page) {
  await page.evaluate(async (a) => {
    for (const name of Object.keys(a.files)) {
      await fetch('/autosave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: name, dir: a.dir, dsl: a.files[name] }),
      });
    }
  }, { files: FILES, dir: DIR });
}

async function openInbox(page) {
  await page.locator('#btn-tab-inbox').click();
  await page.waitForSelector('#inbox-panel.open .ib-head');
  await page.waitForFunction(() => {
    var h = document.querySelector('#inbox-panel .ib-head');
    return h && h.textContent.indexOf('読んでいます') < 0;
  });
}

test.describe('BLK-junior-2203-wish: 図をまたいだ指摘の受信箱', () => {
  test.beforeEach(async ({ page }) => {
    await boot(page);
    await clearDir(page);
    await putFiles(page);
    await page.waitForTimeout(300);
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
  });

  test('1 クリックで、未対応の指摘がどの図に何件あるかが出る', async ({ page }) => {
    await openInbox(page);
    const head = await page.locator('#inbox-panel .ib-head').textContent();
    expect(head).toContain('未対応 4 件');
    expect(head).toContain('3 図');
    // 未対応の多い図が先頭 (今日どれから直すかを上から選べる)
    const docs = await page.locator('#inbox-panel .ib-group').evaluateAll(
      (els) => els.map((e) => e.getAttribute('data-doc')));
    expect(docs[0]).toBe('J2203_spi_state');
    expect(docs).toContain('J2203_adc_state');
    expect(docs).toContain('J2203_uart_state');
    // 指摘の無い図は並ばない
    expect(docs).not.toContain('J2203_gpio_state');
    // 既読 (primary の #2) は既定で出さない
    await expect(page.locator('#inbox-panel .ib-row')).toHaveCount(4);
    expect(await page.locator('#inbox-panel').textContent()).not.toContain('初期状態の名前');
  });

  test('自分の名前を入れると、自分が書いた指摘が受信箱から消える', async ({ page }) => {
    await openInbox(page);
    expect(await page.locator('#inbox-panel').textContent()).toContain('自分のメモ');
    await page.locator('#ib-me').fill('junior');
    await page.locator('#ib-me').blur();
    await page.waitForTimeout(200);
    expect(await page.locator('#inbox-panel').textContent()).not.toContain('自分のメモ');
    await expect(page.locator('#inbox-panel .ib-row')).toHaveCount(3);
    expect(await page.locator('#btn-tab-inbox').textContent()).toContain('3/3');
  });

  test('「未対応だけ」を外すと既読の指摘も並ぶ', async ({ page }) => {
    await openInbox(page);
    await page.locator('#ib-unread').uncheck();
    await page.waitForTimeout(200);
    await expect(page.locator('#inbox-panel .ib-row')).toHaveCount(5);
    expect(await page.locator('#inbox-panel').textContent()).toContain('初期状態の名前');
  });

  test('行を押すとその図がタブで開き、指摘の行が選ばれる', async ({ page }) => {
    await openInbox(page);
    await page.locator('#inbox-panel .ib-row[data-doc="J2203_adc_state"]').first().click();
    await page.waitForTimeout(1500);
    const text = await page.locator('#editor').inputValue();
    expect(text).toContain('Idle --> Busy : Adc_Start');
    const sel = await page.evaluate(() => {
      const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      return ed.value.slice(ed.selectionStart, ed.selectionEnd);
    });
    expect(sel.trim()).toBe('Idle --> Busy : Adc_Start');
    // その図の 📌 も同じ指摘を持っている
    // (BLK-junior-20260908-0103-wish: 件数は未対応 = 対応済み以外。既読の 1 件も未対応)
    expect(await page.locator('#btn-tab-pins').textContent()).toContain('2/2');
  });

  test('編集中の未保存の指摘も受信箱に出る', async ({ page }) => {
    await openInbox(page);
    await page.locator('#inbox-panel .ib-row[data-doc="J2203_spi_state"]').first().click();
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      ed.value = ed.value.replace('@enduml',
        "' @pin 3|open|reviewer|2026-09-07T22:40|Ready --> Send : Spi_Tx|保存前の指摘\n@enduml");
      ed.dispatchEvent(new Event('input'));
    });
    await page.waitForTimeout(600);
    await openInbox(page);
    expect(await page.locator('#inbox-panel').textContent()).toContain('保存前の指摘');
  });
});
